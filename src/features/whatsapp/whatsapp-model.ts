import { z } from "zod";
export const senderPhone = "+905391375702";
export const recipientFormSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(80),
    phone: z
      .string()
      .trim()
      .regex(
        /^\+[1-9][0-9]{7,14}$/,
        "Use a phone number with + and country code",
      )
      .refine(
        (v) => v !== senderPhone,
        "The recipient must differ from the sender",
      ),
    is_active: z.boolean(),
    daily: z.boolean(),
    weekly: z.boolean(),
    consent: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.is_active && !v.consent)
      ctx.addIssue({
        code: "custom",
        path: ["consent"],
        message: "Confirm permission to receive reports",
      });
    if (v.is_active && !v.daily && !v.weekly)
      ctx.addIssue({
        code: "custom",
        path: ["daily"],
        message: "Choose daily or weekly reports",
      });
  });
export type RecipientForm = z.infer<typeof recipientFormSchema>;
export const recipientSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  phone: z.string(),
  is_active: z.boolean(),
  daily: z.boolean(),
  weekly: z.boolean(),
  consent_at: z.string().nullable(),
  revision: z.number().int(),
});
export type Recipient = z.infer<typeof recipientSchema>;
export const statusLabels: Record<string, string> = {
  queued: "Queued",
  sending: "Sending",
  accepted: "Accepted by Meta",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
  unknown: "Delivery uncertain",
  skipped: "Skipped",
};
export const contextSchema = z.object({
  settings: z.object({
    sender_phone: z.string(),
    enabled: z.boolean(),
    revision: z.number().int(),
  }),
  recipients: z.array(recipientSchema),
  history: z.array(
    z.object({
      id: z.uuid(),
      recipient_id: z.uuid(),
      phone: z.string(),
      kind: z.enum(["daily", "weekly", "test"]),
      period_from: z.string(),
      period_to: z.string(),
      status: z.enum([
        "queued",
        "sending",
        "accepted",
        "sent",
        "delivered",
        "read",
        "failed",
        "unknown",
        "skipped",
      ]),
      created_at: z.string(),
      updated_at: z.string(),
      error_code: z.string().nullable(),
      message_id: z.string().nullable(),
      generated_at: z.string(),
    }),
  ),
});
