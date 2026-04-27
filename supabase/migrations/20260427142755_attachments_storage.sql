-- Attachments storage bucket: photos / drawings linked to captures.
-- Bucket is private; objects keyed by user_id prefix so RLS can enforce
-- ownership without re-querying public.captures.
--
-- Path convention: <user_id>/<capture_id>/<random>.<ext>
-- storage.foldername(name) returns the path segments; index [1] is user_id.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  15 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

create policy "owner select attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owner insert attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owner delete attachments"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Down (manual rollback notes):
--   drop policy "owner select attachments" on storage.objects;
--   drop policy "owner insert attachments" on storage.objects;
--   drop policy "owner delete attachments" on storage.objects;
--   delete from storage.buckets where id = 'attachments';
