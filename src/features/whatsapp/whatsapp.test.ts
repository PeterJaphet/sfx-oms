import { describe, expect, it, vi } from "vitest";
import { recipientFormSchema } from "./whatsapp-model";
import { canVisit } from "@/features/auth/permissions";
import {
  dispatchReports,
  equalSecret,
  templatePayload,
  verifySignature,
  whatsappWebhook,
  type Dependencies,
} from "../../../supabase/functions/_shared/whatsapp";
const id = "00000000-0000-4000-8000-000000000001",
  claim = "00000000-0000-4000-8000-000000000002";
const recipient = {
  name: "Admin",
  phone: "+905338410938",
  is_active: true,
  daily: true,
  weekly: true,
  consent: true,
};
const job = {
  id,
  claim_token: claim,
  phone: recipient.phone,
  snapshot: {
    kind: "daily",
    from: "2026-10-14",
    to: "2026-10-14",
    generated_local: "2026-10-14 23:00",
    orders: 2,
    pnl: {
      net_revenue: 800.5,
      cost_of_goods: 120,
      gross_profit: 680.5,
      operational_expenses: 10,
      fixed_overheads: 5,
      net_profit: 665.5,
    },
    unpaid_now: 20,
  },
};
const environment: Record<string, string> = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-secret",
  SUPABASE_ANON_KEY: "test-anon",
  WHATSAPP_ACCESS_TOKEN: "test-meta-token",
  WHATSAPP_PHONE_NUMBER_ID: "123",
  WHATSAPP_GRAPH_VERSION: "v23.0",
  WHATSAPP_REPORT_TEMPLATE: "sfx_admin_summary",
  WHATSAPP_TEMPLATE_LANGUAGE: "en",
  REPORT_CRON_SECRET: "x".repeat(48),
  WHATSAPP_APP_SECRET: "test-app-secret",
  WHATSAPP_VERIFY_TOKEN: "test-verify",
};
function mock(meta: () => Promise<Response>, sender = "90 539 137 57 02") {
  let claimed = false;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.includes("?fields="))
      return Response.json({ display_phone_number: sender });
    if (url.endsWith("/messages")) return meta();
    if (url.endsWith("/auth/v1/user")) return Response.json({ id });
    if (url.endsWith("/get_session_profile"))
      return Response.json([{ role: "admin" }]);
    if (url.endsWith("/get_whatsapp_settings"))
      return Response.json({ history: [{ id, kind: "test" }] });
    if (url.endsWith("/claim_whatsapp_report")) {
      if (claimed) return Response.json(null);
      claimed = true;
      return Response.json(job);
    }
    if (url.endsWith("/prepare_whatsapp_reports")) return Response.json(1);
    if (url.includes("/rest/v1/rpc/")) return Response.json(null);
    throw new Error("Unexpected URL " + url + " " + String(init?.method));
  });
  const dependencies: Dependencies = {
    env: (k) => environment[k],
    fetch: fetcher,
  };
  return { fetcher, dependencies };
}
const cron = () =>
  new Request("https://server/send", {
    method: "POST",
    headers: { "x-report-secret": environment.REPORT_CRON_SECRET },
    body: "{}",
  });
const test = () =>
  new Request("https://server/send", {
    method: "POST",
    headers: { Authorization: "Bearer verified-admin" },
    body: JSON.stringify({ test_id: id }),
  });
function calls(fetcher: ReturnType<typeof mock>["fetcher"], name: string) {
  return fetcher.mock.calls
    .filter((c) => String(c[0]).endsWith("/" + name))
    .map((c) => JSON.parse(String(c[1]?.body)));
}
async function signature(raw: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(environment.WHATSAPP_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
  );
  return (
    "sha256=" +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}
const webhookBody = () =>
  JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "123" },
              statuses: [
                {
                  id: "wamid.1",
                  status: "delivered",
                  recipient_id: "905338410938",
                  timestamp: "1792000000",
                  biz_opaque_callback_data: id,
                },
              ],
            },
          },
        ],
      },
    ],
  });
