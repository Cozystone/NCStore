"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaceRecognitionPanel } from "@/components/face-recognition-panel";
import { AppMenu, Card, PrimaryButton, SecondaryButton } from "@/components/ui";
import {
  getMemberDisplayGroup,
  getMemberDisplayLabel,
  type MemberDisplayGroup,
} from "@/lib/member-display";
import { compareKoreanNames, paymentMethodLabel, paymentStatusLabel, won } from "@/lib/utils";
import type { ExternalBuyer, PaymentMethod, PaymentStatus, Product, PublicMember, Purchase } from "@/lib/types";

type Step = 1 | 2 | 3 | 4 | 5;
type FaceMode = "recognize" | "enrollScan" | "enrollName" | "enrollDone";

const INACTIVITY_MS = 45_000;
const TRANSFER_ACCOUNT = "카카오뱅크 79423050815";

const stepMeta: Record<Step, { label: string; caption: string }> = {
  1: { label: "상품 선택", caption: "Pick Items" },
  2: { label: "구매자 확인", caption: "Confirm Buyer" },
  3: { label: "결제 방식", caption: "Payment" },
  4: { label: "최종 확인", caption: "Confirm" },
  5: { label: "기록 완료", caption: "Done" },
};

type Props = {
  members: PublicMember[];
  products: Product[];
};

type SuccessState = {
  buyerName: string;
  totalAmount: number;
  itemSummary: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  syncStatus: "synced" | "queued";
};

function getProductImage(product: Product) {
  if (product.imageUrl) return product.imageUrl;
  const productName = `${product.name} ${product.sheetItemName ?? ""}`;
  if (productName.includes("피크닉")) {
    return "https://absolute.maeil.com/upload/product/display/A0000265__202401190210015730.jpg";
  }
  if (productName.includes("몬스터")) {
    return "https://m.media-amazon.com/images/I/41vEdFSWP1L._AC_.jpg";
  }
  if (productName.includes("초코파이")) {
    return "https://img06.weeecdn.com/item/image/686/676/3F8C40F7ABD5FCC7.jpg";
  }
  if (productName.includes("계란")) {
    return "https://eggfac.com/web/product/big/202605/d32d87eb60cae070a660157bcdda6c0b.jpg";
  }
  if (productName.includes("웜즈") || productName.includes("구미") || productName.includes("젤리")) {
    return "https://jnjint.kr/web/product/big/202505/637d107c91aa9d4317bb14c046c1f781.jpg";
  }
  if (productName.includes("이클립스")) {
    return "https://img06.weeecdn.com/item/image/111/231/4A0BD51B7008F3DC.jpeg";
  }
  if (productName.includes("허니버터")) {
    return "https://img06.weeecdn.com/product/image/016/714/C3EA00EA09C1393.png";
  }
  return null;
}

function KioskTopbar({
  canGoBack,
  itemCount,
  onBack,
  resetPaused,
  resetSecondsLeft,
  step,
  totalAmount,
}: {
  canGoBack: boolean;
  itemCount: number;
  onBack: () => void;
  resetPaused: boolean;
  resetSecondsLeft: number;
  step: Step;
  totalAmount: number;
}) {
  return (
    <header className="kiosk-topbar mx-auto flex h-16 w-full max-w-6xl shrink-0 items-center justify-between gap-3">
      <div className="flex min-w-20 items-center gap-2">
        {canGoBack ? (
          <button
            className="h-10 border border-zinc-300 bg-white px-3 text-xs font-black text-zinc-800 shadow-sm transition active:scale-[0.98]"
            onClick={onBack}
            type="button"
          >
            이전
          </button>
        ) : null}
        <AppMenu />
      </div>
      <div className="min-w-0 flex-1 text-center">
        <Image
          alt="Next Challenge School"
          className="mx-auto h-8 w-auto"
          height={44}
          priority
          src="/ncs-logo.png"
          width={144}
        />
        <div className="mt-1 text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400">
          {stepMeta[step].caption}
        </div>
        <div className="mt-0.5 text-[10px] font-bold text-zinc-400">
          {resetPaused ? "얼굴 등록 중 자동 초기화 일시정지" : `${step === 5 ? "홈 복귀" : "자동 초기화"} ${resetSecondsLeft}초`}
        </div>
      </div>
      <div className="min-w-20 border border-zinc-200 bg-white px-2 py-2 text-center shadow-sm">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">{itemCount}개</div>
        <div className="mt-0.5 text-sm font-black text-zinc-950">{won(totalAmount)}</div>
      </div>
    </header>
  );
}

