import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input } from "@/components/ui/input";
import {
  recipientFormSchema,
  type Recipient,
  type RecipientForm,
} from "./whatsapp-model";
import { saveRecipient, useWhatsAppAction } from "./whatsapp-api";
export default function RecipientEditor({
  recipient,
  onClose,
}: {
  recipient?: Recipient;
  onClose: () => void;
}) {
  const f = useForm<RecipientForm>({
    resolver: zodResolver(recipientFormSchema),
    defaultValues: recipient
      ? {
          name: recipient.name,
          phone: recipient.phone,
          is_active: recipient.is_active,
          daily: recipient.daily,
          weekly: recipient.weekly,
          consent: recipient.consent_at !== null,
        }
      : {
          name: "Admin",
          phone: "+905338410938",
          is_active: true,
          daily: true,
          weekly: true,
          consent: false,
        },
  });
  const save = useWhatsAppAction(
    (v: RecipientForm) => saveRecipient(v, recipient),
    onClose,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{recipient ? "Edit recipient" : "Add recipient"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={f.handleSubmit((v) => save.mutate(v))}
        >
          {(["name", "phone"] as const).map((key) => (
            <div key={key}>
              <label htmlFor={"wa-" + key}>
                {key === "name"
                  ? "Recipient name"
                  : "WhatsApp number with country code"}
              </label>
              <Input
                id={"wa-" + key}
                type={key === "phone" ? "tel" : "text"}
                autoComplete={key === "phone" ? "tel" : "name"}
                {...f.register(key)}
                aria-invalid={!!f.formState.errors[key]}
                aria-describedby={"wa-" + key + "-error"}
              />
              <FieldError
                id={"wa-" + key + "-error"}
                message={f.formState.errors[key]?.message}
              />
            </div>
          ))}
          {(["is_active", "daily", "weekly", "consent"] as const).map((key) => (
            <div key={key}>
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-brand"
                  aria-invalid={!!f.formState.errors[key]}
                  aria-describedby={"wa-" + key + "-error"}
                  {...f.register(key)}
                />
                {
                  {
                    is_active: "Active recipient",
                    daily: "Daily at 23:00",
                    weekly: "Weekly Monday at 08:00",
                    consent: "This recipient agreed to receive these reports",
                  }[key]
                }
              </label>
              <FieldError
                id={"wa-" + key + "-error"}
                message={f.formState.errors[key]?.message}
              />
            </div>
          ))}
          <p className="text-sm text-muted">
            Times use Europe/Nicosia. Deactivate a recipient to stop future
            sends; delivery history stays.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" requiresOnline disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save recipient"}
            </Button>
            <Button
              variant="secondary"
              disabled={save.isPending}
              onClick={onClose}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
