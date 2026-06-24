"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell, Card, Header, PrimaryButton, SecondaryButton } from "@/components/ui";
import { getMemberAdminSubtitle } from "@/lib/member-display";
import { compareKoreanNames, formatDateTime, paymentStatusLabel, won } from "@/lib/utils";
import type { DashboardSummary, PaymentStatus, Product, PublicMember, Purchase } from "@/lib/types";

type DashboardPayload = DashboardSummary & {
  members: PublicMember[];
  products: Product[];
};

type Props = {
  initialMembers: PublicMember[];
  initialProducts: Product[];
  initialDashboard?: DashboardSummary;
  initiallyAuthed: boolean;
};

function normalizeSignedIntegerInput(value: string) {
  const trimmed = value.trim();
  const sign = trimmed.startsWith("-") ? "-" : trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/\D/g, "");
  return `${sign}${digits}`;
}

export function AdminClient({
  initialMembers,
  initialProducts,
  initialDashboard,
  initiallyAuthed,
}: Props) {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(initiallyAuthed);
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [members, setMembers] = useState(initialMembers);
  const [products, setProducts] = useState(initialProducts);
  const [message, setMessage] = useState<string | null>(null);
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductSheetName, setNewProductSheetName] = useState("");
  const [newProductThreshold, setNewProductThreshold] = useState("5");
  const [memberQuery, setMemberQuery] = useState("");
  const [selectedInventoryName, setSelectedInventoryName] = useState("");
  const [adjustmentDelta, setAdjustmentDelta] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");

  const inventory = useMemo(() => dashboard?.inventory ?? [], [dashboard?.inventory]);
  const lowStockProducts = useMemo(() => dashboard?.lowStockProducts ?? [], [dashboard?.lowStockProducts]);

  const visibleMembers = useMemo(() => {
    const keyword = memberQuery.trim();
    return members
      .filter((member) => (keyword ? member.name.includes(keyword) : true))
      .sort((a, b) => compareKoreanNames(a.name, b.name));
  }, [memberQuery, members]);

  const selectedInventory = useMemo(() => {
    if (!inventory.length) return undefined;
    return (
      inventory.find((item) => item.sheetItemName === selectedInventoryName) ??
      inventory[0]
    );
  }, [inventory, selectedInventoryName]);

  async function lockAdmin(showMessage = true) {
    await fetch("/api/admin/logout", {
      method: "POST",
      keepalive: true,
    });
    setAuthed(false);
    setDashboard(undefined);
    if (showMessage) setMessage("운영관리 화면이 잠겼습니다. 다시 이용하려면 비밀번호를 입력해 주세요.");
  }

  useEffect(() => {
    if (!authed) return;

    function lockSilently() {
      void fetch("/api/admin/logout", {
        method: "POST",
        keepalive: true,
      });
      setAuthed(false);
      setDashboard(undefined);
    }

    function lockOnLeave() {
      if (document.visibilityState === "hidden") {
        lockSilently();
      }
    }

    function lockOnPageHide() {
      lockSilently();
    }

    document.addEventListener("visibilitychange", lockOnLeave);
    window.addEventListener("pagehide", lockOnPageHide);
    return () => {
      document.removeEventListener("visibilitychange", lockOnLeave);
      window.removeEventListener("pagehide", lockOnPageHide);
    };
  }, [authed]);

  async function refreshDashboard(forceRefresh = false) {
    const response = await fetch(`/api/admin/dashboard${forceRefresh ? "?refresh=1" : ""}`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage((payload as { error?: string }).error ?? "운영 데이터를 불러오지 못했습니다.");
      return;
    }

    const data = payload as DashboardPayload;
    setDashboard(data);
    setMembers(data.members);
    setProducts(data.products);
    if (!selectedInventoryName && data.inventory[0]) {
      setSelectedInventoryName(data.inventory[0].sheetItemName);
    }
  }

  async function login() {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (response.ok) {
      setAuthed(true);
      setPassword("");
      setMessage(null);
      await refreshDashboard(true);
      return;
    }
    setMessage("관리자 비밀번호가 올바르지 않습니다.");
  }

  async function updatePurchaseStatus(purchaseId: string, paymentStatus: PaymentStatus) {
    const response = await fetch(`/api/admin/purchases/${purchaseId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentStatus }),
    });
    if (!response.ok) {
      const payload = await response.json();
      setMessage(payload.error ?? "구매 상태 변경에 실패했습니다.");
      return;
    }
    setMessage("입금 상태를 업데이트했습니다.");
    await refreshDashboard();
  }

  async function bulkUpdatePurchaseStatus(purchaseIds: string[], paymentStatus: PaymentStatus) {
    if (!purchaseIds.length) return;
    await Promise.all(
      purchaseIds.map((purchaseId) =>
        fetch(`/api/admin/purchases/${purchaseId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentStatus }),
        }),
      ),
    );
    setMessage(`${purchaseIds.length}건을 ${paymentStatusLabel(paymentStatus)} 처리했습니다.`);
    await refreshDashboard();
  }

  async function cancelPurchase(purchaseId: string) {
    await fetch(`/api/admin/purchases/${purchaseId}/cancel`, { method: "PATCH" });
    setMessage("구매 기록을 취소했습니다.");
    await refreshDashboard();
  }

  async function toggleProduct(product: Product) {
    await fetch(`/api/admin/products/${product.productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !product.active }),
    });
    setMessage(`${product.name} 판매 상태를 변경했습니다.`);
    await refreshDashboard();
  }

  async function deleteProduct(product: Product) {
    const confirmed = window.confirm(
      `${product.name} 메뉴를 삭제할까요?\n기존 구매 기록과 실제 장부 기록은 유지되고, 판매 메뉴 목록에서만 제거됩니다.`,
    );
    if (!confirmed) return;

    const response = await fetch(`/api/admin/products/${product.productId}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "상품 삭제에 실패했습니다.");
      return;
    }
    setMessage(`${product.name} 메뉴를 삭제했습니다.`);
    await refreshDashboard(true);
  }

  async function createProduct() {
    const name = newProductName.trim();
    const price = Number(newProductPrice);
    const lowStockThreshold = Number(newProductThreshold || 5);
    if (!name || !Number.isInteger(price) || price < 0) {
      setMessage("상품명과 가격을 올바르게 입력해 주세요.");
      return;
    }

    const nextSortOrder = Math.max(0, ...products.map((product) => product.sortOrder)) + 1;
    const response = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        price,
        active: true,
        sortOrder: nextSortOrder,
        sheetItemName: newProductSheetName.trim() || name,
        aliases: [],
        lowStockThreshold: Number.isInteger(lowStockThreshold) ? lowStockThreshold : 5,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "상품 추가에 실패했습니다.");
      return;
    }

    setNewProductName("");
    setNewProductPrice("");
    setNewProductSheetName("");
    setNewProductThreshold("5");
    setMessage(`${name} 상품을 추가했습니다.`);
    await refreshDashboard();
  }

  async function adjustInventory() {
    const item = selectedInventory;
    const normalizedDelta = normalizeSignedIntegerInput(adjustmentDelta);
    const delta = Number(normalizedDelta);
    if (!item || !Number.isInteger(delta) || delta === 0) {
      setMessage("조정할 품목과 재고 변동 수량을 입력해 주세요.");
      return;
    }

    const response = await fetch("/api/admin/inventory/adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: item.productId,
        sheetItemName: item.sheetItemName,
        delta,
        reason: adjustmentReason.trim() || undefined,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "재고 조정에 실패했습니다.");
      return;
    }

    setAdjustmentDelta("");
    setAdjustmentReason("");
    setMessage(`${item.name} 재고를 ${delta > 0 ? "+" : ""}${delta}개 조정했습니다.`);
    await refreshDashboard();
  }

  function changeAdjustmentDelta(delta: number) {
    const current = Number(normalizeSignedIntegerInput(adjustmentDelta)) || 0;
    const next = current + delta;
    setAdjustmentDelta(next > 0 ? `+${next}` : String(next));
  }

  async function resetPin(memberId: string) {
    await fetch(`/api/admin/members/${memberId}/reset-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "0000" }),
    });
    setMessage("PIN을 0000으로 초기화했습니다.");
  }

  async function updatePhone(member: PublicMember) {
    const current = member.phoneNumber ?? "";
    const next = window.prompt("연락처를 01012345678 형식으로 입력해 주세요.", current);
    if (!next) return;
    await fetch(`/api/admin/members/${member.memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: next.trim() }),
    });
    setMessage(`${member.name} 연락처를 업데이트했습니다.`);
    await refreshDashboard();
  }

  async function syncQueue() {
    const response = await fetch("/api/admin/sheets/sync", {
      method: "POST",
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "Sheets 재동기화에 실패했습니다.");
      return;
    }
    setMessage(`Sheets 재동기화 완료. 남은 대기 건수 ${payload.remaining ?? 0}건`);
    await refreshDashboard(true);
  }

  async function sendReminder(purchase: Purchase) {
    const phoneNumber =
      purchase.externalBuyerPhone ??
      members.find((member) => member.memberId === purchase.memberId)?.phoneNumber ??
      window.prompt(`${purchase.nameSnapshot} 연락처를 입력해 주세요.`, "")?.trim();

    if (!phoneNumber) return;

    const response = await fetch("/api/admin/notifications/overdue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: purchase.buyerType === "member" ? purchase.memberId : undefined,
        purchaseId: purchase.purchaseId,
        phoneNumber,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error ?? "체납 안내 발송에 실패했습니다.");
      return;
    }
    setMessage(`${payload.to} 번호로 체납 안내를 발송했습니다.`);
  }

  if (!authed) {
    return (
      <AppShell className="admin-mobile-shell max-w-md">
        <Header
          eyebrow="Admin Access"
          title="운영 비밀번호"
          description="운영관리 화면은 HTTP-only 세션 쿠키로 보호됩니다."
        />
        <Card className="space-y-4 text-center">
          <input
            className="h-14 w-full border border-zinc-200 bg-white px-4 text-center text-lg font-black outline-none focus:border-zinc-950"
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void login();
            }}
            placeholder="관리자 비밀번호"
            type="password"
            value={password}
          />
          <PrimaryButton onClick={() => void login()}>로그인</PrimaryButton>
          {message ? <div className="text-sm font-semibold text-red-600">{message}</div> : null}
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell className="admin-mobile-shell max-w-md sm:max-w-2xl lg:max-w-5xl">
      <Header
        eyebrow="NCS Operations"
        title="운영관리"
        description="휴대폰에서도 일별 매출, 입금 확인, 재고 조정을 빠르게 처리할 수 있습니다."
        action={
          <div className="grid gap-2">
            <SecondaryButton onClick={() => void refreshDashboard(true)}>새로고침</SecondaryButton>
            <SecondaryButton onClick={() => void lockAdmin()}>잠금</SecondaryButton>
          </div>
        }
      />

      <section className="card-dark mb-4 p-4 text-center">
        <div className="flex items-center justify-between gap-3">
          <div className="text-left">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Live Sheet</div>
            <div className="mt-1 text-lg font-black">실제 장부 연동 모드</div>
          </div>
          <button
            className="border border-white/15 bg-white/10 px-3 py-2 text-xs font-black text-white"
            onClick={() => void syncQueue()}
            type="button"
          >
            재동기화
          </button>
        </div>
      </section>

      {message ? (
        <div className="mb-4 border border-zinc-900 bg-zinc-950 px-4 py-3 text-center text-sm font-semibold text-white">
          {message}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-2 text-center lg:grid-cols-4">
        <Card className="p-3">
          <div className="text-xs font-black text-zinc-400">오늘 매출</div>
          <div className="mt-1 text-2xl font-black text-zinc-950">{won(dashboard?.todayTotal ?? 0)}원</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs font-black text-zinc-400">누적 매출</div>
          <div className="mt-1 text-2xl font-black text-zinc-950">{won(dashboard?.cumulativeTotal ?? 0)}원</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs font-black text-zinc-400">미확인 금액</div>
          <div className="mt-1 text-2xl font-black text-red-600">{won(dashboard?.unconfirmedAmount ?? 0)}원</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs font-black text-zinc-400">낮은 재고</div>
          <div className="mt-1 text-2xl font-black text-zinc-950">{lowStockProducts.length}개</div>
        </Card>
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Card className="text-center">
          <div className="brand-gradient mx-auto mb-3 h-1.5 w-14" />
          <h2 className="text-xl font-black text-zinc-950">일별 매출</h2>
          <div className="mt-3 space-y-2">
            {(dashboard?.dailySales ?? []).slice(0, 7).map((day) => (
              <div className="flex items-center justify-between border border-zinc-200 bg-zinc-50 px-3 py-2" key={day.date}>
                <div className="text-sm font-black text-zinc-950">{day.date}</div>
                <div className="text-right">
                  <div className="text-sm font-black text-zinc-950">{won(day.totalAmount)}원</div>
                  <div className="text-xs font-bold text-zinc-400">{day.purchaseCount}건</div>
                </div>
              </div>
            ))}
            {!dashboard?.dailySales.length ? (
              <div className="border border-dashed border-zinc-300 p-6 text-sm font-semibold text-zinc-500">
                아직 일별 매출이 없습니다.
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="text-center">
          <div className="brand-gradient mx-auto mb-3 h-1.5 w-14" />
          <h2 className="text-xl font-black text-zinc-950">사람별 입금 확인</h2>
          <div className="mt-3 space-y-3">
            {(dashboard?.payerSummaries ?? []).map((summary) => (
              <div className="border border-zinc-200 bg-white p-3" key={summary.buyerKey}>
                <div className="flex items-center justify-between gap-3 text-left">
                  <div>
                    <div className="text-lg font-black text-zinc-950">{summary.name}</div>
                    <div className="text-xs font-bold text-zinc-400">
                      {summary.buyerType === "external" ? "외부인" : "NCS 멤버"} · 대기 {summary.purchaseIds.length}건
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-red-600">{won(summary.pendingAmount)}원</div>
                    <div className="text-xs font-bold text-zinc-500">
                      현금 {won(summary.cashPendingAmount)} · 계좌 {won(summary.transferPendingAmount)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <SecondaryButton
                    className="h-10"
                    disabled={!summary.cashPurchaseIds.length}
                    onClick={() => void bulkUpdatePurchaseStatus(summary.cashPurchaseIds, "cash_paid")}
                  >
                    현금 완료
                  </SecondaryButton>
                  <SecondaryButton
                    className="h-10"
                    disabled={!summary.transferPurchaseIds.length}
                    onClick={() => void bulkUpdatePurchaseStatus(summary.transferPurchaseIds, "transfer_paid")}
                  >
                    계좌 완료
                  </SecondaryButton>
                </div>
              </div>
            ))}
            {!dashboard?.payerSummaries.length ? (
              <div className="border border-dashed border-zinc-300 p-6 text-sm font-semibold text-zinc-500">
                현재 입금 대기 건이 없습니다.
              </div>
            ) : null}
          </div>
        </Card>
      </section>

      <section className="mt-5">
        <Card className="text-center">
          <div className="brand-gradient mx-auto mb-3 h-1.5 w-14" />
          <h2 className="text-xl font-black text-zinc-950">재고관리</h2>
          <p className="mt-1 text-sm font-semibold text-zinc-500">
            실제 `재고 현황` 탭의 초기재고만 조정하고, 조정 로그는 앱 보조 탭에 남깁니다.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_120px]">
            <select
              className="h-12 border border-zinc-300 bg-white px-3 text-center text-sm font-black outline-none focus:border-zinc-950"
              onChange={(event) => setSelectedInventoryName(event.target.value)}
              value={selectedInventory?.sheetItemName ?? ""}
            >
              {inventory.map((item) => (
                <option key={item.sheetItemName} value={item.sheetItemName}>
                  {item.name} · 현재 {item.currentStock}개
                </option>
              ))}
            </select>
            <input
              className="h-12 border border-zinc-300 px-3 text-center text-sm font-black outline-none focus:border-zinc-950"
              inputMode="text"
              onChange={(event) => setAdjustmentDelta(normalizeSignedIntegerInput(event.target.value))}
              placeholder="+입고 / -차감"
              type="text"
              value={adjustmentDelta}
            />
            <PrimaryButton className="h-12" onClick={() => void adjustInventory()}>
              조정
            </PrimaryButton>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {[-5, -1, 1, 5].map((delta) => (
              <SecondaryButton
                className="h-10 text-xs"
                key={delta}
                onClick={() => changeAdjustmentDelta(delta)}
                type="button"
              >
                {delta > 0 ? `+${delta}` : delta}
              </SecondaryButton>
            ))}
          </div>
          <input
            className="mt-2 h-12 w-full border border-zinc-300 px-3 text-center text-sm font-bold outline-none focus:border-zinc-950"
            onChange={(event) => setAdjustmentReason(event.target.value)}
            placeholder="조정 사유(선택)"
            value={adjustmentReason}
          />

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {inventory.map((item) => {
              const lowStock = item.active && item.currentStock <= item.lowStockThreshold;
              return (
                <div
                  className={`border p-3 ${lowStock ? "border-red-200 bg-red-50" : "border-zinc-200 bg-zinc-50"}`}
                  key={item.sheetItemName}
                >
                  <div className="font-black text-zinc-950">{item.name}</div>
                  <div className="mt-1 text-sm font-bold text-zinc-500">장부명: {item.sheetItemName}</div>
                  <div className="mt-2 text-2xl font-black text-zinc-950">{item.currentStock}개</div>
                  <div className="mt-1 text-xs font-bold text-zinc-500">
                    초기 {item.initialStock} · 판매 {item.soldQuantity} · 기준 {item.lowStockThreshold}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      <section className="mt-5">
        <Card className="text-center">
          <div className="brand-gradient mx-auto mb-3 h-1.5 w-14" />
          <h2 className="text-xl font-black text-zinc-950">상품관리</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px] lg:grid-cols-[minmax(0,1fr)_150px_170px_110px_120px]">
            <input
              className="h-12 border border-zinc-300 px-3 text-center text-sm font-black outline-none focus:border-zinc-950"
              onChange={(event) => setNewProductName(event.target.value)}
              placeholder="상품명"
              value={newProductName}
            />
            <input
              className="h-12 border border-zinc-300 px-3 text-center text-sm font-black outline-none focus:border-zinc-950"
              inputMode="numeric"
              onChange={(event) => setNewProductPrice(event.target.value.replace(/\D/g, ""))}
              placeholder="가격"
              value={newProductPrice}
            />
            <input
              className="h-12 border border-zinc-300 px-3 text-center text-sm font-black outline-none focus:border-zinc-950"
              onChange={(event) => setNewProductSheetName(event.target.value)}
              placeholder="장부 품목명"
              value={newProductSheetName}
            />
            <input
              className="h-12 border border-zinc-300 px-3 text-center text-sm font-black outline-none focus:border-zinc-950"
              inputMode="numeric"
              onChange={(event) => setNewProductThreshold(event.target.value.replace(/\D/g, ""))}
              placeholder="낮은 재고"
              value={newProductThreshold}
            />
            <PrimaryButton className="h-12" onClick={() => void createProduct()}>
              추가
            </PrimaryButton>
          </div>
          <div className="mt-4 space-y-2">
            {products.map((product) => (
              <div className="grid gap-3 border border-zinc-200 bg-white p-3 text-left sm:grid-cols-[minmax(0,1fr)_220px]" key={product.productId}>
                <div className="min-w-0">
                  <div className="truncate font-black text-zinc-950">{product.name}</div>
                  <div className="text-sm font-bold text-zinc-500">
                    {won(product.price)}원 · 재고 {typeof product.stock === "number" ? `${product.stock}개` : "연동 전"} · 장부명 {product.sheetItemName ?? product.name}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <SecondaryButton className="h-10" onClick={() => void toggleProduct(product)}>
                    {product.active ? "비활성화" : "판매 재개"}
                  </SecondaryButton>
                  <SecondaryButton className="h-10 border-red-200 text-red-600 hover:border-red-500 hover:bg-red-50" onClick={() => void deleteProduct(product)}>
                    삭제
                  </SecondaryButton>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="mt-5">
        <Card className="text-center">
          <div className="brand-gradient mx-auto mb-3 h-1.5 w-14" />
          <h2 className="text-xl font-black text-zinc-950">멤버관리</h2>
          <p className="mt-1 text-sm font-semibold text-zinc-500">
            전체 {members.length}명 중 {visibleMembers.length}명 표시
          </p>
          <input
            className="mt-3 h-12 w-full border border-zinc-300 px-3 text-center text-sm font-black outline-none focus:border-zinc-950"
            onChange={(event) => setMemberQuery(event.target.value)}
            placeholder="이름 검색"
            value={memberQuery}
          />
          <div className="mt-4 space-y-2">
            {visibleMembers.map((member) => (
              <div className="border border-zinc-200 bg-white p-3 text-left" key={member.memberId}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-black text-zinc-950">
                      {member.name} {member.isAdmin ? "· 관리자" : ""}
                    </div>
                    <div className="text-sm font-bold text-zinc-500">{getMemberAdminSubtitle(member)}</div>
                    <div className="mt-1 text-xs font-bold text-zinc-400">
                      연락처 {member.phoneNumber ? member.phoneNumber : "미입력"} · 얼굴 {member.faceDescriptor?.length ? "등록됨" : "미등록"}
                    </div>
                  </div>
                  <div className="text-xs font-black text-zinc-400">{member.status}</div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <SecondaryButton className="h-10" onClick={() => void resetPin(member.memberId)}>
                    PIN 0000 초기화
                  </SecondaryButton>
                  <SecondaryButton className="h-10" onClick={() => void updatePhone(member)}>
                    연락처 수정
                  </SecondaryButton>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="mt-5">
        <Card className="text-center">
          <div className="brand-gradient mx-auto mb-3 h-1.5 w-14" />
          <h2 className="text-xl font-black text-zinc-950">최근 구매</h2>
          <div className="mt-4 space-y-3">
            {(dashboard?.recentPurchases ?? []).slice(0, 12).map((purchase) => {
              const notifiable =
                purchase.paymentStatus === "cash_pending" ||
                purchase.paymentStatus === "transfer_pending" ||
                purchase.paymentStatus === "unpaid";
              return (
                <div className="border border-zinc-200 bg-white p-3 text-left" key={purchase.purchaseId}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-black text-zinc-950">
                        {purchase.nameSnapshot} · {won(purchase.totalAmount)}원
                      </div>
                      <div className="mt-1 text-sm font-bold text-zinc-500">{purchase.itemSummary}</div>
                      <div className="mt-1 text-xs font-bold text-zinc-400">{formatDateTime(purchase.timestamp)}</div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-black text-zinc-700">
                      {paymentStatusLabel(purchase.paymentStatus)}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {purchase.paymentStatus === "cash_pending" ? (
                      <SecondaryButton className="h-10" onClick={() => void updatePurchaseStatus(purchase.purchaseId, "cash_paid")}>
                        현금 완료
                      </SecondaryButton>
                    ) : null}
                    {purchase.paymentStatus === "transfer_pending" ? (
                      <SecondaryButton className="h-10" onClick={() => void updatePurchaseStatus(purchase.purchaseId, "transfer_paid")}>
                        계좌 완료
                      </SecondaryButton>
                    ) : null}
                    {notifiable ? (
                      <SecondaryButton className="h-10" onClick={() => void updatePurchaseStatus(purchase.purchaseId, "unpaid")}>
                        미납 처리
                      </SecondaryButton>
                    ) : null}
                    {notifiable ? (
                      <SecondaryButton className="h-10" onClick={() => void sendReminder(purchase)}>
                        2일 미납문자
                      </SecondaryButton>
                    ) : null}
                    <SecondaryButton className="h-10" onClick={() => void cancelPurchase(purchase.purchaseId)}>
                      취소
                    </SecondaryButton>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </section>
    </AppShell>
  );
}
