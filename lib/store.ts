import crypto from "node:crypto";
import { google } from "googleapis";
import { getEnv, hasGoogleSheetsConfig, hasGoogleSheetsWriteConfig } from "@/lib/env";
import { hashPin, verifyPin } from "@/lib/security";
import { createSeedMembers, createSeedProducts } from "@/lib/seed-data";
import type {
  DashboardSummary,
  DailySalesSummary,
  ExternalBuyer,
  InventoryAdjustment,
  InventoryItem,
  Member,
  PaymentStatus,
  PayerSummary,
  Product,
  ProductRankingEntry,
  PublicMember,
  Purchase,
  PurchaseInput,
  RankingEntry,
  Rankings,
  Suggestion,
  SyncQueueEntry,
} from "@/lib/types";
import {
  calcTotal,
  createPaymentStatus,
  formatKoreaDateTimeSecond,
  formatWonCell,
  parseLegacySheetDate,
  parseSheetNumber,
  purchaseIsPending,
  sheetDateKey,
  summarizeItems,
  todayKey,
} from "@/lib/utils";

const LEGACY_LEDGER_TAB = "거래내역";
const LEGACY_INVENTORY_TAB = "재고 현황";
const APP_MEMBERS_TAB = "app_members";
const APP_PRODUCTS_TAB = "app_products";
const APP_PURCHASE_META_TAB = "app_purchase_meta";
const APP_INVENTORY_ADJUSTMENTS_TAB = "app_inventory_adjustments";
const APP_SETTINGS_TAB = "app_settings";
const APP_SYNC_QUEUE_TAB = "app_sync_queue";
const SUGGESTIONS_TAB = "suggestions";
const PURCHASE_META_FIELDS = [
  "purchase_id",
  "timestamp",
  "date",
  "buyer_type",
  "member_id",
  "member_type",
  "cohort",
  "grade",
  "name",
  "external_phone",
  "item_summary",
  "raw_items",
  "total_amount",
  "payment_method",
  "payment_status",
  "confirmed_by",
  "confirmed_at",
  "note",
  "synced_at",
  "idempotency_key",
  "device_id",
  "sheet_row_numbers",
  "payment_recorded_at_iso",
  "payment_recorded_at_kst",
] as const;

type MemberFilters = {
  type?: string | null;
  cohort?: string | null;
  grade?: string | null;
  q?: string | null;
};

type VerifyResult =
  | { ok: true; member: PublicMember }
  | { ok: false; reason: "not_found" | "locked" | "invalid_pin"; remainingAttempts?: number; lockedUntil?: string };

type DataState = {
  members: Member[];
  products: Product[];
  purchases: Purchase[];
  suggestions: Suggestion[];
  syncQueue: SyncQueueEntry[];
  inventoryAdjustments: InventoryAdjustment[];
  pinAttempts: Record<string, { attempts: number; lockedUntil?: string }>;
  idempotencyKeys: string[];
};

type SheetsStateCache = {
  value?: DataState;
  expiresAt: number;
  promise?: Promise<DataState>;
};

type Source = {
  listMembers(filters?: MemberFilters): Promise<PublicMember[]>;
  getMember(memberId: string): Promise<Member | null>;
  verifyMemberPin(memberId: string, pin: string): Promise<VerifyResult>;
  listProducts(activeOnly?: boolean, options?: { forceRefresh?: boolean }): Promise<Product[]>;
  createPurchase(input: PurchaseInput): Promise<{ purchase: Purchase; syncStatus: "synced" | "queued" }>;
  getMemberLedger(memberId: string): Promise<{ purchases: Purchase[]; pendingAmount: number }>;
  createSuggestion(input: Omit<Suggestion, "suggestionId" | "status" | "createdAt" | "updatedAt">): Promise<Suggestion>;
  getDashboardSummary(): Promise<DashboardSummary>;
  getRankings(): Promise<Rankings>;
  getInventory(): Promise<{ items: InventoryItem[]; adjustments: InventoryAdjustment[] }>;
  adjustInventory(input: {
    productId?: string;
    sheetItemName: string;
    delta: number;
    reason?: string;
    createdBy: string;
  }): Promise<InventoryAdjustment>;
  updatePurchaseStatus(purchaseId: string, paymentStatus: PaymentStatus, confirmedBy: string): Promise<Purchase | null>;
  cancelPurchase(purchaseId: string, confirmedBy: string): Promise<Purchase | null>;
  createProduct(input: Pick<Product, "name" | "price" | "active" | "sortOrder" | "sheetItemName" | "aliases" | "lowStockThreshold" | "imageUrl">): Promise<Product>;
  updateProduct(productId: string, input: Partial<Pick<Product, "name" | "price" | "active" | "sortOrder" | "sheetItemName" | "aliases" | "lowStockThreshold" | "imageUrl">>): Promise<Product | null>;
  createMember(input: Omit<Member, "memberId" | "pinHash" | "pinSalt" | "createdAt" | "updatedAt"> & { pin?: string }): Promise<PublicMember>;
  updateMember(memberId: string, input: Partial<Omit<Member, "memberId" | "pinHash" | "pinSalt" | "createdAt" | "updatedAt">>): Promise<PublicMember | null>;
  resetMemberPin(memberId: string, pin: string): Promise<PublicMember | null>;
  refreshSheetsState(): Promise<{ refreshedAt: string; pending: number; purchases: number; products: number; members: number }>;
  retrySyncQueue(): Promise<{ retried: number; remaining: number }>;
};

export class StockError extends Error {
  constructor(
    message: string,
    public shortages: Array<{ productId: string; name: string; requested: number; available: number }>,
  ) {
    super(message);
  }
}

function publicMember(member: Member): PublicMember {
  const rest = { ...member };
  delete (rest as Partial<Member>).pinHash;
  delete (rest as Partial<Member>).pinSalt;
  return rest;
}

function parseJsonArray(value?: string) {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as number[];
  } catch {
    return undefined;
  }
}

function parseJsonStringArray(value?: string) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value);
}

function buyerKeyForPurchase(purchase: Pick<Purchase, "buyerType" | "memberId" | "nameSnapshot">) {
  return purchase.buyerType === "external" ? `external:${purchase.nameSnapshot}` : purchase.memberId;
}

function normalizeExternalBuyer(input: ExternalBuyer) {
  return {
    name: input.name.trim(),
    phoneNumber: input.phoneNumber?.trim() || undefined,
  };
}

function createExternalMemberId(name: string) {
  return `external:${name.trim().toLowerCase()}`;
}

function findProductBySheetName(products: Product[], sheetItemName: string) {
  return products.find((product) => {
    const names = [product.name, product.sheetItemName, ...(product.aliases ?? [])].filter(Boolean);
    return names.some((name) => name === sheetItemName);
  });
}

function inventoryFromProducts(products: Product[]): InventoryItem[] {
  return [...products]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((product) => {
      const sheetItemName = product.sheetItemName ?? product.name;
      return {
        productId: product.productId,
        name: product.name,
        sheetItemName,
        initialStock: product.stock ?? 0,
        soldQuantity: 0,
        currentStock: product.stock ?? 0,
        lowStockThreshold: product.lowStockThreshold ?? 5,
        active: product.active,
      };
    });
}

function applyInventoryToProducts(products: Product[], inventory: InventoryItem[]) {
  return products.map((product) => {
    const sheetItemName = product.sheetItemName ?? product.name;
    const item = inventory.find((candidate) => candidate.sheetItemName === sheetItemName);
    return item ? { ...product, stock: item.currentStock } : product;
  });
}

