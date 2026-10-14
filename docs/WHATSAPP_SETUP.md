# M15 — WhatsApp reports setup

Sender: **+905391375702**. Initial Admin recipient: **+905338410938**; Admin can add up to 20 active numbers in `/whatsapp`. No keys go in chat or Git.

## Keep the WhatsApp Business app working

The user requires the current Business app to remain usable. Use Meta's **WhatsApp Business app coexistence** onboarding (connect the existing Business app), not a flow that removes the number from the app. Account/country eligibility and access to this flow must be confirmed in Meta's onboarding UI. If direct setup offers only a migration/disconnection, stop and report the exact screen; do not deregister/delete the phone account. A provider-assisted coexistence route would need the user's choice before selecting a paid service. This app accepts the resulting Cloud API phone-number ID and token; it does not implement a public Embedded Signup product.

Start at https://developers.facebook.com/apps/ with SFx Burger's Meta Business Portfolio. Add WhatsApp Business Platform and first use Meta's test sender/verified recipient if production coexistence is not ready. The application intentionally verifies the configured sender equals the approved number before real dispatch; a different Meta test sender cannot send app reports without a separately approved code/configuration change. A successful Meta hello-world test alone is not an M15 delivery test.

Official coexistence entry point: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
Meta returned HTTP 429 to automated documentation reads during this build; eligibility was not inferred from third-party guides.

## Database and functions

1. Run the complete `supabase/migrations/013_whatsapp_reports.sql` once after 012 in project `lnolchqycicixjikolfi`. It adds only recipient/schedule configuration, immutable report snapshots and delivery history; existing money/order/report functions are unchanged.
2. Deploy from Mac Terminal:

```sh
cd /Users/pj/Documents/sfx-oms
npx supabase functions deploy send-whatsapp-reports --project-ref lnolchqycicixjikolfi --use-api
npx supabase functions deploy whatsapp-status --project-ref lnolchqycicixjikolfi --use-api
```

The new `supabase/config.toml` disables gateway JWT checks only for these endpoints: sender verifies a long cron secret or an active Admin session; status webhook verifies Meta's challenge token and POST HMAC. Existing staff functions retain default JWT verification. Do not use `--no-verify-jwt` on existing staff endpoints.

## Server secrets

In Supabase Dashboard → Edge Functions → Secrets, add:

| Name | Value |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Long-lived system-user token with WhatsApp messaging permission for this sender |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta's numeric **ID**, not the +90 phone number |
| `WHATSAPP_GRAPH_VERSION` | A currently supported version shown in Meta API setup, e.g. `vNN.0` with actual digits |
| `WHATSAPP_REPORT_TEMPLATE` | Approved template name, suggested `sfx_admin_summary` |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Exact approved language code, e.g. `en` or `en_US` |
| `WHATSAPP_APP_SECRET` | App secret for webhook signature verification |
| `WHATSAPP_VERIFY_TOKEN` | Your randomly generated webhook verification token |
| `REPORT_CRON_SECRET` | Cryptographically random value of at least 32 characters |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are supplied by the hosted function runtime. The service-role key is used only in the Edge Functions.

Generate two different random tokens locally with `openssl rand -hex 32` (one each for verify/cron). Do not paste them into chat. Keep an offline copy securely; no secret values are supplied in repository SQL or docs.

## Approve the message template

Create `sfx_admin_summary` in WhatsApp Manager with **positional** body parameters and the selected language. Submit as an internal operational report; Meta decides its allowed category and approval. No code assumes a pricing category or cost. Configure a payment method if Meta requires it. The template must be approved/enabled before dispatch.

Use this exact body (10 variables, no header/buttons):

```text
SFx Burger OMS report
{{1}}
Generated {{2}} (Europe/Nicosia)
Orders: {{3}}
Revenue: {{4}}
Cost of goods: {{5}}
Gross profit: {{6}}
Operational costs: {{7}}
Fixed overheads: {{8}}
Net profit: {{9}}
Customer balances due now: {{10}}
Costs are recorded purchases and expenses, including credit purchases. This is actual recorded P&L, not recipe profit. The 06:00–05:59 business day may still be open.
```

Sample parameters: `Daily so far (23:00 schedule) - business date 2026-10-14`, `2026-10-14 23:00`, `12`, `₺8,000`, `₺2,000`, `₺6,000`, `₺500`, `₺300`, `₺5,200`, `₺400`.

The same template handles daily, weekly and explicitly labelled test reports. Proactive reports use templates rather than relying on a 24-hour chat window. Currency presentation uses two decimals only for fractional amounts. Template API reference: https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api

## Webhook and delivered test

In Meta's app WhatsApp webhook configuration:

- Callback URL: `https://lnolchqycicixjikolfi.supabase.co/functions/v1/whatsapp-status`
- Verify token: the local `WHATSAPP_VERIFY_TOKEN` value.
- Subscribe to `messages` for the sender's WhatsApp Business Account. Ensure the app is subscribed to that account, as directed by Meta setup.

Only matching sender-ID status notifications are processed. Customer message content is ignored and not stored. Invalid signatures never reach database writes.

Open the M15 preview as Admin → WhatsApp reports → Add recipient. The first form is prefilled with the supplied Admin number. Confirm the recipient agreed, choose daily/weekly and save. Send test report. Confirm it arrives on the actual recipient phone and delivery history reaches **Delivered** or **Read**. **Accepted by Meta** alone is not proof of delivery. Check that the sender's Business app still sends/receives its ordinary messages.

## Enable the schedule last

Enable `pg_cron` and `pg_net` in the hosted project's Database Extensions, and enable Supabase Vault if not present. In Vault create:

- `sfx_report_project_url`: `https://lnolchqycicixjikolfi.supabase.co`
- `sfx_report_cron_secret`: exactly the same value as the Edge Function `REPORT_CRON_SECRET`.

Use the Dashboard Vault UI, or `vault.create_secret` locally in SQL Editor with your own values; never commit those SQL statements. Then run `supabase/whatsapp_schedule.sql` in the hosted SQL Editor. It installs one named job every minute; rerunning the same name replaces it rather than adding a duplicate. Finally enable automatic reports in the Admin screen.

Database time in **Europe/Nicosia** selects daily 23:00 and Monday 08:00, correctly following DST. Daily reports cover the current 06:00 business date, labelled so far; weekly reports cover the previous Monday–Sunday business dates. Snapshots are taken when the job runs and include a generation time. Each schedule has a 15-minute catch-up window. A missed window is not retrospectively relabelled as an on-time report; check Cron/job history after downtime. Free projects may pause; the earlier go-live plan requires Pro/backups for continuous trading.

Recipient daily/weekly switches and Active control affect unclaimed jobs. Pausing prevents automatic jobs being claimed; an already sending message may finish. Explicit test reports can be sent while automatic reports are paused. Queued jobs expire after 30 minutes. Every report is claimed once. Crashes/timeouts become **Delivery uncertain** and are never automatically repeated; a signed webhook can resolve that state. Definite Meta rejections become Failed with a provider code. Correct setup and send an explicit new test, rather than assuming an uncertain message failed. Repeated attempts to send the same interrupted test retain its request ID in that browser tab.

Cron requests are authenticated by a server-only secret from Vault. No private reports, access tokens or recipient configuration are service-worker cached. Delivery history preserves 100 recent reports in the app; underlying snapshots/events are retained without a delete path.

References: https://supabase.com/docs/guides/functions/schedule-functions and https://supabase.com/docs/guides/functions/function-configuration
