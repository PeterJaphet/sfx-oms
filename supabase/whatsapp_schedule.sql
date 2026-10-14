-- Manual hosted setup ONLY, after migration, Edge Functions, sender/template and a delivered test.
-- Vault must contain sfx_report_project_url and sfx_report_cron_secret (same as Edge REPORT_CRON_SECRET).
-- No secret value belongs in this file. Run only on the hosted Supabase project.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('sfx-whatsapp-reports','* * * * *', $job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='sfx_report_project_url') || '/functions/v1/send-whatsapp-reports',
  headers := jsonb_build_object('Content-Type','application/json','x-report-secret',(select decrypted_secret from vault.decrypted_secrets where name='sfx_report_cron_secret')),
  body := '{}'::jsonb, timeout_milliseconds := 10000
 );
$job$);
-- Stop dispatch: select cron.unschedule('sfx-whatsapp-reports');
-- Database uses Europe/Nicosia local time, including DST, to choose daily/weekly periods.