function serializeMembers(members: Member[]) {
  return members.map((member) => ({
    member_id: member.memberId,
    type: member.type,
    cohort: member.cohort ?? "",
    grade: member.grade ?? "",
    name: member.name,
    gender: member.gender ?? "",
    status: member.status,
    is_admin: member.isAdmin ? "true" : "false",
    phone_number: member.phoneNumber ?? "",
    sms_opt_in: member.smsOptIn ? "true" : "false",
    kiosk_setup_completed_at: member.kioskSetupCompletedAt ?? "",
    pin_hash: member.pinHash,
    pin_salt: member.pinSalt,
    face_descriptor: member.faceDescriptor ? stringifyJson(member.faceDescriptor) : "",
    created_at: member.createdAt,
    updated_at: member.updatedAt,
  }));
}

function serializeProducts(products: Product[]) {
  return products.map((product) => ({
    product_id: product.productId,
    name: product.name,
    sheet_item_name: product.sheetItemName ?? product.name,
    aliases: stringifyJson(product.aliases ?? []),
    price: String(product.price),
    active: product.active ? "true" : "false",
    sort_order: String(product.sortOrder),
    low_stock_threshold: String(product.lowStockThreshold ?? 5),
    image_url: product.imageUrl ?? "",
    created_at: product.createdAt,
    updated_at: product.updatedAt,
  }));
}

function serializeSuggestions(suggestions: Suggestion[]) {
  return suggestions.map((suggestion) => ({
    suggestion_id: suggestion.suggestionId,
    member_id: suggestion.memberId ?? "",
    member_name: suggestion.memberName ?? "",
    product_name: suggestion.productName,
    expected_price: suggestion.expectedPrice ? String(suggestion.expectedPrice) : "",
    reason: suggestion.reason ?? "",
    status: suggestion.status,
    created_at: suggestion.createdAt,
    updated_at: suggestion.updatedAt,
  }));
}

function serializeSyncQueue(entries: SyncQueueEntry[]) {
  return entries.map((entry) => ({
    queue_id: entry.queueId,
    kind: entry.kind,
    payload: entry.payload,
    status: entry.status,
    error_message: entry.errorMessage ?? "",
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  }));
}

function serializeAdjustments(entries: InventoryAdjustment[]) {
  return entries.map((entry) => ({
    adjustment_id: entry.adjustmentId,
    product_id: entry.productId ?? "",
    sheet_item_name: entry.sheetItemName,
    delta: String(entry.delta),
    reason: entry.reason ?? "",
    previous_initial_stock: String(entry.previousInitialStock),
    next_initial_stock: String(entry.nextInitialStock),
    created_by: entry.createdBy,
    created_at: entry.createdAt,
  }));
}

function serializePurchaseMeta(purchase: Purchase) {
  return {
    purchase_id: purchase.purchaseId,
    timestamp: purchase.timestamp,
    date: purchase.date,
    buyer_type: purchase.buyerType,
    member_id: purchase.memberId,
    member_type: purchase.memberTypeSnapshot ?? "",
    cohort: purchase.cohortSnapshot ?? "",
    grade: purchase.gradeSnapshot ?? "",
    name: purchase.nameSnapshot,
    external_phone: purchase.externalBuyerPhone ?? "",
    item_summary: purchase.itemSummary,
    raw_items: stringifyJson(purchase.items),
    total_amount: String(purchase.totalAmount),
    payment_method: purchase.paymentMethod,
    payment_status: purchase.paymentStatus,
    confirmed_by: purchase.confirmedBy ?? "",
    confirmed_at: purchase.confirmedAt ?? "",
    note: purchase.note ?? "",
    synced_at: purchase.syncedAt ?? "",
    idempotency_key: purchase.idempotencyKey ?? "",
    device_id: purchase.deviceId ?? "",
    sheet_row_numbers: (purchase.sheetRowNumbers ?? []).join(","),
    payment_recorded_at_iso: purchase.timestamp,
    payment_recorded_at_kst: formatKoreaDateTimeSecond(purchase.timestamp),
  } satisfies Record<(typeof PURCHASE_META_FIELDS)[number], string>;
}

function computeDashboardSummary(state: Pick<DataState, "purchases" | "syncQueue" | "products">): DashboardSummary {
  const inventory = inventoryFromProducts(state.products);
  const activePurchases = state.purchases.filter((purchase) => purchase.paymentStatus !== "cancelled");
  const todays = activePurchases.filter((purchase) => purchase.date === todayKey());
  const cashPending = activePurchases.filter((purchase) => purchase.paymentStatus === "cash_pending");
  const transferPending = activePurchases.filter((purchase) => purchase.paymentStatus === "transfer_pending");
  const paid = activePurchases.filter(
    (purchase) => purchase.paymentStatus === "cash_paid" || purchase.paymentStatus === "transfer_paid",
  );
  const dailyMap = new Map<string, DailySalesSummary>();
  const payerMap = new Map<string, PayerSummary>();

  for (const purchase of activePurchases) {
    const day = dailyMap.get(purchase.date) ?? {
      date: purchase.date,
      totalAmount: 0,
      purchaseCount: 0,
    };
    day.totalAmount += purchase.totalAmount;
    day.purchaseCount += 1;
    dailyMap.set(purchase.date, day);

    if (purchaseIsPending(purchase)) {
      const key = buyerKeyForPurchase(purchase);
      const summary =
        payerMap.get(key) ??
        {
          buyerKey: key,
          name: purchase.nameSnapshot,
          buyerType: purchase.buyerType,
          phoneNumber: purchase.externalBuyerPhone,
          cashPendingAmount: 0,
          transferPendingAmount: 0,
          pendingAmount: 0,
          purchaseIds: [],
          cashPurchaseIds: [],
          transferPurchaseIds: [],
        };
      if (purchase.paymentStatus === "cash_pending") {
        summary.cashPendingAmount += purchase.totalAmount;
        summary.cashPurchaseIds.push(purchase.purchaseId);
      }
      if (purchase.paymentStatus === "transfer_pending" || purchase.paymentStatus === "unpaid") {
        summary.transferPendingAmount += purchase.totalAmount;
        summary.transferPurchaseIds.push(purchase.purchaseId);
      }
      summary.pendingAmount += purchase.totalAmount;
      summary.purchaseIds.push(purchase.purchaseId);
      payerMap.set(key, summary);
    }
  }

  return {
    todayTotal: todays.reduce((sum, purchase) => sum + purchase.totalAmount, 0),
    cumulativeTotal: activePurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0),
    cashPendingCount: cashPending.length,
    cashPendingAmount: cashPending.reduce((sum, purchase) => sum + purchase.totalAmount, 0),
    transferPendingCount: transferPending.length,
    transferPendingAmount: transferPending.reduce((sum, purchase) => sum + purchase.totalAmount, 0),
    paidAmount: paid.reduce((sum, purchase) => sum + purchase.totalAmount, 0),
    unpaidEstimate: [...cashPending, ...transferPending].reduce((sum, purchase) => sum + purchase.totalAmount, 0),
    unconfirmedAmount: [...cashPending, ...transferPending].reduce((sum, purchase) => sum + purchase.totalAmount, 0),
    recentPurchases: [...state.purchases].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 30),
    queuedSyncCount: state.syncQueue.filter((entry) => entry.status === "pending").length,
    lowStockProducts: inventory.filter((item) => item.active && item.currentStock <= item.lowStockThreshold),
    dailySales: [...dailyMap.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14),
    payerSummaries: [...payerMap.values()].sort((a, b) => b.pendingAmount - a.pendingAmount),
    inventory,
  };
}

