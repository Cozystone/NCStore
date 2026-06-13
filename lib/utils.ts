import type { PaymentMethod, PaymentStatus, Purchase, PurchaseItem } from "@/lib/types";

const KOREA_TIME_ZONE = "Asia/Seoul";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function won(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function compareKoreanNames(a: string, b: string) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KOREA_TIME_ZONE,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatKoreaDateTimeSecond(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date(value))
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} KST`;
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function sheetDateKey(date = new Date()) {
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}`;
}

export function parseSheetNumber(value?: string | number) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const normalized = value.replace(/[^\d.-]/g, "");
  return Number(normalized || 0);
}

export function parseLegacySheetDate(value: string) {
  const match = value.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (!match) return todayKey();
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function formatWonCell(value: number) {
  return `₩${new Intl.NumberFormat("ko-KR").format(value)}`;
}

export function createPaymentStatus(method: PaymentMethod): PaymentStatus {
  return method === "cash" ? "cash_pending" : "transfer_pending";
}

export function paymentMethodLabel(method: PaymentMethod) {
  return method === "cash" ? "현금" : "계좌이체";
}

export function paymentStatusLabel(status: PaymentStatus) {
  switch (status) {
    case "cash_pending":
      return "현금 확인대기";
    case "cash_paid":
      return "현금 수령완료";
    case "transfer_pending":
      return "계좌이체 확인대기";
    case "transfer_paid":
      return "계좌이체 확인완료";
    case "unpaid":
      return "미납";
    case "cancelled":
      return "취소됨";
    default:
      return status;
  }
}

export function summarizeItems(items: PurchaseItem[]) {
  return items.map((item) => `${item.nameSnapshot} x${item.quantity}`).join(", ");
}

export function calcTotal(items: PurchaseItem[]) {
  return items.reduce((sum, item) => sum + item.lineTotal, 0);
}

export function maskPin(pin: string) {
  return "●".repeat(pin.length);
}

export function purchaseIsPending(purchase: Pick<Purchase, "paymentStatus">) {
  return (
    purchase.paymentStatus === "cash_pending" ||
    purchase.paymentStatus === "transfer_pending" ||
    purchase.paymentStatus === "unpaid"
  );
}
