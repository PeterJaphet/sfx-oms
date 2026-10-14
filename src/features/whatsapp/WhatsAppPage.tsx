import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { senderPhone, statusLabels, type Recipient } from "./whatsapp-model";
import {
  sendTest,
  setEnabled,
  useWhatsApp,
  useWhatsAppAction,
} from "./whatsapp-api";
import RecipientEditor from "./RecipientEditor";
export default function WhatsAppPage() {
  const q = useWhatsApp();
  const [editing, setEditing] = useState<Recipient | true | null>(null);
  const schedule = useWhatsAppAction((enabled: boolean) =>
    setEnabled(enabled, q.data!.settings.revision),
  );
  const test = useWhatsAppAction(sendTest);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] sm:text-[34px]">WhatsApp reports</h1>
          <p className="text-muted">
            Daily and weekly summaries for your Admin recipients.
          </p>
        </div>
        <Button
          onClick={() => setEditing(true)}
          disabled={editing !== null || !q.data}
        >
          Add recipient
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Report schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p>
            Sender <strong>{senderPhone}</strong>
          </p>
          <p>
            Daily: 23:00, labelled “so far”. Weekly: Monday 08:00, covering the
            previous Monday–Sunday business dates. Times use Europe/Nicosia.
          </p>
          <p className="rounded-lg bg-amber-soft p-3 text-sm text-amber-ink">
            Complete Meta setup and confirm a delivered test before enabling
            automatic reports. Your WhatsApp Business app must stay connected
            through coexistence.
          </p>
          {q.data ? (
            <Button
              variant="secondary"
              requiresOnline
              disabled={schedule.isPending}
              onClick={() => schedule.mutate(!q.data.settings.enabled)}
            >
              {schedule.isPending
                ? "Saving…"
                : q.data.settings.enabled
                  ? "Pause automatic reports"
                  : "Enable automatic reports"}
            </Button>
          ) : null}
          <p role="status" className="text-sm text-muted">
            {q.data?.settings.enabled
              ? "Automatic reports enabled"
              : "Automatic reports paused"}
          </p>
        </CardContent>
      </Card>
      {q.isPending ? (
        <p role="status">Loading WhatsApp settings…</p>
      ) : q.error ? (
        <div role="alert">
          <p className="break-words">{q.error.message}</p>
          <Button variant="secondary" onClick={() => void q.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
      {editing ? (
        <RecipientEditor
          key={editing === true ? "new" : editing.id}
          recipient={editing === true ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {q.data?.recipients.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle>{r.name}</CardTitle>
              <p className="break-all">{r.phone}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted">
                {r.is_active ? "Active" : "Inactive"} ·{" "}
                {r.daily ? "Daily" : "No daily reports"} ·{" "}
                {r.weekly ? "Weekly" : "No weekly reports"}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={editing !== null}
                  onClick={() => setEditing(r)}
                >
                  Edit recipient
                </Button>
                <Button
                  requiresOnline
                  variant="secondary"
                  disabled={!r.is_active || !r.consent_at || test.isPending}
                  onClick={() => test.mutate(r.id)}
                >
                  {test.isPending && test.variables === r.id
                    ? "Processing…"
                    : "Send test report"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {q.data && !q.data.recipients.length ? (
        <p>No recipients yet. Add a number to receive reports.</p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Delivery history</CardTitle>
          <p className="text-sm text-muted">
            Accepted by Meta is not yet delivered. Uncertain sends are not
            automatically repeated.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {q.data?.history.map((h) => (
            <article key={h.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap justify-between gap-2">
                <strong className="capitalize">
                  {h.kind} · {statusLabels[h.status]}
                </strong>
                <span className="break-all">{h.phone}</span>
              </div>
              <p className="text-sm text-muted">
                {h.period_from}
                {h.period_to !== h.period_from
                  ? " – " + h.period_to
                  : ""} ·{" "}
                {new Date(h.created_at).toLocaleString("en-GB", {
                  timeZone: "Europe/Nicosia",
                })}
              </p>
              {h.error_code ? (
                <p className="break-words text-sm text-brand-strong">
                  {h.error_code}
                </p>
              ) : null}
            </article>
          ))}
          {q.data && !q.data.history.length ? (
            <p className="text-muted">No reports have been queued.</p>
          ) : null}
          <Button
            variant="secondary"
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            Refresh history
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