function computeRankings(purchases: Purchase[]): Rankings {
  const buyerMap = new Map<string, Omit<RankingEntry, "rank"> & { itemTotals: Map<string, { quantity: number; amount: number }> }>();
  const productMap = new Map<string, Omit<ProductRankingEntry, "rank">>();

  for (const purchase of purchases) {
    if (purchase.paymentStatus === "cancelled") continue;
    const buyerKey = buyerKeyForPurchase(purchase);
    const buyer =
      buyerMap.get(buyerKey) ??
      {
        buyerKey,
        name: purchase.nameSnapshot,
        buyerType: purchase.buyerType,
        totalAmount: 0,
        purchaseCount: 0,
        favoriteItem: undefined,
        itemTotals: new Map<string, { quantity: number; amount: number }>(),
      };
    buyer.totalAmount += purchase.totalAmount;
    buyer.purchaseCount += 1;

    for (const item of purchase.items) {
      const itemTotal = buyer.itemTotals.get(item.nameSnapshot) ?? { quantity: 0, amount: 0 };
      itemTotal.quantity += item.quantity;
      itemTotal.amount += item.lineTotal;
      buyer.itemTotals.set(item.nameSnapshot, itemTotal);

      const product = productMap.get(item.nameSnapshot) ?? {
        productName: item.nameSnapshot,
        quantity: 0,
        totalAmount: 0,
      };
      product.quantity += item.quantity;
      product.totalAmount += item.lineTotal;
      productMap.set(item.nameSnapshot, product);
    }
    const favorite = [...buyer.itemTotals.entries()].sort((a, b) => b[1].quantity - a[1].quantity)[0];
    buyer.favoriteItem = favorite?.[0];
    buyerMap.set(buyerKey, buyer);
  }

  return {
    buyers: [...buyerMap.values()]
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .map((entry, index) => ({
        rank: index + 1,
        buyerKey: entry.buyerKey,
        name: entry.name,
        buyerType: entry.buyerType,
        totalAmount: entry.totalAmount,
        purchaseCount: entry.purchaseCount,
        favoriteItem: entry.favoriteItem,
      })),
    products: [...productMap.values()]
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .map((entry, index) => ({ ...entry, rank: index + 1 })),
  };
}

function resolveBuyer(state: DataState, input: PurchaseInput) {
  if (input.memberId) {
    const member = state.members.find((candidate) => candidate.memberId === input.memberId);
    if (!member) throw new Error("사용자를 찾을 수 없습니다.");
    return {
      buyerType: "member" as const,
      memberId: member.memberId,
      memberTypeSnapshot: member.type,
      cohortSnapshot: member.cohort,
      gradeSnapshot: member.grade,
      nameSnapshot: member.name,
      externalBuyerPhone: undefined,
    };
  }

  if (!input.externalBuyer) throw new Error("구매자를 선택해 주세요.");
  const externalBuyer = normalizeExternalBuyer(input.externalBuyer);
  if (input.paymentMethod === "transfer" && !externalBuyer.phoneNumber) {
    throw new Error("외부인 계좌이체는 미납 안내를 위해 연락처가 필요합니다.");
  }
  return {
    buyerType: "external" as const,
    memberId: createExternalMemberId(externalBuyer.name),
    memberTypeSnapshot: undefined,
    cohortSnapshot: undefined,
    gradeSnapshot: undefined,
    nameSnapshot: externalBuyer.name,
    externalBuyerPhone: externalBuyer.phoneNumber,
  };
}

function buildPurchase(state: DataState, input: PurchaseInput): Purchase {
  const buyer = resolveBuyer(state, input);
  const activeProducts = state.products.filter((product) => product.active);
  const shortages: StockError["shortages"] = [];
  const items = input.items.map((item) => {
    const product = activeProducts.find((candidate) => candidate.productId === item.productId);
    if (!product) throw new Error(`상품을 찾을 수 없습니다: ${item.productId}`);
    const available = product.stock ?? Number.POSITIVE_INFINITY;
    if (available < item.quantity) {
      shortages.push({
        productId: product.productId,
        name: product.name,
        requested: item.quantity,
        available: Number.isFinite(available) ? available : 0,
      });
    }
    return {
      productId: product.productId,
      nameSnapshot: product.name,
      sheetItemNameSnapshot: product.sheetItemName ?? product.name,
      priceSnapshot: product.price,
      quantity: item.quantity,
      lineTotal: product.price * item.quantity,
    };
  });

  if (shortages.length) {
    throw new StockError("재고보다 많은 수량은 구매할 수 없습니다.", shortages);
  }

  const timestamp = new Date().toISOString();
  return {
    purchaseId: `purchase-${crypto.randomUUID()}`,
    timestamp,
    date: timestamp.slice(0, 10),
    ...buyer,
    items,
    itemSummary: summarizeItems(items),
    totalAmount: calcTotal(items),
    paymentMethod: input.paymentMethod,
    paymentStatus: createPaymentStatus(input.paymentMethod),
    deviceId: input.deviceId,
    note: input.note,
    syncedAt: timestamp,
    idempotencyKey: input.idempotencyKey,
  };
}

function decrementPurchasedStock(products: Product[], purchase: Purchase) {
  for (const item of purchase.items) {
    const product = products.find((candidate) => candidate.productId === item.productId);
    if (product && typeof product.stock === "number") {
      product.stock = Math.max(0, product.stock - item.quantity);
      product.updatedAt = new Date().toISOString();
    }
  }
}

function createMemoryState(): DataState {
  return {
    members: createSeedMembers(),
    products: createSeedProducts(),
    purchases: [],
    suggestions: [],
    syncQueue: [],
    inventoryAdjustments: [],
    pinAttempts: {},
    idempotencyKeys: [],
  };
}

const SHEETS_STATE_CACHE_TTL_MS = 15_000;
const SHEETS_STATE_STALE_RETRY_MS = 5_000;

const globalStore = globalThis as typeof globalThis & {
  __NCSTORE_MEMORY__?: DataState;
  __NCSTORE_SHEETS_STATE_CACHE__?: SheetsStateCache;
};

function memoryState() {
  if (!globalStore.__NCSTORE_MEMORY__) {
    globalStore.__NCSTORE_MEMORY__ = createMemoryState();
  }
  return globalStore.__NCSTORE_MEMORY__;
}

