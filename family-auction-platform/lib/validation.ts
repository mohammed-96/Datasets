import { z } from "zod";

export const loginSchema = z.object({
  phone: z.string().min(6, "رقم الجوال غير صحيح"),
  pin: z.string().min(4, "الرقم السري غير صحيح"),
});

export const bidSchema = z.object({
  auctionId: z.string().min(1),
  amount: z.coerce.number().positive(),
});

export const itemSchema = z.object({
  title: z.string().min(1, "اسم القطعة مطلوب"),
  description: z.string().optional(),
  weightGrams: z.coerce.number().positive().optional().nullable(),
  karat: z.string().optional(),
  condition: z.string().optional(),
  notes: z.string().optional(),
  category: z
    .enum(["GOLD", "DIAMOND", "WATCHES", "JEWELRY", "COLLECTIBLES", "OTHER"])
    .optional()
    .nullable(),
  internalCode: z.string().optional(),
});

export const auctionSchema = z
  .object({
    itemId: z.string().min(1),
    openingPrice: z.coerce.number().positive(),
    bidIncrement: z.coerce.number().positive(),
    startAt: z.string().min(1, "تاريخ البداية مطلوب"),
    endAt: z.string().min(1, "تاريخ النهاية مطلوب"),
    softCloseEnabled: z.coerce.boolean().default(true),
    extensionMinutes: z.coerce.number().int().positive().default(2),
  })
  .refine((data) => new Date(data.endAt) > new Date(data.startAt), {
    message: "يجب أن تكون نهاية المزاد بعد بدايته",
    path: ["endAt"],
  });

export const userSchema = z.object({
  realName: z.string().min(1, "الاسم الحقيقي مطلوب"),
  phone: z.string().min(6, "رقم الجوال غير صحيح"),
  alias: z.string().min(1, "المعرف المستعار مطلوب"),
  pin: z.string().min(4, "الرقم السري يجب ألا يقل عن 4 أرقام").optional(),
});
