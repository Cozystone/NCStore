import { z } from "zod";

export const pinSchema = z.object({
  memberId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/),
  purpose: z.enum(["purchase", "ledger"]).default("purchase"),
});

export const memberFirstUseSetupSchema = z.object({
  memberId: z.string().min(1),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^01[016789]-?\d{3,4}-?\d{4}$/, "전화번호 형식이 올바르지 않습니다."),
  pin: z.string().regex(/^\d{4}$/),
  pinConfirm: z.string().regex(/^\d{4}$/),
}).refine((value) => value.pin === value.pinConfirm, {
  message: "PIN 확인이 일치하지 않습니다.",
  path: ["pinConfirm"],
});

export const purchaseSchema = z.object({
  memberId: z.string().min(1).optional(),
  externalBuyer: z
    .object({
      name: z.string().min(1).max(30),
      phoneNumber: z.string().max(30).optional(),
    })
    .optional(),
  paymentMethod: z.enum(["cash", "transfer"]),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1),
  deviceId: z.string().optional(),
  note: z.string().optional(),
  idempotencyKey: z.string().min(8),
}).refine((value) => Boolean(value.memberId) !== Boolean(value.externalBuyer), {
  message: "memberId 또는 externalBuyer 중 하나만 필요합니다.",
});

export const suggestionSchema = z.object({
  memberId: z.string().optional(),
  memberName: z.string().min(1).max(30).optional(),
  productName: z.string().min(1).max(50),
  expectedPrice: z.number().int().positive().max(100000).optional(),
  reason: z.string().max(300).optional(),
});

export const adminLoginSchema = z.object({
  password: z.string().min(1),
});

export const purchaseStatusSchema = z.object({
  paymentStatus: z.enum([
    "cash_pending",
    "cash_paid",
    "transfer_pending",
    "transfer_paid",
    "unpaid",
    "cancelled",
  ]),
});

export const productSchema = z.object({
  name: z.string().min(1).max(50),
  price: z.number().int().min(0).max(100000),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  sheetItemName: z.string().min(1).max(50).optional(),
  aliases: z.array(z.string().min(1).max(50)).optional(),
  lowStockThreshold: z.number().int().min(0).max(10000).optional(),
  imageUrl: z.string().url().optional(),
});

export const memberSchema = z.object({
  type: z.enum(["student", "teacher"]),
  cohort: z.enum(["1기", "2기", "3기", "4기"]).optional(),
  grade: z.string().max(30).optional(),
  name: z.string().min(1).max(30),
  gender: z.string().max(10).optional(),
  status: z.enum(["active", "leave", "graduated", "inactive"]).default("active"),
  isAdmin: z.boolean().optional(),
  phoneNumber: z.string().max(30).optional(),
  smsOptIn: z.boolean().optional(),
  kioskSetupCompletedAt: z.string().optional(),
  faceDescriptor: z.array(z.number()).optional(),
});

export const resetPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
});

export const inventoryAdjustmentSchema = z.object({
  productId: z.string().optional(),
  sheetItemName: z.string().min(1).max(50),
  delta: z.number().int().min(-10000).max(10000),
  reason: z.string().max(120).optional(),
});