function memorySource(): Source {
  const state = memoryState();

  return {
    async listMembers(filters) {
      return state.members
        .filter((member) => {
          if (filters?.type && member.type !== filters.type) return false;
          if (filters?.cohort && member.cohort !== filters.cohort) return false;
          if (filters?.grade && member.grade !== filters.grade) return false;
          if (filters?.q && !member.name.toLowerCase().includes(filters.q.toLowerCase())) return false;
          return true;
        })
        .map(publicMember);
    },
    async getMember(memberId) {
      return state.members.find((member) => member.memberId === memberId) ?? null;
    },
    async verifyMemberPin(memberId, pin) {
      const member = state.members.find((candidate) => candidate.memberId === memberId);
      if (!member) return { ok: false, reason: "not_found" } as const;

      const entry = state.pinAttempts[memberId];
      if (entry?.lockedUntil && new Date(entry.lockedUntil) > new Date()) {
        return { ok: false, reason: "locked", lockedUntil: entry.lockedUntil } as const;
      }

      if (verifyPin(pin, member.pinHash, member.pinSalt)) {
        delete state.pinAttempts[memberId];
        return { ok: true, member: publicMember(member) };
      }

      const attempts = (entry?.attempts ?? 0) + 1;
      const nextEntry =
        attempts >= 5
          ? {
              attempts,
              lockedUntil: new Date(Date.now() + 60_000).toISOString(),
            }
          : { attempts };
      state.pinAttempts[memberId] = nextEntry;
      return {
        ok: false,
        reason: attempts >= 5 ? "locked" : "invalid_pin",
        remainingAttempts: Math.max(0, 5 - attempts),
        lockedUntil: nextEntry.lockedUntil,
      } as const;
    },
    async listProducts(activeOnly = true) {
      return [...state.products]
        .filter((product) => (activeOnly ? product.active : true))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },
    async createPurchase(input) {
      if (state.idempotencyKeys.includes(input.idempotencyKey)) {
        const existing = state.purchases.find((purchase) => purchase.idempotencyKey === input.idempotencyKey);
        if (!existing) throw new Error("중복 구매를 처리할 수 없습니다.");
        return { purchase: existing, syncStatus: "synced" as const };
      }

      const purchase = buildPurchase(state, input);
      state.idempotencyKeys.push(input.idempotencyKey);
      decrementPurchasedStock(state.products, purchase);
      state.purchases.push(purchase);
      return { purchase, syncStatus: "synced" as const };
    },
    async getMemberLedger(memberId) {
      const purchases = state.purchases
        .filter((purchase) => purchase.memberId === memberId)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      const pendingAmount = purchases.filter(purchaseIsPending).reduce((sum, purchase) => sum + purchase.totalAmount, 0);
      return { purchases, pendingAmount };
    },
    async createSuggestion(input) {
      const timestamp = new Date().toISOString();
      const suggestion: Suggestion = {
        suggestionId: `suggestion-${crypto.randomUUID()}`,
        status: "reviewing",
        createdAt: timestamp,
        updatedAt: timestamp,
        ...input,
      };
      state.suggestions.push(suggestion);
      return suggestion;
    },
    async getDashboardSummary() {
      return computeDashboardSummary(state);
    },
    async getRankings() {
      return computeRankings(state.purchases);
    },
    async getInventory() {
      return {
        items: inventoryFromProducts(state.products),
        adjustments: [...state.inventoryAdjustments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      };
    },
    async adjustInventory(input) {
      const product =
        state.products.find((candidate) => candidate.productId === input.productId) ??
        findProductBySheetName(state.products, input.sheetItemName);
      const previous = product?.stock ?? 0;
      const next = Math.max(0, previous + input.delta);
      if (product) {
        product.stock = next;
        product.updatedAt = new Date().toISOString();
      }
      const adjustment: InventoryAdjustment = {
        adjustmentId: `adjustment-${crypto.randomUUID()}`,
        productId: product?.productId ?? input.productId,
        sheetItemName: input.sheetItemName,
        delta: input.delta,
        reason: input.reason,
        previousInitialStock: previous,
        nextInitialStock: next,
        createdBy: input.createdBy,
        createdAt: new Date().toISOString(),
      };
      state.inventoryAdjustments.push(adjustment);
      return adjustment;
    },
    async updatePurchaseStatus(purchaseId, paymentStatus, confirmedBy) {
      const purchase = state.purchases.find((candidate) => candidate.purchaseId === purchaseId);
      if (!purchase) return null;
      purchase.paymentStatus = paymentStatus;
      purchase.confirmedBy = confirmedBy;
      purchase.confirmedAt = new Date().toISOString();
      return purchase;
    },
    async cancelPurchase(purchaseId, confirmedBy) {
      return this.updatePurchaseStatus(purchaseId, "cancelled", confirmedBy);
    },
    async createProduct(input) {
      const now = new Date().toISOString();
      const product: Product = {
        productId: `product-${crypto.randomUUID()}`,
        sheetItemName: input.sheetItemName ?? input.name,
        aliases: input.aliases ?? [],
        lowStockThreshold: input.lowStockThreshold ?? 5,
        createdAt: now,
        updatedAt: now,
        ...input,
      };
      state.products.push(product);
      return product;
    },
    async updateProduct(productId, input) {
      const product = state.products.find((candidate) => candidate.productId === productId);
      if (!product) return null;
      Object.assign(product, input, { updatedAt: new Date().toISOString() });
      return product;
    },
    async createMember(input) {
      const now = new Date().toISOString();
      const { pinHash, pinSalt } = hashPin(input.pin ?? getEnv().defaultMemberPin);
      const member: Member = {
        memberId: `member-${crypto.randomUUID()}`,
        pinHash,
        pinSalt,
        createdAt: now,
        updatedAt: now,
        ...input,
      };
      delete (member as Member & { pin?: string }).pin;
      state.members.push(member);
      return publicMember(member);
    },
    async updateMember(memberId, input) {
      const member = state.members.find((candidate) => candidate.memberId === memberId);
      if (!member) return null;
      Object.assign(member, input, { updatedAt: new Date().toISOString() });
      return publicMember(member);
    },
    async resetMemberPin(memberId, pin) {
      const member = state.members.find((candidate) => candidate.memberId === memberId);
      if (!member) return null;
      const { pinHash, pinSalt } = hashPin(pin);
      member.pinHash = pinHash;
      member.pinSalt = pinSalt;
      member.updatedAt = new Date().toISOString();
      return publicMember(member);
    },
    async refreshSheetsState() {
      return {
        refreshedAt: new Date().toISOString(),
        pending: state.syncQueue.filter((entry) => entry.status === "pending").length,
        purchases: state.purchases.length,
        products: state.products.length,
        members: state.members.length,
      };
    },
    async retrySyncQueue() {
      state.syncQueue = [];
      return { retried: 0, remaining: 0 };
    },
  };
}

type RowWithNumber = Record<string, string> & { __rowNumber: number };

function sheetRange(tab: string, range = "A:ZZ") {
  return `'${tab.replace(/'/g, "''")}'!${range}`;
}

function columnLetter(index: number) {
  let value = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }
  return value;
}

class SheetsClient {
  private writable = hasGoogleSheetsWriteConfig();

  private auth = this.writable
    ? new google.auth.JWT({
        email: getEnv().googleServiceAccountEmail,
        key: getEnv().googlePrivateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      })
    : undefined;

  private sheets = google.sheets({
    version: "v4",
    auth: this.auth ?? getEnv().googleSheetsApiKey,
  });

  private spreadsheetId = getEnv().googleSpreadsheetId!;

  private assertWritable() {
    if (!this.writable) {
      throw new Error("Google Sheets 쓰기에는 GOOGLE_SERVICE_ACCOUNT_EMAIL과 GOOGLE_PRIVATE_KEY가 필요합니다.");
    }
  }