function StepPills({ step }: { step: Step }) {
  return (
    <div className="kiosk-step-track mx-auto flex w-full max-w-md justify-center gap-1.5">
      {([1, 2, 3, 4, 5] as Step[]).map((value) => (
        <div
          className={`h-1.5 flex-1 rounded-full ${value <= step ? "bg-zinc-950" : "bg-zinc-200"}`}
          key={value}
          title={stepMeta[value].label}
        />
      ))}
    </div>
  );
}

export function KioskClient({ members, products }: Props) {
  const [localMembers, setLocalMembers] = useState(members);
  const [localProducts, setLocalProducts] = useState(products);
  const [step, setStep] = useState<Step>(1);
  const [query, setQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<PublicMember | null>(null);
  const [externalBuyer, setExternalBuyer] = useState<ExternalBuyer | null>(null);
  const [externalName, setExternalName] = useState("");
  const [externalPhone, setExternalPhone] = useState("");
  const [setupMember, setSetupMember] = useState<PublicMember | null>(null);
  const [setupPhone, setSetupPhone] = useState("");
  const [setupPin, setSetupPin] = useState("");
  const [setupPinConfirm, setSetupPinConfirm] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [showFace, setShowFace] = useState(false);
  const [faceInitialMode, setFaceInitialMode] = useState<"recognize" | "enrollScan">("recognize");
  const [faceMode, setFaceMode] = useState<FaceMode>("recognize");
  const [resetSecondsLeft, setResetSecondsLeft] = useState(Math.ceil(INACTIVITY_MS / 1000));
  const timer = useRef<number | null>(null);

  const visibleProducts = useMemo(
    () => [...localProducts].filter((product) => product.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [localProducts],
  );

  const groupedMembers = useMemo(() => {
    const normalizedQuery = query.trim();
    const activeMembers = localMembers.filter((member) => {
      if (member.status !== "active") return false;
      if (normalizedQuery && !member.name.includes(normalizedQuery)) return false;
      return true;
    });

    const groups: Array<{ key: MemberDisplayGroup; title: string; members: PublicMember[] }> = [
      { key: "student", title: "학생", members: [] },
      { key: "adult", title: "성인", members: [] },
      { key: "teacher", title: "교사", members: [] },
    ];

    for (const member of activeMembers) {
      groups.find((item) => item.key === getMemberDisplayGroup(member))?.members.push(member);
    }

    for (const group of groups) {
      group.members.sort((a, b) => compareKoreanNames(a.name, b.name));
    }

    return groups.filter((group) => group.members.length > 0);
  }, [localMembers, query]);

  const totalAmount = useMemo(
    () =>
      Object.entries(cart).reduce((sum, [productId, quantity]) => {
        const product = localProducts.find((item) => item.productId === productId);
        return sum + (product?.price ?? 0) * quantity;
      }, 0),
    [cart, localProducts],
  );

  const itemCount = useMemo(() => Object.values(cart).reduce((sum, quantity) => sum + quantity, 0), [cart]);

  const itemSummary = useMemo(
    () =>
      Object.entries(cart)
        .map(([productId, quantity]) => {
          const product = localProducts.find((item) => item.productId === productId);
          return product ? `${product.name} x${quantity}` : null;
        })
        .filter(Boolean)
        .join(", "),
    [cart, localProducts],
  );

  const buyerName = selectedMember?.name ?? externalBuyer?.name ?? "";
  const autoResetPaused = showFace && faceMode !== "recognize";

  function needsFirstUseSetup(member: PublicMember) {
    return member.type === "student" && !member.kioskSetupCompletedAt;
  }

  const refreshProducts = useCallback(async () => {
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      const nextProducts = (await response.json()) as Product[];
      if (response.ok && Array.isArray(nextProducts)) {
        setLocalProducts(nextProducts);
      }
    } catch {
      // Keep the last known stock if the kiosk briefly loses network.
    }
  }, []);

  const resetFlow = useCallback(() => {
    setStep(1);
    setQuery("");
    setSelectedMember(null);
    setExternalBuyer(null);
    setExternalName("");
    setExternalPhone("");
    setSetupMember(null);
    setSetupPhone("");
    setSetupPin("");
    setSetupPinConfirm("");
    setPin("");
    setError(null);
    setCart({});
    setPaymentMethod("cash");
    setSubmitting(false);
    setSuccess(null);
    setShowFace(false);
    setFaceInitialMode("recognize");
    setFaceMode("recognize");
    void refreshProducts();
  }, [refreshProducts]);

  const goBack = useCallback(() => {
    setError(null);
    if (showFace) {
      setShowFace(false);
      setFaceInitialMode("recognize");
      setFaceMode("recognize");
      return;
    }
    if (setupMember) {
      setSetupMember(null);
      setSetupPhone("");
      setSetupPin("");
      setSetupPinConfirm("");
      setSelectedMember(null);
      setStep(2);
      return;
    }
    if (step === 4) {
      setPin("");
      setStep(3);
      return;
    }
    if (step === 3) {
      setPin("");
      setPaymentMethod("cash");
      setStep(2);
      return;
    }
    if (step === 2) {
      setSelectedMember(null);
      setExternalBuyer(null);
      setExternalName("");
      setExternalPhone("");
      setStep(1);
    }
  }, [setupMember, showFace, step]);

  useEffect(() => {
    if (step !== 1 || showFace) return;

    const initialRefreshTimer = window.setTimeout(() => {
      void refreshProducts();
    }, 0);
    const stockRefreshTimer = window.setInterval(() => {
      void refreshProducts();
    }, 15_000);

    return () => {
      window.clearTimeout(initialRefreshTimer);
      window.clearInterval(stockRefreshTimer);
    };
  }, [refreshProducts, showFace, step]);

  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    const duration = success ? 5_000 : INACTIVITY_MS;
    let initialTick: number | null = null;
    if (autoResetPaused) {
      return;
    }

    initialTick = window.setTimeout(() => {
      setResetSecondsLeft(Math.ceil(duration / 1000));
    }, 0);
    timer.current = window.setInterval(() => {
      setResetSecondsLeft((current) => {
        if (current <= 1) {
          if (timer.current) window.clearInterval(timer.current);
          resetFlow();
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => {
      if (initialTick) window.clearTimeout(initialTick);
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [
    autoResetPaused,
    cart,
    externalBuyer,
    paymentMethod,
    pin,
    query,
    resetFlow,
    selectedMember,
    setupMember,
    setupPhone,
    setupPin,
    setupPinConfirm,
    showFace,
    step,
    success,
  ]);

  function chooseMember(member: PublicMember) {
    setSelectedMember(member);
    setExternalBuyer(null);
    setPin("");
    setError(null);
    setShowFace(false);
    setFaceMode("recognize");
    if (needsFirstUseSetup(member)) {
      setSetupMember(member);
      setSetupPhone("");
      setSetupPin("");
      setSetupPinConfirm("");
      setStep(2);
      return;
    }
    setSetupMember(null);
    setStep(3);
  }

  function chooseExternalBuyer() {
    const name = externalName.trim();
    const phoneNumber = externalPhone.trim();
    if (!name) {
      setError("외부인 이름을 입력해 주세요.");
      return;
    }
    setSelectedMember(null);
    setExternalBuyer({ name, phoneNumber: phoneNumber || undefined });
    setError(null);
    setStep(3);
  }

  async function submitFirstUseSetup() {
    if (!setupMember || submitting) return;
    const phoneNumber = setupPhone.trim();
    if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(phoneNumber)) {
      setError("전화번호를 010-1234-5678 형식으로 입력해 주세요.");
      return;
    }
    if (!/^\d{4}$/.test(setupPin) || !/^\d{4}$/.test(setupPinConfirm)) {
      setError("결제 PIN은 숫자 4자리로 설정해 주세요.");
      return;
    }
    if (setupPin !== setupPinConfirm) {
      setError("PIN 확인이 일치하지 않습니다.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/members/first-use-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: setupMember.memberId,
        phoneNumber,
        pin: setupPin,
        pinConfirm: setupPinConfirm,
      }),
    });
    const payload = await response.json();
    setSubmitting(false);

    if (!response.ok) {
      setError(payload.error ?? "최초 설정을 저장하지 못했습니다.");
      return;
    }

    const updatedMember = payload.member as PublicMember;
    setLocalMembers((current) =>
      current.map((member) => (member.memberId === updatedMember.memberId ? updatedMember : member)),
    );
    setSelectedMember(updatedMember);
    setSetupMember(null);
    setSetupPhone("");
    setSetupPin("");
    setSetupPinConfirm("");
    setStep(3);
  }

  function openFace(mode: "recognize" | "enrollScan") {
    setFaceInitialMode(mode);
    setFaceMode(mode);
    setShowFace(true);
  }

  function handleFaceEnrollment(member: PublicMember) {
    setLocalMembers((current) =>
      current.map((candidate) => (candidate.memberId === member.memberId ? member : candidate)),
    );
  }

  function updateQuantity(productId: string, delta: number) {
    setError(null);
    setCart((current) => {
      const product = localProducts.find((item) => item.productId === productId);
      const currentQuantity = current[productId] ?? 0;
      const next = currentQuantity + delta;
      if (next <= 0) {
        const rest = { ...current };
        delete rest[productId];
        return rest;
      }
      if (typeof product?.stock === "number" && next > product.stock) {
        setError(`${product.name} 재고는 ${product.stock}개까지 구매할 수 있습니다.`);
        return current;
      }
      return { ...current, [productId]: next };
    });
  }

  function decrementLocalStock(purchase: Purchase) {
    setLocalProducts((current) =>
      current.map((product) => {
        const purchased = purchase.items.find((item) => item.productId === product.productId);
        if (!purchased || typeof product.stock !== "number") return product;
        return {
          ...product,
          stock: Math.max(0, product.stock - purchased.quantity),
        };
      }),
    );
  }

  async function createPurchase() {
    if (!Object.keys(cart).length || submitting) return;
    setError(null);

    if (!selectedMember && !externalBuyer) {
      setError("구매자를 먼저 확인해 주세요.");
      return;
    }

    if (externalBuyer && paymentMethod === "transfer" && !externalBuyer.phoneNumber?.trim()) {
      setError("외부인 계좌이체는 미납 안내를 위해 전화번호가 필요합니다.");
      return;
    }

    setSubmitting(true);
    const purchaseResponse = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: selectedMember?.memberId,
        externalBuyer: externalBuyer
          ? {
              name: externalBuyer.name,
              phoneNumber: externalBuyer.phoneNumber,
            }
          : undefined,
        paymentMethod,
        items: Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity })),
        idempotencyKey: crypto.randomUUID(),
        deviceId: "kiosk-tablet",
      }),
    });
    const purchasePayload = await purchaseResponse.json();
    setSubmitting(false);

    if (!purchaseResponse.ok) {
      if (purchaseResponse.status === 409 && Array.isArray(purchasePayload.shortages)) {
        const shortageText = purchasePayload.shortages
          .map((item: { name: string; available: number }) => `${item.name} 남은 재고 ${item.available}개`)
          .join(", ");
        setError(`재고가 부족합니다. ${shortageText}`);
        setStep(1);
        return;
      }
      setError(purchasePayload.error ?? "구매를 기록하지 못했습니다.");
      return;
    }

    const purchase = purchasePayload.purchase as Purchase;
    decrementLocalStock(purchase);
    setSuccess({
      buyerName: purchase.nameSnapshot,
      totalAmount: purchase.totalAmount,
      itemSummary: purchase.itemSummary,
      paymentMethod: purchase.paymentMethod,
      paymentStatus: purchase.paymentStatus,
      syncStatus: purchasePayload.syncStatus,
    });
    setStep(5);
  }

  async function verifyPinAndSubmit() {
    if (!selectedMember) return;
    setError(null);

    const pinResponse = await fetch("/api/pin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: selectedMember.memberId, pin, purpose: "purchase" }),
    });
    const pinPayload = await pinResponse.json();

    if (!pinResponse.ok || !pinPayload.ok) {
      setError(
        pinPayload.lockedUntil
          ? "PIN 오류가 5회 누적되어 1분 동안 잠겼습니다."
          : "PIN이 올바르지 않습니다.",
      );
      setPin("");
      return;
    }

    await createPurchase();
  }

  return (
    <main className="kiosk-screen grid h-dvh max-h-dvh overflow-hidden bg-[#f4f6fa] text-center text-zinc-950">
      <section className="kiosk-shell grid-field-light flex min-h-0 flex-col px-3 py-3 sm:px-5">
        <KioskTopbar
          canGoBack={!submitting && (showFace || (step > 1 && step < 5))}
          itemCount={itemCount}
          onBack={goBack}
          resetPaused={autoResetPaused}
          resetSecondsLeft={resetSecondsLeft}
          step={step}
          totalAmount={totalAmount}
        />
        <StepPills step={step} />

        {error ? (
          <div className="mx-auto mt-2 w-full max-w-6xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            {error}
          </div>
        ) : null}

        <div className="kiosk-stage mx-auto mt-3 min-h-0 w-full max-w-6xl flex-1 overflow-hidden">
          {step === 1 ? (
            <div className="flex h-full flex-col gap-3">
              <Card className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
                <div className="mx-auto max-w-xl">
                  <div className="brand-gradient mx-auto mb-3 h-1.5 w-16" />
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400">Purchase First</p>
                  <h1 className="mt-1 text-2xl font-black text-zinc-950 sm:text-3xl">구매할 상품을 골라 주세요</h1>
                </div>

                <div className="kiosk-product-grid mt-3 grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto pr-1 md:grid-cols-3 xl:grid-cols-4">
                  {visibleProducts.map((product) => {
                    const image = getProductImage(product);
                    const quantity = cart[product.productId] ?? 0;
                    const soldOut = typeof product.stock === "number" && product.stock <= 0;
                    const maxed = typeof product.stock === "number" && quantity >= product.stock;
                    const lowStock =
                      typeof product.stock === "number" &&
                      product.stock > 0 &&
                      product.stock <= (product.lowStockThreshold ?? 5);
                    return (
                      <section
                        className={`kiosk-product-card flex min-h-[142px] flex-col border bg-white p-2 transition ${
                          quantity ? "border-zinc-950 shadow-[0_8px_28px_rgba(9,9,11,0.12)]" : "border-zinc-200"
                        } ${soldOut ? "opacity-55" : ""}`}
                        key={product.productId}
                      >
                        <div className="flex flex-1 items-center justify-center gap-2">
                          <div className="kiosk-product-image relative h-14 w-14 shrink-0 border border-zinc-100 bg-zinc-50 sm:h-16 sm:w-16">
                            {image ? (
                              <Image
                                alt={product.name}
                                className="object-contain p-1.5"
                                fill
                                sizes="64px"
                                src={image}
                                unoptimized
                              />
                            ) : (
                              <div className="brand-gradient h-full w-full opacity-20" />
                            )}
                          </div>
                          <div className="min-w-0 text-center">
                            <div className="line-clamp-2 text-sm font-black leading-5 text-zinc-950 sm:text-base">
                              {product.name}
                            </div>
                            <div className="mt-1 text-sm font-black text-zinc-500">{won(product.price)}원</div>
                            <div className={lowStock ? "mt-0.5 text-xs font-black text-red-600" : "mt-0.5 text-xs font-bold text-zinc-400"}>
                              {typeof product.stock === "number" ? (soldOut ? "품절" : `남은 재고 ${product.stock}개`) : "재고 확인 중"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-[40px_minmax(0,1fr)_40px] items-center">
                          <button
                            className="h-10 border border-zinc-300 bg-white text-lg font-black text-zinc-950 transition active:scale-95 disabled:opacity-40"
                            disabled={!quantity}
                            onClick={() => updateQuantity(product.productId, -1)}
                            type="button"
                          >
                            -
                          </button>
                          <span className="text-center text-lg font-black text-zinc-950">{quantity}</span>
                          <button
                            className="h-10 bg-zinc-950 text-lg font-black text-white transition active:scale-95 disabled:bg-zinc-300"
                            disabled={soldOut || maxed}
                            onClick={() => updateQuantity(product.productId, 1)}
                            type="button"
                          >
                            +
                          </button>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </Card>

              <div className="kiosk-cart-bar card shrink-0 p-3 shadow-[0_14px_45px_rgba(18,22,33,0.1)]">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px] sm:items-center">
                  <div className="min-w-0 text-center sm:text-left">
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">
                      {itemCount ? `${itemCount}개 선택됨` : "아직 선택한 상품이 없습니다"}
                    </div>
                    <div className="mt-1 truncate text-sm font-bold text-zinc-700">
                      {itemSummary || "상품을 누르면 장바구니에 담깁니다."}
                    </div>
                  </div>
                  <PrimaryButton className="h-11" disabled={!totalAmount} onClick={() => setStep(2)}>
                    {totalAmount ? `${won(totalAmount)}원 구매자 확인` : "상품 선택"}
                  </PrimaryButton>
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            setupMember ? (
              <div className="kiosk-center-panel flex h-full items-center justify-center">
                <Card className="kiosk-center-card w-full max-w-xl p-5 sm:p-6">
                  <div className="brand-gradient mx-auto mb-4 h-1.5 w-16" />
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400">First Setup</p>
                  <h1 className="mt-2 text-3xl font-black text-zinc-950">처음 사용하는 학생 설정</h1>
                  <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-6 text-zinc-500">
                    {setupMember.name}님, 기존 전화번호가 있어도 처음 한 번은 전화번호와 결제 PIN 4자리를 새로 확인해 주세요.
                    다음 구매부터는 PIN만 입력하면 됩니다.
                  </p>

                  <div className="mx-auto mt-5 grid max-w-md gap-3">
                    <label className="text-left">
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Phone</span>
                      <input
                        className="mt-1 h-12 w-full border border-zinc-300 px-4 text-center text-base font-black outline-none focus:border-zinc-950"
                        inputMode="tel"
                        onChange={(event) => setSetupPhone(event.target.value)}
                        placeholder="010-1234-5678"
                        value={setupPhone}
                      />
                    </label>
                    <label className="text-left">
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Payment PIN</span>
                      <input
                        className="mt-1 h-12 w-full border border-zinc-300 px-4 text-center text-xl font-black tracking-[0.35em] outline-none focus:border-zinc-950"
                        inputMode="numeric"
                        maxLength={4}
                        onChange={(event) => setSetupPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="0000"
                        type="password"
                        value={setupPin}
                      />
                    </label>
                    <label className="text-left">
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">PIN Confirm</span>
                      <input
                        className="mt-1 h-12 w-full border border-zinc-300 px-4 text-center text-xl font-black tracking-[0.35em] outline-none focus:border-zinc-950"
                        inputMode="numeric"
                        maxLength={4}
                        onChange={(event) => setSetupPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="0000"
                        type="password"
                        value={setupPinConfirm}
                      />
                    </label>
                  </div>

                  <div className="mx-auto mt-5 grid max-w-md gap-2 sm:grid-cols-2">
                    <SecondaryButton
                      className="h-11"
                      onClick={() => {
                        setSetupMember(null);
                        setSelectedMember(null);
                        setSetupPhone("");
                        setSetupPin("");
                        setSetupPinConfirm("");
                        setError(null);
                      }}
                      type="button"
                    >
                      이름 다시 선택
                    </SecondaryButton>
                    <PrimaryButton
                      className="h-11"
                      disabled={submitting || setupPhone.trim().length < 10 || setupPin.length !== 4 || setupPinConfirm.length !== 4}
                      onClick={() => void submitFirstUseSetup()}
                      type="button"
                    >
                      {submitting ? "저장 중..." : "저장하고 계속"}
                    </PrimaryButton>
                  </div>
                </Card>
              </div>
            ) : showFace ? (
              <FaceRecognitionPanel
                key={faceInitialMode}
                fullScreen
                initialMode={faceInitialMode}
                members={localMembers}
                onClose={() => {
                  setShowFace(false);
                  setFaceMode("recognize");
                }}
                onEnrollComplete={handleFaceEnrollment}
                onModeChange={setFaceMode}
                onSelect={chooseMember}
              />
            ) : (
              <div className="kiosk-buyer-grid grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
                <Card className="flex min-h-0 flex-col p-3 sm:p-4">
                  <div className="mx-auto max-w-xl">
                    <div className="brand-gradient mx-auto mb-3 h-1.5 w-16" />
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400">Confirm Buyer</p>
                    <h1 className="mt-1 text-2xl font-black text-zinc-950 sm:text-3xl">누가 구매하나요?</h1>
                    <div className="mt-2 text-sm font-bold text-zinc-500">{itemSummary}</div>
                  </div>

                  <input
                    className="mx-auto mt-3 h-11 w-full max-w-lg border border-zinc-300 bg-white px-4 text-center text-sm font-bold text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="이름 검색"
                    value={query}
                  />

                  <div className="mt-3 min-h-0 flex-1 overflow-y-auto border border-zinc-200 bg-white">
                    {groupedMembers.length ? (
                      groupedMembers.map((group) => (
                        <section className="border-b border-zinc-200 last:border-b-0" key={group.key}>
                          <div className="sticky top-0 z-10 flex items-center justify-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
                            <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500">
                              {group.title}
                            </h2>
                            <span className="text-xs font-bold text-zinc-400">{group.members.length}명</span>
                          </div>
                          <div className="divide-y divide-zinc-100">
                            {group.members.map((member) => (
                              <button
                                className="flex min-h-14 w-full items-center justify-center gap-3 px-4 py-2 text-center transition hover:bg-zinc-50 active:bg-zinc-100"
                                key={member.memberId}
                                onClick={() => chooseMember(member)}
                                type="button"
                              >
                                <span>
                                  <span className="block text-lg font-black text-zinc-950">{member.name}</span>
                                  <span className="mt-0.5 block text-xs font-semibold text-zinc-500">
                                    {getMemberDisplayLabel(member)}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </section>
                      ))
                    ) : (
                      <div className="p-8 text-center text-sm text-zinc-500">검색 결과가 없습니다.</div>
                    )}
                  </div>
                </Card>

                <aside className="kiosk-buyer-actions flex min-h-0 flex-col gap-3 overflow-y-auto">
                  <Card className="p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400">Face ID</p>
                    <h2 className="mt-2 text-xl font-black text-zinc-950">얼굴 인식</h2>
                    <p className="mt-2 text-sm font-semibold leading-6 text-zinc-500">
                      얼굴인식을 누르면 화면 전체가 카메라 모드로 바뀝니다.
                    </p>
                    <div className="mt-4 grid gap-2">
                      <SecondaryButton className="h-11" onClick={() => openFace("recognize")} type="button">
                        얼굴 인식 시작
                      </SecondaryButton>
                      <PrimaryButton className="h-11 bg-cyan-600 hover:bg-cyan-700" onClick={() => openFace("enrollScan")} type="button">
                        처음이면 얼굴 등록
                      </PrimaryButton>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400">Guest</p>
                    <h2 className="mt-2 text-xl font-black text-zinc-950">외부인 구매</h2>
                    <div className="mt-3 grid gap-2">
                      <input
                        className="h-11 border border-zinc-300 px-3 text-center text-sm font-bold outline-none focus:border-zinc-950"
                        onChange={(event) => setExternalName(event.target.value)}
                        placeholder="외부인 이름"
                        value={externalName}
                      />
                      <input
                        className="h-11 border border-zinc-300 px-3 text-center text-sm font-bold outline-none focus:border-zinc-950"
                        inputMode="tel"
                        onChange={(event) => setExternalPhone(event.target.value)}
                        placeholder="전화번호(계좌이체 시 필수)"
                        value={externalPhone}
                      />
                      <PrimaryButton className="h-11" onClick={chooseExternalBuyer} type="button">
                        외부인으로 구매
                      </PrimaryButton>
                    </div>
                  </Card>

                  <SecondaryButton className="h-11" onClick={() => setStep(1)}>
                    상품으로 돌아가기
                  </SecondaryButton>
                </aside>
              </div>
            )
          ) : null}

          {step === 3 && buyerName ? (
            <div className="kiosk-center-panel flex h-full items-center justify-center">
              <Card className="kiosk-center-card w-full max-w-xl p-5 sm:p-6">
                <div className="brand-gradient mx-auto mb-4 h-1.5 w-16" />
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400">Payment Method</p>
                <h1 className="mt-2 text-3xl font-black text-zinc-950">결제 방식을 골라 주세요</h1>

                <div className="mx-auto mt-5 max-w-md border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-sm font-semibold text-zinc-500">{buyerName}</div>
                  <div className="mt-1 text-3xl font-black text-zinc-950">{won(totalAmount)}원</div>
                  <div className="mt-2 text-sm font-bold text-zinc-600">{itemSummary}</div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {(["cash", "transfer"] as PaymentMethod[]).map((method) => {
                    const active = paymentMethod === method;
                    return (
                      <button
                        className={`min-h-24 border p-4 text-center transition active:scale-[0.99] ${
                          active
                            ? "border-zinc-950 bg-zinc-950 text-white"
                            : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-950"
                        }`}
                        key={method}
                        onClick={() => setPaymentMethod(method)}
                        type="button"
                      >
                        <div className="text-lg font-black">{paymentMethodLabel(method)}</div>
                        <div className={active ? "mt-1 text-xs font-semibold text-white/70" : "mt-1 text-xs font-semibold text-zinc-500"}>
                          {method === "cash" ? "준서에게 현금 전달" : "장부 기록 후 계좌이체"}
                        </div>
                        {method === "transfer" ? (
                          <div className={active ? "mt-2 text-xs font-black text-white" : "mt-2 text-xs font-black text-zinc-950"}>
                            {TRANSFER_ACCOUNT}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <SecondaryButton className="h-11" onClick={() => setStep(2)}>
                    구매자 다시 선택
                  </SecondaryButton>
                  <PrimaryButton className="h-11" onClick={() => setStep(4)}>
                    {selectedMember ? "PIN 입력" : "외부인 확인"}
                  </PrimaryButton>
                </div>
              </Card>
            </div>
          ) : null}

          {step === 4 && selectedMember ? (
            <div className="kiosk-center-panel flex h-full items-center justify-center">
              <Card className="kiosk-center-card w-full max-w-xl p-5 sm:p-6">
                <div className="brand-gradient mx-auto mb-4 h-1.5 w-16" />
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400">Confirm PIN</p>
                <h1 className="mt-2 text-3xl font-black text-zinc-950">{selectedMember.name}</h1>

                <div className="mx-auto mt-4 max-w-md border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-sm font-bold leading-6 text-zinc-900">{itemSummary}</div>
                  <div className="mt-3 flex items-center justify-center gap-4 border-t border-zinc-200 pt-3">
                    <span className="text-sm font-semibold text-zinc-500">{paymentMethodLabel(paymentMethod)}</span>
                    <span className="text-xl font-black text-zinc-950">{won(totalAmount)}원</span>
                  </div>
                  {paymentMethod === "transfer" ? (
                    <div className="mt-2 text-sm font-black text-zinc-950">{TRANSFER_ACCOUNT}</div>
                  ) : null}
                </div>

                <div className="mt-4 flex justify-center gap-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      className="flex h-11 w-11 items-center justify-center border border-zinc-300 bg-white text-2xl"
                      key={index}
                    >
                      {index < pin.length ? "●" : ""}
                    </div>
                  ))}
                </div>

                <div className="mx-auto mt-4 grid max-w-[320px] grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "지움", "0", "결제"].map((key) => (
                    <button
                      className="h-12 border border-zinc-300 bg-white text-lg font-black text-zinc-950 transition hover:border-zinc-950 hover:bg-zinc-50 disabled:opacity-50"
                      disabled={submitting}
                      key={key}
                      onClick={() => {
                        if (key === "지움") {
                          setPin((current) => current.slice(0, -1));
                          return;
                        }
                        if (key === "결제") {
                          if (pin.length === 4) void verifyPinAndSubmit();
                          return;
                        }
                        setPin((current) => (current.length < 4 ? `${current}${key}` : current));
                      }}
                      type="button"
                    >
                      {key}
                    </button>
                  ))}
                </div>

                {submitting ? <p className="mt-3 text-sm font-semibold text-zinc-500">구매를 기록하고 있습니다...</p> : null}
                <div className="mt-3">
                  <SecondaryButton className="h-11" onClick={() => setStep(3)}>
                    이전으로
                  </SecondaryButton>
                </div>
              </Card>
            </div>
          ) : null}

          {step === 4 && externalBuyer ? (
            <div className="kiosk-center-panel flex h-full items-center justify-center">
              <Card className="kiosk-center-card w-full max-w-xl p-5 sm:p-6">
                <div className="brand-gradient mx-auto mb-4 h-1.5 w-16" />
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400">Guest Confirm</p>
                <h1 className="mt-2 text-3xl font-black text-zinc-950">외부인 구매 확인</h1>
                <div className="mx-auto mt-5 max-w-md border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-sm font-semibold text-zinc-500">{externalBuyer.name}</div>
                  <div className="mt-1 text-3xl font-black text-zinc-950">{won(totalAmount)}원</div>
                  <div className="mt-2 text-sm font-bold text-zinc-700">{itemSummary}</div>
                  <div className="mt-3 border-t border-zinc-200 pt-3 text-sm font-black text-zinc-950">
                    {paymentMethod === "cash" ? "현금은 준서에게 전달해 주세요." : `계좌: ${TRANSFER_ACCOUNT}`}
                  </div>
                </div>
                {paymentMethod === "transfer" ? (
                  <input
                    className="mx-auto mt-4 h-12 w-full max-w-md border border-zinc-300 px-4 text-center text-base font-black outline-none focus:border-zinc-950"
                    inputMode="tel"
                    onChange={(event) => {
                      const phoneNumber = event.target.value;
                      setExternalPhone(phoneNumber);
                      setExternalBuyer((current) => current ? { ...current, phoneNumber } : current);
                    }}
                    placeholder="전화번호 필수"
                    value={externalBuyer.phoneNumber ?? externalPhone}
                  />
                ) : null}
                {submitting ? <p className="mt-3 text-sm font-semibold text-zinc-500">구매를 기록하고 있습니다...</p> : null}
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <SecondaryButton className="h-11" onClick={() => setStep(3)}>
                    이전으로
                  </SecondaryButton>
                  <PrimaryButton className="h-11" disabled={submitting} onClick={() => void createPurchase()}>
                    장부에 기록
                  </PrimaryButton>
                </div>
              </Card>
            </div>
          ) : null}

          {step === 5 && success ? (
            <div className="kiosk-center-panel flex h-full items-center justify-center">
              <Card className="kiosk-center-card w-full max-w-xl p-5 sm:p-6">
                <div className="brand-gradient mx-auto mb-4 h-1.5 w-16" />
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400">Completed</p>
                <h1 className="mt-2 text-3xl font-black text-zinc-950">기록 완료</h1>

                <div className="mt-5 space-y-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-500">구매자</div>
                    <div className="mt-1 text-xl font-black text-zinc-950">{success.buyerName}</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-zinc-500">선택 상품</div>
                    <div className="mt-1 text-base font-medium text-zinc-800">{success.itemSummary}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="border border-zinc-200 bg-zinc-50 p-3">
                      <div className="text-sm font-semibold text-zinc-500">결제 방식</div>
                      <div className="mt-1 font-black text-zinc-950">{paymentMethodLabel(success.paymentMethod)}</div>
                    </div>
                    <div className="border border-zinc-200 bg-zinc-50 p-3">
                      <div className="text-sm font-semibold text-zinc-500">상태</div>
                      <div className="mt-1 font-black text-zinc-950">{paymentStatusLabel(success.paymentStatus)}</div>
                    </div>
                  </div>
                  <div className="border border-zinc-800 bg-zinc-950 p-3 text-sm font-semibold text-white">
                    Google Sheets {success.syncStatus === "synced" ? "반영 완료" : "동기화 대기"} 상태입니다.
                  </div>
                  {success.paymentMethod === "transfer" ? (
                    <div className="border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold text-zinc-700">
                      계좌이체는 장부에 기록되었습니다. <span className="font-black text-zinc-950">{TRANSFER_ACCOUNT}</span>
                    </div>
                  ) : (
                    <div className="border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                      현금은 준서에게 전달해 주세요.
                    </div>
                  )}
                  <PrimaryButton className="h-11" onClick={resetFlow}>
                    {won(success.totalAmount)}원 확인
                  </PrimaryButton>
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