describe("WhatsApp recipient controls", () => {
  it("allows multiple distinct recipients and inactive records", () => {
    expect(recipientFormSchema.parse(recipient).phone).toBe(recipient.phone);
    expect(
      recipientFormSchema.parse({
        ...recipient,
        phone: "+905000000011",
        is_active: false,
        consent: false,
      }).is_active,
    ).toBe(false);
  });
  it.each([
    { phone: "+905391375702" },
    { phone: "905338410938" },
    { consent: false },
    { daily: false, weekly: false },
    { name: "" },
  ])("rejects invalid active recipient %j", (change) => {
    expect(
      recipientFormSchema.safeParse({ ...recipient, ...change }).success,
    ).toBe(false);
  });
  it("protects the screen by role", () => {
    expect(canVisit("admin", "/whatsapp")).toBe(true);
    expect(canVisit("operations", "/whatsapp")).toBe(false);
    expect(canVisit("logistics", "/whatsapp")).toBe(false);
  });
});
describe("server report transport", () => {
  it("formats server totals with necessary cents and preserves negatives", () => {
    const p = templatePayload(job, "sfx_admin_summary", "en");
    const values = p.template.components[0].parameters.map((x) => x.text);
    expect(values).toEqual([
      "Daily so far (23:00 schedule) - business date 2026-10-14",
      "2026-10-14 23:00",
      "2",
      "₺800.50",
      "₺120",
      "₺680.50",
      "₺10",
      "₺5",
      "₺665.50",
      "₺20",
    ]);
    expect(
      templatePayload(
        {
          ...job,
          snapshot: {
            ...job.snapshot,
            pnl: { ...job.snapshot.pnl, net_profit: -20.5 },
          },
        },
        "name",
        "en",
      ).template.components[0].parameters[8].text,
    ).toBe("₺-20.50");
    expect(p.to).toBe("905338410938");
    expect(p.biz_opaque_callback_data).toBe(id);
  });
  it("labels weekly and test reports distinctly", () => {
    for (const kind of ["weekly", "test"])
      expect(
        templatePayload(
          { ...job, snapshot: { ...job.snapshot, kind } },
          "name",
          "en",
        ).template.components[0].parameters[0].text,
      ).toMatch(kind === "weekly" ? /Weekly business dates/ : /Test report/);
  });
  it("rejects unauthenticated send without database or Meta requests", async () => {
    const m = mock(async () => Response.json({}));
    const r = await dispatchReports(
      new Request("https://server", { method: "POST", body: "{}" }),
      m.dependencies,
    );
    expect(r.status).toBe(401);
    expect(m.fetcher).not.toHaveBeenCalled();
  });
  it("rejects wrong cron secret", async () => {
    const m = mock(async () => Response.json({}));
    const r = await dispatchReports(
      new Request("https://server", {
        method: "POST",
        headers: { "x-report-secret": "wrong" },
        body: "{}",
      }),
      m.dependencies,
    );
    expect(r.status).toBe(401);
    expect(m.fetcher).not.toHaveBeenCalled();
  });
  it("cron cannot supply dates or recipients", async () => {
    const m = mock(async () => Response.json({}));
    const r = await dispatchReports(
      new Request("https://server", {
        method: "POST",
        headers: { "x-report-secret": environment.REPORT_CRON_SECRET },
        body: '{"phone":"other"}',
      }),
      m.dependencies,
    );
    expect(r.status).toBe(400);
    expect(m.fetcher).not.toHaveBeenCalled();
  });
  it("does not claim if Meta sender differs", async () => {
    const m = mock(async () => Response.json({}), "+905000000000");
    expect((await dispatchReports(cron(), m.dependencies)).status).toBe(503);
    expect(calls(m.fetcher, "claim_whatsapp_report")).toHaveLength(0);
  });
  it("fails before claiming if configuration missing", async () => {
    const m = mock(async () => Response.json({}));
    m.dependencies.env = (k) =>
      k === "WHATSAPP_ACCESS_TOKEN" ? undefined : environment[k];
    expect((await dispatchReports(cron(), m.dependencies)).status).toBe(503);
    expect(m.fetcher).not.toHaveBeenCalled();
  });
  it("records API acceptance once and does not call it delivered", async () => {
    const m = mock(async () =>
      Response.json({ messages: [{ id: "wamid.1" }] }),
    );
    const result = await dispatchReports(cron(), m.dependencies);
    expect(result.status).toBe(200);
    expect(calls(m.fetcher, "messages")).toHaveLength(1);
    expect(calls(m.fetcher, "finish_whatsapp_report")).toEqual([
      {
        p_report: id,
        p_claim: claim,
        p_status: "accepted",
        p_message: "wamid.1",
        p_error: null,
      },
    ]);
  });
  it("records a definite Meta rejection without exposing credentials or provider payload", async () => {
    const m = mock(async () =>
      Response.json(
        { error: { code: 131030, message: "sensitive provider text" } },
        { status: 400 },
      ),
    );
    await dispatchReports(cron(), m.dependencies);
    expect(calls(m.fetcher, "finish_whatsapp_report")[0]).toMatchObject({
      p_status: "failed",
      p_error: "META_131030",
    });
  });
  it.each(["timeout", "invalid_json", "server_error", "missing_message"])(
    "marks %s uncertain and never automatically resends",
    async (mode) => {
      const m = mock(async () => {
        if (mode === "timeout") throw new Error("timeout");
        if (mode === "invalid_json") return new Response("invalid");
        if (mode === "server_error")
          return Response.json({ error: {} }, { status: 500 });
        return Response.json({ messages: [] });
      });
      await dispatchReports(cron(), m.dependencies);
      expect(calls(m.fetcher, "messages")).toHaveLength(1);
      expect(calls(m.fetcher, "finish_whatsapp_report")[0].p_status).toBe(
        "unknown",
      );
    },
  );
  it("Admin can dispatch only a test after server role verification", async () => {
    const m = mock(async () =>
      Response.json({ messages: [{ id: "wamid.1" }] }),
    );
    expect((await dispatchReports(test(), m.dependencies)).status).toBe(200);
    expect(calls(m.fetcher, "prepare_whatsapp_reports")).toHaveLength(0);
    expect(calls(m.fetcher, "claim_whatsapp_report")).toEqual([{ p_test: id }]);
  });
  it("Ops cannot dispatch an Admin test", async () => {
    const m = mock(async () => Response.json({}));
    const base = m.dependencies.fetch;
    m.dependencies.fetch = async (i, init) =>
      String(i).endsWith("/get_session_profile")
        ? Response.json([{ role: "operations" }])
        : base(i, init);
    expect((await dispatchReports(test(), m.dependencies)).status).toBe(403);
    expect(calls(m.fetcher, "messages")).toHaveLength(0);
  });
});
describe("signed Meta webhook", () => {
  it("validates secret equality", async () => {
    expect(await equalSecret("a", "a")).toBe(true);
    expect(await equalSecret("a", "b")).toBe(false);
  });
  it("returns only the verified challenge", async () => {
    const m = mock(async () => Response.json({}));
    const r = await whatsappWebhook(
      new Request(
        "https://server?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=123",
      ),
      m.dependencies,
    );
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("123");
    expect(
      (
        await whatsappWebhook(
          new Request(
            "https://server?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123",
          ),
          m.dependencies,
        )
      ).status,
    ).toBe(403);
  });
  it("rejects unsigned or altered requests without database writes", async () => {
    const m = mock(async () => Response.json({}));
    const raw = webhookBody();
    const sig = await signature(raw);
    expect(
      await verifySignature(
        new TextEncoder().encode(raw),
        sig,
        environment.WHATSAPP_APP_SECRET,
      ),
    ).toBe(true);
    expect(
      await verifySignature(
        new TextEncoder().encode(raw + " "),
        sig,
        environment.WHATSAPP_APP_SECRET,
      ),
    ).toBe(false);
    expect(
      (
        await whatsappWebhook(
          new Request("https://server", { method: "POST", body: raw }),
          m.dependencies,
        )
      ).status,
    ).toBe(401);
    expect(m.fetcher).not.toHaveBeenCalled();
  });
  it("records verified status against message, callback and recipient IDs", async () => {
    const m = mock(async () => Response.json({}));
    const raw = webhookBody();
    const r = await whatsappWebhook(
      new Request("https://server", {
        method: "POST",
        headers: { "x-hub-signature-256": await signature(raw) },
        body: raw,
      }),
      m.dependencies,
    );
    expect(r.status).toBe(200);
    expect(calls(m.fetcher, "record_whatsapp_status")[0]).toMatchObject({
      p_report: id,
      p_message: "wamid.1",
      p_phone: "905338410938",
      p_status: "delivered",
    });
  });
  it("ignores signed statuses for another sender", async () => {
    const m = mock(async () => Response.json({}));
    const raw = webhookBody().replace(
      '"phone_number_id":"123"',
      '"phone_number_id":"456"',
    );
    await whatsappWebhook(
      new Request("https://server", {
        method: "POST",
        headers: { "x-hub-signature-256": await signature(raw) },
        body: raw,
      }),
      m.dependencies,
    );
    expect(calls(m.fetcher, "record_whatsapp_status")).toHaveLength(0);
  });
});
