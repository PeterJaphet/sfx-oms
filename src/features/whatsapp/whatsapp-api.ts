import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { client } from "@/features/menu/menu-api";
import { assertOnline } from "@/lib/connectivity";
import {
  contextSchema,
  type Recipient,
  type RecipientForm,
} from "./whatsapp-model";
export function useWhatsApp() {
  return useQuery({
    queryKey: ["whatsapp"],
    queryFn: async () => {
      const r = await client().rpc("get_whatsapp_settings");
      if (r.error) throw new Error(r.error.message);
      return contextSchema.parse(r.data);
    },
    refetchInterval: 15000,
  });
}
export function useWhatsAppAction<T>(
  action: (v: T) => Promise<unknown>,
  onSuccess?: () => void,
) {
  const q = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      assertOnline();
      return action(v);
    },
    onSuccess: async () => {
      await q.invalidateQueries({ queryKey: ["whatsapp"] });
      onSuccess?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
export async function saveRecipient(v: RecipientForm, existing?: Recipient) {
  const r = await client().rpc("save_whatsapp_recipient", {
    p: {
      ...v,
      ...(existing ? { id: existing.id, revision: existing.revision } : {}),
    },
  });
  if (r.error) throw new Error(r.error.message);
  toast.success("Recipient saved");
}
export async function setEnabled(enabled: boolean, revision: number) {
  const r = await client().rpc("set_whatsapp_enabled", {
    p_enabled: enabled,
    p_revision: revision,
  });
  if (r.error) throw new Error(r.error.message);
  toast.success(
    enabled ? "Automatic reports enabled" : "Automatic reports paused",
  );
}
// Keep the request ID on interruption so explicit retries cannot queue a second test.
export async function sendTest(recipient: string) {
  const key = "sfx.whatsapp.test." + recipient;
  const request = sessionStorage.getItem(key) ?? crypto.randomUUID();
  sessionStorage.setItem(key, request);
  const q = await client().rpc("queue_whatsapp_test", {
    p_recipient: recipient,
    p_request: request,
  });
  if (q.error) throw new Error(q.error.message);
  const r = await client().functions.invoke("send-whatsapp-reports", {
    body: { test_id: q.data },
  });
  if (r.error) {
    let message = r.error.message;
    if ("context" in r.error && r.error.context instanceof Response) {
      const body = await r.error.context.json().catch(() => null);
      if (body?.error) message = body.error;
    }
    throw new Error(message);
  }
  sessionStorage.removeItem(key);
  toast.success("Test processed; check delivery history");
}