  async ensureSheet(tab: string) {
    this.assertWritable();
    const spreadsheet = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    const exists = spreadsheet.data.sheets?.some((sheet) => sheet.properties?.title === tab);
    if (exists) return;
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tab } } }],
      },
    });
  }

  async getValues(tab: string) {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: sheetRange(tab),
    });
    return response.data.values ?? [];
  }

  async getSheetRows(tab: string): Promise<Array<Record<string, string>>> {
    try {
      const values = await this.getValues(tab);
      if (!values.length) return [];
      const [header, ...rows] = values;
      return rows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""])));
    } catch {
      return [];
    }
  }

  async getSheetRowsWithNumbers(tab: string): Promise<RowWithNumber[]> {
    const values = await this.getValues(tab);
    if (!values.length) return [];
    const [header, ...rows] = values;
    return rows.map((row, rowIndex) => ({
      ...Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""])),
      __rowNumber: rowIndex + 2,
    }));
  }

  async overwriteSheet(tab: string, rows: Array<Record<string, string>>) {
    this.assertWritable();
    await this.ensureSheet(tab);
    const keys = rows.length ? Object.keys(rows[0]) : [];
    const values = [keys, ...rows.map((row) => keys.map((key) => row[key] ?? ""))];
    await this.sheets.spreadsheets.values.clear({
      spreadsheetId: this.spreadsheetId,
      range: sheetRange(tab),
    });
    if (!keys.length) return;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: sheetRange(tab, "A1"),
      valueInputOption: "RAW",
      requestBody: { values },
    });
  }

  async updateHeader(tab: string, header: string[]) {
    this.assertWritable();
    await this.ensureSheet(tab);
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: sheetRange(tab, "A1"),
      valueInputOption: "RAW",
      requestBody: { values: [header] },
    });
  }

  async appendValues(tab: string, values: string[][]) {
    this.assertWritable();
    await this.ensureSheet(tab);
    const existing = await this.getValues(tab);
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: sheetRange(tab, "A1"),
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });
    const firstRow = existing.length + 1;
    return values.map((_row, index) => firstRow + index);
  }

  async updateCell(tab: string, rowNumber: number, columnIndex: number, value: string) {
    this.assertWritable();
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: sheetRange(tab, `${columnLetter(columnIndex)}${rowNumber}`),
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[value]] },
    });
  }
}

