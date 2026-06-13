export type MemberType = "student" | "teacher";

export type BuyerType = "member" | "external";

export type PaymentMethod = "cash" | "transfer";

export type PaymentStatus =
  | "cash_pending"
  | "cash_paid"
  | "transfer_pending"
  | "transfer_paid"
  | "unpaid"
  | "cancelled";

export type MemberStatus = "active" | "leave" | "graduated" | "inactive";

export type SuggestionStatus = "reviewing" | "planned" | "selling" | "rejected";

export type Member = {
  memberId: string;
  type: MemberType;
  cohort?: "1기" | "2기" | "3기" | "4기";
  grade?: string;
  name: string;
  gender?: string;
  status: MemberStatus;
  isAdmin?: boolean;
  phoneNumber?: string;
  smsOptIn?: boolean;
  kioskSetupCompletedAt?: string;
  pinHash: string;
  pinSalt: string;
  faceDescriptor?: number[];
  createdAt: string;
  updatedAt: string;
};

export type PublicMember = Omit<Member, "pinHash" | "pinSalt">;

export type Product = {
  productId: string;
  name: string;
  price: number;
  active: boolean;
  sortOrder: number;
  stock?: number;
  sheetItemName?: string;
  aliases?: string[];
  lowStockThreshold?: number;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseItem = {
  productId: string;
  nameSnapshot: string;
  sheetItemNameSnapshot?: string;
  priceSnapshot: number;
  quantity: number;
  lineTotal: number;
};

export type ExternalBuyer = {
  name: string;
  phoneNumber?: string;
};

export type Purchase = {
  purchaseId: string;
  timestamp: string;
  date: string;
  buyerType: BuyerType;
  memberId: string;
  memberTypeSnapshot?: MemberType;
  cohortSnapshot?: string;
  gradeSnapshot?: string;
  nameSnapshot: string;
  externalBuyerPhone?: string;
  items: PurchaseItem[];
  itemSummary: string;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  confirmedBy?: string;
  confirmedAt?: string;
  deviceId?: string;
  note?: string;
  syncedAt?: string;
  idempotencyKey?: string;
  sheetRowNumbers?: number[];
};

export type Suggestion = {
  suggestionId: string;
  memberId?: string;
  memberName?: string;
  productName: string;
  expectedPrice?: number;
  reason?: string;
  status: SuggestionStatus;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseInput = {
  memberId?: string;
  externalBuyer?: ExternalBuyer;
  paymentMethod: PaymentMethod;
  items: Array<{ productId: string; quantity: number }>;
  deviceId?: string;
  note?: string;
  idempotencyKey: string;
};

export type InventoryItem = {
  productId?: string;
  name: string;
  sheetItemName: string;
  initialStock: number;
  soldQuantity: number;
  currentStock: number;
  lowStockThreshold: number;
  active: boolean;
};

export type InventoryAdjustment = {
  adjustmentId: string;
  productId?: string;
  sheetItemName: string;
  delta: number;
  reason?: string;
  previousInitialStock: number;
  nextInitialStock: number;
  createdBy: string;
  createdAt: string;
};

export type DailySalesSummary = {
  date: string;
  totalAmount: number;
  purchaseCount: number;
};

export type PayerSummary = {
  buyerKey: string;
  name: string;
  buyerType: BuyerType;
  phoneNumber?: string;
  cashPendingAmount: number;
  transferPendingAmount: number;
  pendingAmount: number;
  purchaseIds: string[];
  cashPurchaseIds: string[];
  transferPurchaseIds: string[];
};

export type RankingEntry = {
  rank: number;
  buyerKey: string;
  name: string;
  buyerType: BuyerType;
  totalAmount: number;
  purchaseCount: number;
  favoriteItem?: string;
};

export type ProductRankingEntry = {
  rank: number;
  productName: string;
  quantity: number;
  totalAmount: number;
};

export type Rankings = {
  buyers: RankingEntry[];
  products: ProductRankingEntry[];
};

export type DashboardSummary = {
  todayTotal: number;
  cumulativeTotal: number;
  cashPendingCount: number;
  cashPendingAmount: number;
  transferPendingCount: number;
  transferPendingAmount: number;
  paidAmount: number;
  unpaidEstimate: number;
  unconfirmedAmount: number;
  recentPurchases: Purchase[];
  queuedSyncCount: number;
  lowStockProducts: InventoryItem[];
  dailySales: DailySalesSummary[];
  payerSummaries: PayerSummary[];
  inventory: InventoryItem[];
};

export type SyncQueueEntry = {
  queueId: string;
  kind: "purchase";
  payload: string;
  status: "pending" | "failed";
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};
