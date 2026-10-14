// Server-only WhatsApp transport. Tests inject HTTP and environment dependencies.
export type Dependencies = {
  env: (key: string) => string | undefined;
  fetch: typeof fetch;
};
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export function reply(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { ...cors, "Cache-Control": "no-store" },
  });
}
function required(d: Dependencies, name: string) {
  const v = d.env(name);
  if (!v)
    throw new HttpError(
      "WhatsApp setup is incomplete; check server secrets",
      503,
    );
  return v;
}
export async function equalSecret(a: string, b: string) {
  const digest = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    );
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
export async function rpc(
  d: Dependencies,
  name: string,
  body: unknown,
  token?: string,
): Promise<unknown> {
  const key = required(d, "SUPABASE_SERVICE_ROLE_KEY");
  const response = await d.fetch(
    `${required(d, "SUPABASE_URL")}/rest/v1/rpc/${name}`,
    {
      method: "POST",
      headers: {
        apikey: token ? required(d, "SUPABASE_ANON_KEY") : key,
        Authorization: `Bearer ${token ?? key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw new HttpError(
      typeof result?.message === "string"
        ? result.message
        : "Report database request failed",
      response.status,
    );
  return result;
}
export function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new HttpError("Invalid report data", 400);
  return v as Record<string, unknown>;
}
function text(v: unknown) {
  if (typeof v !== "string") throw new HttpError("Invalid report data", 400);
  return v;
}
export function money(v: unknown) {
  if (v === null || v === undefined) return "₺0";
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError("Invalid report amount", 400);
  return (
    "₺" +
    new Intl.NumberFormat("en-GB", {
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(n)
  );
}
export function templatePayload(
  job: Record<string, unknown>,
  name: string,
  language: string,
) {
  const snapshot = object(job.snapshot),
    pnl = object(snapshot.pnl);
  const kind = text(snapshot.kind),
    from = text(snapshot.from),
    to = text(snapshot.to);
  const period =
    kind === "weekly"
      ? `Weekly business dates ${from} to ${to}`
      : `${kind === "test" ? "Test report" : "Daily so far (23:00 schedule)"} - business date ${from}`;
  const values = [
    period,
    text(snapshot.generated_local),
    String(snapshot.orders),
    money(pnl.net_revenue),
    money(pnl.cost_of_goods),
    money(pnl.gross_profit),
    money(pnl.operational_expenses),
    money(pnl.fixed_overheads),
    money(pnl.net_profit),
    money(snapshot.unpaid_now),
  ];
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: text(job.phone).replace(/^\+/, ""),
    type: "template",
    biz_opaque_callback_data: text(job.id),
    template: {
      name,
      language: { code: language },
      components: [
        {
          type: "body",
          parameters: values.map((v) => ({ type: "text", text: v })),
        },
      ],
    },
  };
}
async function requireAdmin(d: Dependencies, request: Request) {
  const token = request.headers
    .get("Authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new HttpError("Sign in first", 401);
  const response = await d.fetch(
    `${required(d, "SUPABASE_URL")}/auth/v1/user`,
    {
      headers: {
        apikey: required(d, "SUPABASE_ANON_KEY"),
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw new HttpError("Sign in first", 401);
  const profile = await rpc(d, "get_session_profile", {}, token);
  if (!Array.isArray(profile) || object(profile[0]).role !== "admin")
    throw new HttpError("Not allowed for your role", 403);
  return token;
}
async function configuration(d: Dependencies) {
  const token = required(d, "WHATSAPP_ACCESS_TOKEN"),
    phone = required(d, "WHATSAPP_PHONE_NUMBER_ID"),
    version = required(d, "WHATSAPP_GRAPH_VERSION");
  const name = required(d, "WHATSAPP_REPORT_TEMPLATE"),
    language = required(d, "WHATSAPP_TEMPLATE_LANGUAGE");
  if (
    !/^\d+$/.test(phone) ||
    !/^v\d+\.\d+$/.test(version) ||
    !/^[a-z0-9_]+$/.test(name) ||
    !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language)
  )
    throw new HttpError("Invalid WhatsApp server configuration", 503);
  // Verify the configured Meta sender before claiming any messages.
  const response = await d.fetch(
    `https://graph.facebook.com/${version}/${phone}?fields=display_phone_number`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok)
    throw new HttpError(
      "Meta sender verification failed; check server configuration",
      503,
    );
  const sender = object(await response.json()).display_phone_number;
  if (
    typeof sender !== "string" ||
    sender.replace(/\D/g, "") !== "905391375702"
  )
    throw new HttpError("Meta sender does not match +905391375702", 503);
  return { token, phone, version, name, language };
}
export async function dispatchReports(
  request: Request,
  d: Dependencies,
): Promise<Response> {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return reply({ error: "Use POST" }, 405);
  try {
    const scheduler = request.headers.get("x-report-secret");
    const body = object(
      await request.json().catch(() => {
        throw new HttpError("Invalid report request", 400);
      }),
    );
    let test: string | undefined;
    if (scheduler) {
      const secret = required(d, "REPORT_CRON_SECRET");
      if (secret.length < 32 || !(await equalSecret(scheduler, secret)))
        throw new HttpError("Not authorized", 401);
      if (Object.keys(body).length)
        throw new HttpError(
          "Scheduled requests cannot choose recipients or report dates",
          400,
        );
    } else {
      const token = await requireAdmin(d, request);
      test = text(body.test_id);
      if (
        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(test) ||
        Object.keys(body).some((k) => k !== "test_id")
      )
        throw new HttpError("Choose a valid test report", 400);
      // RLS reader verifies this is a real queued/history record visible to Admin.
      const context = object(await rpc(d, "get_whatsapp_settings", {}, token));
      if (
        !Array.isArray(context.history) ||
        !context.history.some(
          (h) => object(h).id === test && object(h).kind === "test",
        )
      )
        throw new HttpError("Test report not found", 404);
    }
    const config = await configuration(d);
    if (!test) await rpc(d, "prepare_whatsapp_reports", {});
    let attempted = 0;
    const outcomes: { id: string; status: string }[] = [];
    for (let i = 0; i < (test ? 1 : 40); i++) {
      const next = await rpc(d, "claim_whatsapp_report", {
        p_test: test ?? null,
      });
      if (next === null) break;
      const job = object(next);
      let state = "unknown",
        message: string | null = null,
        error: string | null = "META_RESPONSE_UNCERTAIN";
      try {
        const response = await d.fetch(
          `https://graph.facebook.com/${config.version}/${config.phone}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              templatePayload(job, config.name, config.language),
            ),
            signal: AbortSignal.timeout(10000),
          },
        );
        const result = object(await response.json());
        if (
          response.ok &&
          Array.isArray(result.messages) &&
          typeof object(result.messages[0]).id === "string"
        ) {
          state = "accepted";
          message = text(object(result.messages[0]).id);
          error = null;
        } else if (response.status >= 400 && response.status < 500) {
          state = "failed";
          const meta = object(result.error);
          error = `META_${String(meta.code ?? response.status)
            .replace(/[^0-9]/g, "")
            .slice(0, 20)}`;
        }
      } catch {
        /* A timeout/invalid response may follow a successful send. Do not retry. */
      }
      await rpc(d, "finish_whatsapp_report", {
        p_report: job.id,
        p_claim: job.claim_token,
        p_status: state,
        p_message: message,
        p_error: error,
      });
      attempted++;
      outcomes.push({ id: text(job.id), status: state });
    }
    return reply({ attempted, outcomes });
  } catch (error) {
    return reply(
      {
        error:
          error instanceof HttpError
            ? error.message
            : "Report request interrupted; check delivery history before retrying",
      },
      error instanceof HttpError ? error.status : 503,
    );
  }
}
export async function verifySignature(
  raw: Uint8Array,
  signature: string,
  secret: string,
) {
  if (!/^sha256=[0-9a-f]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, raw as BufferSource),
  );
  const expected =
    "sha256=" +
    Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
  return equalSecret(expected, signature.toLowerCase());
}
export async function whatsappWebhook(
  request: Request,
  d: Dependencies,
): Promise<Response> {
  try {
    if (request.method === "GET") {
      const u = new URL(request.url),
        token = required(d, "WHATSAPP_VERIFY_TOKEN");
      if (
        u.searchParams.get("hub.mode") !== "subscribe" ||
        !(await equalSecret(
          u.searchParams.get("hub.verify_token") ?? "",
          token,
        ))
      )
        throw new HttpError("Not authorized", 403);
      const challenge = u.searchParams.get("hub.challenge");
      if (!challenge || !/^\d{1,100}$/.test(challenge))
        throw new HttpError("Invalid challenge", 400);
      return new Response(challenge, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (request.method !== "POST")
      return reply({ error: "Use GET or POST" }, 405);
    if (Number(request.headers.get("content-length") ?? 0) > 1048576)
      throw new HttpError("Webhook too large", 413);
    const raw = new Uint8Array(await request.arrayBuffer());
    if (raw.length > 1048576) throw new HttpError("Webhook too large", 413);
    if (
      !(await verifySignature(
        raw,
        request.headers.get("x-hub-signature-256") ?? "",
        required(d, "WHATSAPP_APP_SECRET"),
      ))
    )
      throw new HttpError("Not authorized", 401);
    const body = object(JSON.parse(new TextDecoder().decode(raw)));
    if (
      body.object !== "whatsapp_business_account" ||
      !Array.isArray(body.entry)
    )
      throw new HttpError("Invalid WhatsApp webhook", 400);
    for (const entry of body.entry) {
      const changes = object(entry).changes;
      if (!Array.isArray(changes)) continue;
      for (const change of changes) {
        const c = object(change);
        if (c.field !== "messages") continue;
        const value = object(c.value),
          meta = object(value.metadata);
        if (
          meta.phone_number_id !== required(d, "WHATSAPP_PHONE_NUMBER_ID") ||
          !Array.isArray(value.statuses)
        )
          continue;
        for (const item of value.statuses) {
          const s = object(item);
          if (
            !["sent", "delivered", "read", "failed"].includes(String(s.status))
          )
            continue;
          const timestamp = Number(s.timestamp);
          if (
            !Number.isFinite(timestamp) ||
            timestamp < 0 ||
            timestamp > 4102444800
          )
            throw new HttpError("Invalid status timestamp", 400);
          const callback =
            typeof s.biz_opaque_callback_data === "string" &&
            /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
              s.biz_opaque_callback_data,
            )
              ? s.biz_opaque_callback_data
              : null;
          const code =
            Array.isArray(s.errors) && s.errors.length
              ? "META_" +
                String(object(s.errors[0]).code)
                  .replace(/[^0-9]/g, "")
                  .slice(0, 20)
              : null;
          await rpc(d, "record_whatsapp_status", {
            p_report: callback,
            p_message: text(s.id),
            p_phone: text(s.recipient_id),
            p_status: s.status,
            p_at: new Date(timestamp * 1000).toISOString(),
            p_error: code,
          });
        }
      }
    }
    return reply({ ok: true });
  } catch (error) {
    return reply(
      {
        error:
          error instanceof HttpError
            ? error.message
            : "Webhook processing failed",
      },
      error instanceof HttpError ? error.status : 500,
    );
  }
}