function parseMembers(rows: Array<Record<string, string>>) {
  return rows
    .filter((row) => row.member_id && row.name)
    .map((row) => ({
      memberId: row.member_id,
      type: row.type as Member["type"],
      cohort: (row.cohort || undefined) as Member["cohort"],
      grade: row.grade || undefined,
      name: row.name,
      gender: row.gender || undefined,
      status: (row.status || "active") as Member["status"],
      isAdmin: row.is_admin === "true",
      phoneNumber: row.phone_number || undefined,
      smsOptIn: row.sms_opt_in === "true",
      kioskSetupCompletedAt: row.kiosk_setup_completed_at || undefined,
      pinHash: row.pin_hash,
      pinSalt: row.pin_salt,
      faceDescriptor: parseJsonArray(row.face_descriptor),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

function parseProducts(rows: Array<Record<string, string>>) {
  return rows
    .filter((row) => row.product_id && row.name)
    .map((row) => ({
      productId: row.product_id,
      name: row.name,
      sheetItemName: row.sheet_item_name || row.name,
      aliases: parseJsonStringArray(row.aliases) ?? [],
      price: Number(row.price || 0),
      active: row.active !== "false",
      sortOrder: Number(row.sort_order || 0),
      lowStockThreshold: Number(row.low_stock_threshold || 5),
      imageUrl: row.image_url || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

function parseSuggestions(rows: Array<Record<string, string>>) {
  return rows
    .filter((row) => row.suggestion_id && row.product_name)
    .map((row) => ({
      suggestionId: row.suggestion_id,
      memberId: row.member_id || undefined,
      memberName: row.member_name || undefined,
      productName: row.product_name,
      expectedPrice: row.expected_price ? Number(row.expected_price) : undefined,
      reason: row.reason || undefined,
      status: (row.status || "reviewing") as Suggestion["status"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

function parseSyncQueue(rows: Array<Record<string, string>>) {
  return rows
    .filter((row) => row.queue_id)
    .map((row) => ({
      queueId: row.queue_id,
      kind: "purchase" as const,
      payload: row.payload,
      status: (row.status || "pending") as SyncQueueEntry["status"],
      errorMessage: row.error_message || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

function parseAdjustments(rows: Array<Record<string, string>>) {
  return rows
    .filter((row) => row.adjustment_id)
    .map((row) => ({
      adjustmentId: row.adjustment_id,
      productId: row.product_id || undefined,
      sheetItemName: row.sheet_item_name,
      delta: Number(row.delta || 0),
      reason: row.reason || undefined,
      previousInitialStock: Number(row.previous_initial_stock || 0),
      nextInitialStock: Number(row.next_initial_stock || 0),
      createdBy: row.created_by,
      createdAt: row.created_at,
    }));
}

function parsePurchaseMeta(rows: Array<Record<string, string>>) {
  return rows
    .filter((row) => row.purchase_id)
    .map((row) => ({
      purchaseId: row.purchase_id,
      timestamp: row.timestamp || row.payment_recorded_at_iso,
      date: row.date,
      buyerType: (row.buyer_type || "member") as Purchase["buyerType"],
      memberId: row.member_id,
      memberTypeSnapshot: (row.member_type || undefined) as Purchase["memberTypeSnapshot"],
      cohortSnapshot: row.cohort || undefined,
      gradeSnapshot: row.grade || undefined,
      nameSnapshot: row.name,
      externalBuyerPhone: row.external_phone || undefined,
      itemSummary: row.item_summary,
      items: (JSON.parse(row.raw_items || "[]") ?? []) as Purchase["items"],
      totalAmount: Number(row.total_amount || 0),
      paymentMethod: row.payment_method as Purchase["paymentMethod"],
      paymentStatus: (row.payment_status || "cash_paid") as Purchase["paymentStatus"],
      confirmedBy: row.confirmed_by || undefined,
      confirmedAt: row.confirmed_at || undefined,
      note: row.note || undefined,
      syncedAt: row.synced_at || undefined,
      idempotencyKey: row.idempotency_key || undefined,
      deviceId: row.device_id || undefined,
      sheetRowNumbers: row.sheet_row_numbers
        ? row.sheet_row_numbers.split(",").map((value) => Number(value.trim())).filter(Boolean)
        : [],
    }));
}

function readInventoryRows(rows: RowWithNumber[], products: Product[]) {
  return rows
    .filter((row) => readRowValue(row, ["품목", "품목명"]))
    .map((row) => {
      const sheetItemName = readRowValue(row, ["품목", "품목명"])!;
      const product = findProductBySheetName(products, sheetItemName);
      const initialStock = parseSheetNumber(readRowValue(row, ["초기재고(개수)", "기초재고"]));
      const incomingStock = parseSheetNumber(readRowValue(row, ["입고수량(새재고)", "입고수량"]));
      const soldQuantity = parseSheetNumber(readRowValue(row, ["총 판매수량", "출고수량(판매)", "판매수량"]));
      const currentStock =
        readRowValue(row, ["남은재고", "현재재고"]) !== undefined
          ? parseSheetNumber(readRowValue(row, ["남은재고", "현재재고"]))
          : Math.max(0, initialStock + incomingStock - soldQuantity);
      return {
        productId: product?.productId,
        name: product?.name ?? sheetItemName,
        sheetItemName,
        initialStock,
        soldQuantity,
        currentStock,
        lowStockThreshold: product?.lowStockThreshold ?? 5,
        active: product?.active ?? true,
      };
    });
}

function readRowValue(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

function findHeaderIndex(values: string[][], keys: string[]) {
  const header = values[0] ?? [];
  return header.findIndex((cell) => keys.includes(normalizeSummaryKey(cell)));
}

function resolveLegacyMemberByName(members: Member[], name: string) {
  const normalizedName = normalizeSummaryKey(name);
  const matches = members.filter((member) => normalizeSummaryKey(member.name) === normalizedName);
  return matches.length === 1 ? matches[0] : undefined;
}

// Preserved for reference while legacy sheet parsing is migrated to the resolved variant below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function readPurchasesFromLegacyRows(
  rows: RowWithNumber[],
  products: Product[],
  members: Member[],
  metaPurchases: Purchase[],
) {
  const metaByRow = new Map<number, Purchase>();
  for (const meta of metaPurchases) {
    for (const rowNumber of meta.sheetRowNumbers ?? []) {
      metaByRow.set(rowNumber, meta);
    }
  }

  const grouped = new Map<string, Purchase>();
  for (const row of rows) {
    if (!row["날짜"] || !row["이름"] || !row["품목명"]) continue;
    const rowMeta = metaByRow.get(row.__rowNumber);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const matchedMember = rowMeta?.memberId ? undefined : resolveLegacyMemberByName(members, row["?대쫫"]);
    const sheetItemName = row["품목명"].trim();
    const product = findProductBySheetName(products, sheetItemName);
    const quantity = parseSheetNumber(row["수량"]);
    const price = parseSheetNumber(row["단가"]);
    const lineTotal = parseSheetNumber(row["금액"]) || price * quantity;
    const date = rowMeta?.date || parseLegacySheetDate(row["날짜"]);
    const purchaseId = rowMeta?.purchaseId || `legacy-row-${row.__rowNumber}`;
    const existing =
      grouped.get(purchaseId) ??
      ({
        purchaseId,
        timestamp: rowMeta?.timestamp || `${date}T00:00:00.000Z`,
        date,
        buyerType: rowMeta?.buyerType ?? "member",
        memberId: rowMeta?.memberId || `legacy:${row["이름"]}`,
        memberTypeSnapshot: rowMeta?.memberTypeSnapshot,
        cohortSnapshot: rowMeta?.cohortSnapshot,
        gradeSnapshot: rowMeta?.gradeSnapshot,
        nameSnapshot: rowMeta?.nameSnapshot || row["이름"],
        externalBuyerPhone: rowMeta?.externalBuyerPhone,
        items: [],
        itemSummary: "",
        totalAmount: 0,
        paymentMethod: rowMeta?.paymentMethod || "cash",
        paymentStatus: rowMeta?.paymentStatus || "cash_paid",
        confirmedBy: rowMeta?.confirmedBy,
        confirmedAt: rowMeta?.confirmedAt,
        note: rowMeta?.note,
        syncedAt: rowMeta?.syncedAt,
        idempotencyKey: rowMeta?.idempotencyKey,
        deviceId: rowMeta?.deviceId,
        sheetRowNumbers: rowMeta?.sheetRowNumbers?.length ? rowMeta.sheetRowNumbers : [row.__rowNumber],
      } satisfies Purchase);

    existing.items.push({
      productId: product?.productId ?? `legacy:${sheetItemName}`,
      nameSnapshot: product?.name ?? sheetItemName,
      sheetItemNameSnapshot: sheetItemName,
      priceSnapshot: price,
      quantity,
      lineTotal,
    });
    existing.totalAmount += lineTotal;
    existing.itemSummary = summarizeItems(existing.items);
    grouped.set(purchaseId, existing);
  }

  return [...grouped.values()];
}

function readPurchasesFromLegacyRowsResolved(
  rows: RowWithNumber[],
  products: Product[],
  members: Member[],
  metaPurchases: Purchase[],
) {
  const metaByRow = new Map<number, Purchase>();
  for (const meta of metaPurchases) {
    for (const rowNumber of meta.sheetRowNumbers ?? []) {
      metaByRow.set(rowNumber, meta);
    }
  }

  const grouped = new Map<string, Purchase>();
  for (const row of rows) {
    if (!row["날짜"] || !row["이름"] || !row["품목명"]) continue;

    const rowMeta = metaByRow.get(row.__rowNumber);
    const matchedMember = rowMeta?.memberId ? undefined : resolveLegacyMemberByName(members, row["이름"]);
    const sheetItemName = row["품목명"].trim();
    const product = findProductBySheetName(products, sheetItemName);
    const quantity = parseSheetNumber(row["수량"]);
    const price = parseSheetNumber(row["단가"]);
    const lineTotal = parseSheetNumber(row["금액"]) || price * quantity;
    const date = rowMeta?.date || parseLegacySheetDate(row["날짜"]);
    const purchaseId = rowMeta?.purchaseId || `legacy-row-${row.__rowNumber}`;

    const existing =
      grouped.get(purchaseId) ??
      ({
        purchaseId,
        timestamp: rowMeta?.timestamp || `${date}T00:00:00.000Z`,
        date,
        buyerType: rowMeta?.buyerType ?? "member",
        memberId: rowMeta?.memberId || matchedMember?.memberId || `legacy:${row["이름"]}`,
        memberTypeSnapshot: rowMeta?.memberTypeSnapshot ?? matchedMember?.type,
        cohortSnapshot: rowMeta?.cohortSnapshot ?? matchedMember?.cohort,
        gradeSnapshot: rowMeta?.gradeSnapshot ?? matchedMember?.grade,
        nameSnapshot: rowMeta?.nameSnapshot || row["이름"],
        externalBuyerPhone: rowMeta?.externalBuyerPhone,
        items: [],
        itemSummary: "",
        totalAmount: 0,
        paymentMethod: rowMeta?.paymentMethod || "cash",
        paymentStatus: rowMeta?.paymentStatus || "cash_paid",
        confirmedBy: rowMeta?.confirmedBy,
        confirmedAt: rowMeta?.confirmedAt,
        note: rowMeta?.note,
        syncedAt: rowMeta?.syncedAt,
        idempotencyKey: rowMeta?.idempotencyKey,
        deviceId: rowMeta?.deviceId,
        sheetRowNumbers: rowMeta?.sheetRowNumbers?.length ? rowMeta.sheetRowNumbers : [row.__rowNumber],
      } satisfies Purchase);

    existing.items.push({
      productId: product?.productId ?? `legacy:${sheetItemName}`,
      nameSnapshot: product?.name ?? sheetItemName,
      sheetItemNameSnapshot: sheetItemName,
      priceSnapshot: price,
      quantity,
      lineTotal,
    });
    existing.totalAmount += lineTotal;
    existing.itemSummary = summarizeItems(existing.items);
    grouped.set(purchaseId, existing);
  }

  return [...grouped.values()];
}

async function readSheetsStateFresh(client: SheetsClient): Promise<DataState> {
  const [
    memberRows,
    legacyMemberRows,
    productRows,
    legacyProductRows,
    suggestionRows,
    queueRows,
    adjustmentRows,
    metaRows,
    inventoryRows,
    ledgerRows,
  ] = await Promise.all([
    client.getSheetRows(APP_MEMBERS_TAB),
    client.getSheetRows("members"),
    client.getSheetRows(APP_PRODUCTS_TAB),
    client.getSheetRows("products"),
    client.getSheetRows(SUGGESTIONS_TAB),
    client.getSheetRows(APP_SYNC_QUEUE_TAB),
    client.getSheetRows(APP_INVENTORY_ADJUSTMENTS_TAB),
    client.getSheetRows(APP_PURCHASE_META_TAB),
    client.getSheetRowsWithNumbers(LEGACY_INVENTORY_TAB),
    client.getSheetRowsWithNumbers(LEGACY_LEDGER_TAB),
  ]);

  const members = parseMembers(memberRows.length ? memberRows : legacyMemberRows);
  const products = parseProducts(productRows.length ? productRows : legacyProductRows);
  const seedMembers = members.length ? members : createSeedMembers();
  const seedProducts = products.length ? products : createSeedProducts();
  const inventory = readInventoryRows(inventoryRows, seedProducts);
  const productsWithInventory = applyInventoryToProducts(seedProducts, inventory.length ? inventory : inventoryFromProducts(seedProducts));
  const metaPurchases = parsePurchaseMeta(metaRows);
  const purchases = readPurchasesFromLegacyRowsResolved(ledgerRows, productsWithInventory, seedMembers, metaPurchases);

  return {
    members: seedMembers,
    products: productsWithInventory,
    purchases,
    suggestions: parseSuggestions(suggestionRows),
    syncQueue: parseSyncQueue(queueRows),
    inventoryAdjustments: parseAdjustments(adjustmentRows),
    pinAttempts: {},
    idempotencyKeys: purchases.map((purchase) => purchase.idempotencyKey).filter(Boolean) as string[],
  };
}

async function readSheetsProducts(client: SheetsClient): Promise<Product[]> {
  const [productRows, legacyProductRows, inventoryRows] = await Promise.all([
    client.getSheetRows(APP_PRODUCTS_TAB),
    client.getSheetRows("products"),
    client.getSheetRowsWithNumbers(LEGACY_INVENTORY_TAB),
  ]);
  const products = parseProducts(productRows.length ? productRows : legacyProductRows);
  const seedProducts = products.length ? products : createSeedProducts();
  const inventory = readInventoryRows(inventoryRows, seedProducts);
  return applyInventoryToProducts(seedProducts, inventory.length ? inventory : inventoryFromProducts(seedProducts));
}

function cacheSheetsState(state: DataState) {
  globalStore.__NCSTORE_SHEETS_STATE_CACHE__ = {
    value: state,
    expiresAt: Date.now() + SHEETS_STATE_CACHE_TTL_MS,
  };
  return state;
}

function invalidateSheetsStateCache() {
  globalStore.__NCSTORE_SHEETS_STATE_CACHE__ = undefined;
}

async function readSheetsState(
  client: SheetsClient,
  options: { forceRefresh?: boolean; allowStaleOnError?: boolean } = {},
): Promise<DataState> {
  const cache = globalStore.__NCSTORE_SHEETS_STATE_CACHE__;
  const now = Date.now();
  const allowStaleOnError = options.allowStaleOnError !== false;

  if (!options.forceRefresh && cache?.value && cache.expiresAt > now) {
    return cache.value;
  }

  if (!options.forceRefresh && cache?.promise) {
    return cache.promise;
  }

  const readFresh = async () => {
    try {
      return cacheSheetsState(await readSheetsStateFresh(client));
    } catch (error) {
      if (allowStaleOnError && cache?.value) {
        console.warn("[ncstore] Using stale Sheets cache after read failure.", error);
        globalStore.__NCSTORE_SHEETS_STATE_CACHE__ = {
          value: cache.value,
          expiresAt: Date.now() + SHEETS_STATE_STALE_RETRY_MS,
        };
        return cache.value;
      }
      if (!cache?.value) invalidateSheetsStateCache();
      throw error;
    }
  };

  if (options.forceRefresh) return readFresh();

  const promise = readFresh();
  globalStore.__NCSTORE_SHEETS_STATE_CACHE__ = {
    value: cache?.value,
    expiresAt: cache?.expiresAt ?? 0,
    promise,
  };
  return promise;
}

async function persistAppSheets(client: SheetsClient, state: DataState) {
  await Promise.all([
    client.overwriteSheet(APP_MEMBERS_TAB, serializeMembers(state.members)),
    client.overwriteSheet(APP_PRODUCTS_TAB, serializeProducts(state.products)),
    client.overwriteSheet(SUGGESTIONS_TAB, serializeSuggestions(state.suggestions)),
    client.overwriteSheet(APP_SYNC_QUEUE_TAB, serializeSyncQueue(state.syncQueue)),
    client.overwriteSheet(APP_INVENTORY_ADJUSTMENTS_TAB, serializeAdjustments(state.inventoryAdjustments)),
    client.overwriteSheet(APP_SETTINGS_TAB, [{ key: "schema_version", value: "2" }]),
  ]);
}

async function appendLegacyPurchase(client: SheetsClient, purchase: Purchase) {
  const rows = purchase.items.map((item) => [
    sheetDateKey(new Date(purchase.timestamp)),
    purchase.nameSnapshot,
    item.sheetItemNameSnapshot ?? item.nameSnapshot,
    String(item.quantity),
    formatWonCell(item.priceSnapshot),
    formatWonCell(item.lineTotal),
  ]);
  return client.appendValues(LEGACY_LEDGER_TAB, rows);
}

function normalizeSummaryKey(value?: string) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

async function ensurePurchaseMetaHeader(client: SheetsClient) {
  const values = await client.getValues(APP_PURCHASE_META_TAB);
  if (!values.length) return [...PURCHASE_META_FIELDS];

  const header = values[0].map((value) => String(value));
  const nextHeader = [...header];
  for (const field of PURCHASE_META_FIELDS) {
    if (!nextHeader.includes(field)) nextHeader.push(field);
  }

  if (nextHeader.length !== header.length) {
    await client.updateHeader(APP_PURCHASE_META_TAB, nextHeader);
  }

  return nextHeader;
}

function purchaseMetaRow(serialized: Record<string, string>, header: string[]) {
  return header.map((key) => serialized[key] ?? "");
}

async function upsertPurchaseMeta(client: SheetsClient, purchase: Purchase) {
  const rows = await client.getSheetRowsWithNumbers(APP_PURCHASE_META_TAB);
  const existing = rows.find((row) => row.purchase_id === purchase.purchaseId);
  const serialized = serializePurchaseMeta(purchase);
  const serializedRecord: Record<string, string> = serialized;
  if (!existing) {
    const header = await ensurePurchaseMetaHeader(client);
    await client.appendValues(APP_PURCHASE_META_TAB, [purchaseMetaRow(serializedRecord, header)]);
    const allRows = await client.getSheetRows(APP_PURCHASE_META_TAB);
    if (!allRows.length) {
      await client.overwriteSheet(APP_PURCHASE_META_TAB, [serialized]);
    }
    return;
  }

  const keys = await ensurePurchaseMetaHeader(client);
  await Promise.all(
    keys.map((key, index) =>
      client.updateCell(APP_PURCHASE_META_TAB, existing.__rowNumber, index, serializedRecord[key] ?? ""),
    ),
  );
}

async function appendPurchaseMeta(client: SheetsClient, purchase: Purchase) {
  const existingRows = await client.getSheetRows(APP_PURCHASE_META_TAB);
  const serialized = serializePurchaseMeta(purchase);
  if (!existingRows.length) {
    await client.overwriteSheet(APP_PURCHASE_META_TAB, [serialized]);
    return;
  }
  const header = await ensurePurchaseMetaHeader(client);
  await client.appendValues(APP_PURCHASE_META_TAB, [purchaseMetaRow(serialized, header)]);
}

async function persistSinglePurchaseMeta(client: SheetsClient, purchase: Purchase) {
  const rows = await client.getSheetRows(APP_PURCHASE_META_TAB);
  if (!rows.length) {
    await client.overwriteSheet(APP_PURCHASE_META_TAB, [serializePurchaseMeta(purchase)]);
    return;
  }
  await upsertPurchaseMeta(client, purchase);
}

function sheetsSource(): Source {
  const client = new SheetsClient();

  return {
    async listMembers(filters) {
      const state = await readSheetsState(client);
      return memorySourceFromState(state).listMembers(filters);
    },
    async getMember(memberId) {
      const state = await readSheetsState(client);
      return state.members.find((member) => member.memberId === memberId) ?? null;
    },
    async verifyMemberPin(memberId, pin) {
      const state = await readSheetsState(client);
      return memorySourceFromState(state).verifyMemberPin(memberId, pin);
    },
    async listProducts(activeOnly = true, options) {
      if (options?.forceRefresh) {
        return [...(await readSheetsProducts(client))]
          .filter((product) => (activeOnly ? product.active : true))
          .sort((a, b) => a.sortOrder - b.sortOrder);
      }
      const state = await readSheetsState(client);
      return memorySourceFromState(state).listProducts(activeOnly);
    },
    async createPurchase(input) {
      const state = await readSheetsState(client, { forceRefresh: true, allowStaleOnError: false });
      if (state.idempotencyKeys.includes(input.idempotencyKey)) {
        const existing = state.purchases.find((purchase) => purchase.idempotencyKey === input.idempotencyKey);
        if (!existing) throw new Error("중복 구매를 처리할 수 없습니다.");
        return { purchase: existing, syncStatus: "synced" as const };
      }

      const purchase = buildPurchase(state, input);
      const rowNumbers = await appendLegacyPurchase(client, purchase);
      purchase.sheetRowNumbers = rowNumbers;
      await appendPurchaseMeta(client, purchase);
      invalidateSheetsStateCache();
      return { purchase, syncStatus: "synced" as const };
    },
    async getMemberLedger(memberId) {
      const state = await readSheetsState(client);
      return memorySourceFromState(state).getMemberLedger(memberId);
    },
    async createSuggestion(input) {
      const state = await readSheetsState(client, { forceRefresh: true, allowStaleOnError: false });
      const suggestion = await memorySourceFromState(state).createSuggestion(input);
      await persistAppSheets(client, state);
      invalidateSheetsStateCache();
      return suggestion;
    },
    async getDashboardSummary() {
      const state = await readSheetsState(client);
      return computeDashboardSummary(state);
    },
    async getRankings() {
      const state = await readSheetsState(client);
      return computeRankings(state.purchases);
    },
    async getInventory() {
      const state = await readSheetsState(client);
      return {
        items: inventoryFromProducts(state.products),
        adjustments: state.inventoryAdjustments.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      };
    },
    async adjustInventory(input) {
      const state = await readSheetsState(client, { forceRefresh: true, allowStaleOnError: false });
      const inventoryValues = await client.getValues(LEGACY_INVENTORY_TAB);
      const inventoryRows = await client.getSheetRowsWithNumbers(LEGACY_INVENTORY_TAB);
      const initialStockColumn = findHeaderIndex(inventoryValues, ["초기재고(개수)", "기초재고"]);
      const targetRow = inventoryRows.find((row) => readRowValue(row, ["품목", "품목명"]) === input.sheetItemName);
      if (!targetRow) throw new Error("재고 품목을 찾지 못했습니다.");
      if (initialStockColumn < 0) throw new Error("재고 기준 컬럼을 찾지 못했습니다.");
      const previousInitialStock = parseSheetNumber(readRowValue(targetRow, ["초기재고(개수)", "기초재고"]));
      const nextInitialStock = Math.max(0, previousInitialStock + input.delta);
      await client.updateCell(LEGACY_INVENTORY_TAB, targetRow.__rowNumber, initialStockColumn, String(nextInitialStock));
      const adjustment: InventoryAdjustment = {
        adjustmentId: `adjustment-${crypto.randomUUID()}`,
        productId: input.productId,
        sheetItemName: input.sheetItemName,
        delta: input.delta,
        reason: input.reason,
        previousInitialStock,
        nextInitialStock,
        createdBy: input.createdBy,
        createdAt: new Date().toISOString(),
      };
      state.inventoryAdjustments.push(adjustment);
      await persistAppSheets(client, state);
      invalidateSheetsStateCache();
      return adjustment;
    },
    async updatePurchaseStatus(purchaseId, paymentStatus, confirmedBy) {
      const state = await readSheetsState(client, { forceRefresh: true, allowStaleOnError: false });
      const purchase = await memorySourceFromState(state).updatePurchaseStatus(purchaseId, paymentStatus, confirmedBy);
      if (purchase) {
        await persistSinglePurchaseMeta(client, purchase);
        invalidateSheetsStateCache();
      }
      return purchase;
    },
    async cancelPurchase(purchaseId, confirmedBy) {
      return this.updatePurchaseStatus(purchaseId, "cancelled", confirmedBy);
    },
    async createProduct(input) {
      const state = await readSheetsState(client, { forceRefresh: true, allowStaleOnError: false });
      const product = await memorySourceFromState(state).createProduct(input);
      await persistAppSheets(client, state);
      invalidateSheetsStateCache();
      return product;
    },
    async updateProduct(productId, input) {
      const state = await readSheetsState(client, { forceRefresh: true, allowStaleOnError: false });
      const product = await memorySourceFromState(state).updateProduct(productId, input);
      await persistAppSheets(client, state);
      invalidateSheetsStateCache();
      return product;
    },
    async createMember(input) {
      const state = await readSheetsState(client, { forceRefresh: true, allowStaleOnError: false });
      const member = await memorySourceFromState(state).createMember(input);
      await persistAppSheets(client, state);
      invalidateSheetsStateCache();
      return member;
    },
    async updateMember(memberId, input) {
      const state = await readSheetsState(client, { forceRefresh: true, allowStaleOnError: false });
      const member = await memorySourceFromState(state).updateMember(memberId, input);
      await persistAppSheets(client, state);
      invalidateSheetsStateCache();
      return member;
    },
    async resetMemberPin(memberId, pin) {
      const state = await readSheetsState(client, { forceRefresh: true, allowStaleOnError: false });
      const member = await memorySourceFromState(state).resetMemberPin(memberId, pin);
      await persistAppSheets(client, state);
      invalidateSheetsStateCache();
      return member;
    },
    async refreshSheetsState() {
      invalidateSheetsStateCache();
      const state = await readSheetsState(client, { forceRefresh: true, allowStaleOnError: false });
      return {
        refreshedAt: new Date().toISOString(),
        pending: state.syncQueue.filter((entry) => entry.status === "pending").length,
        purchases: state.purchases.length,
        products: state.products.length,
        members: state.members.length,
      };
    },
    async retrySyncQueue() {
      const state = await readSheetsState(client, { forceRefresh: true, allowStaleOnError: false });
      await ensurePurchaseMetaHeader(client);
      state.syncQueue = [];
      await persistAppSheets(client, state);
      invalidateSheetsStateCache();
      await readSheetsState(client, { forceRefresh: true, allowStaleOnError: false });
      return { retried: 0, remaining: 0 };
    },
  };
}

function memorySourceFromState(state: DataState): Source {
  const backup = globalStore.__NCSTORE_MEMORY__;
  globalStore.__NCSTORE_MEMORY__ = state;
  const source = memorySource();
  globalStore.__NCSTORE_MEMORY__ = backup;
  return source;
}

export function getSource(): Source {
  return hasGoogleSheetsConfig() ? sheetsSource() : memorySource();
}
