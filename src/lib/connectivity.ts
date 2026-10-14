export const offlineMessage =
  "You are offline. Reconnect before saving or uploading.";
export class OfflineError extends Error {
  constructor() {
    super(offlineMessage);
    this.name = "OfflineError";
  }
}
let unreachable = false;
let requests = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
export function isOnline() {
  return (
    (typeof navigator === "undefined" || navigator.onLine !== false) &&
    !unreachable
  );
}
export function assertOnline() {
  if (!isOnline()) throw new OfflineError();
}
export function getActiveWrites() {
  return requests;
}
function browserChanged() {
  if (navigator.onLine) unreachable = false;
  emit();
}
export function subscribeConnection(listener: () => void) {
  if (!listeners.size && typeof window !== "undefined") {
    window.addEventListener("online", browserChanged);
    window.addEventListener("offline", browserChanged);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && typeof window !== "undefined") {
      window.removeEventListener("online", browserChanged);
      window.removeEventListener("offline", browserChanged);
    }
  };
}
function reachable(value: boolean) {
  const next = !value;
  if (unreachable !== next) {
    unreachable = next;
    emit();
  }
}
const readRPCs = new Set([
  "business_date",
  "get_session_profile",
  "quote_order",
  "list_delivery_orders",
  "financial_day_state",
  "get_close_context",
  "quote_close",
  "list_day_closes",
  "quote_withdrawal",
  "get_setup_accounts",
  "list_debts",
  "debt_summary",
  "list_unpaid_customers",
  "quote_opening",
  "quote_record_debt",
  "quote_debt_settlement",
  "list_logistics_advances",
  "list_logistics_purchases",
  "quote_purchase",
  "quote_return_change",
  "get_whatsapp_settings",
  "report_periods",
  "get_report",
  "get_dashboard",
  "report_pnl",
  "report_items_sold",
]);
export function isWriteRequest(input: RequestInfo | URL, init?: RequestInit) {
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname.includes("/rest/v1/rpc/"))
    return !readRPCs.has(url.pathname.split("/").at(-1)!);
  return true;
}
// Supabase requests only. Never queue or replay a request at the transport layer.
export function createGuardedFetch(
  transport: typeof fetch = globalThis.fetch,
): typeof fetch {
  return async (input, init) => {
    if (!isOnline())
      return new Response(
        JSON.stringify({
          code: "SFX_OFFLINE",
          message: offlineMessage,
          error: offlineMessage,
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    const write = isWriteRequest(input, init);
    if (write) {
      requests++;
      emit();
    }
    try {
      const response = await transport(input, init);
      reachable(true);
      return response;
    } catch (error) {
      // Abort is not proof of a lost internet connection. A sent write may have committed;
      // its existing request-ID recovery remains responsible for confirmation.
      if (!(error instanceof Error && error.name === "AbortError"))
        reachable(false);
      throw error;
    } finally {
      if (write) {
        requests--;
        emit();
      }
    }
  };
}
export async function checkConnection(url?: string, anonKey?: string) {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return false;
  if (!url || !anonKey) return isOnline();
  try {
    const response = await globalThis.fetch(
      `${url.replace(/\/$/, "")}/auth/v1/health`,
      {
        method: "GET",
        headers: { apikey: anonKey },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return false;
    reachable(true);
    return true;
  } catch {
    return false;
  }
}
