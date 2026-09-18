alter table public.seller_profiles add column terms_version text;

alter table public.seller_profiles add constraint active_seller_complete check (
  status <> 'ACTIVE' or (
    attitude_score >= 3 and knowledge_score >= 3 and
    identity_document_path is not null and bank_account is not null and
    cci is not null and terms_accepted_at is not null and terms_version is not null
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('seller-identity', 'seller-identity', false, 5000000, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
