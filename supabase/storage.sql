-- =====================================================================
-- Receipt photos (Supabase Storage). Run in the Supabase SQL editor.
-- Path convention: receipts/<uploader user id>/<yyyy-mm-dd>/<uuid>.jpg
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Any active staff member can upload into their own folder.
create policy receipts_upload on storage.objects for insert to authenticated
with check (
  bucket_id = 'receipts'
  and public.app_role() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Operations and Admin see all receipts; Logistics sees their own.
create policy receipts_read on storage.objects for select to authenticated
using (
  bucket_id = 'receipts'
  and (public.app_role() in ('operations', 'admin') or (storage.foldername(name))[1] = auth.uid()::text)
);

-- No update or delete policies: receipts are permanent.
