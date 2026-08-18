create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  site text not null,
  status text not null default 'queued'
    check (status in ('queued', 'ready', 'failed')),
  title text,
  price numeric(12, 2)
    check (price is null or price >= 0),
  currency text
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  external_product_id text,
  seller_name text,
  extraction_error text,
  added_at timestamptz not null default now(),
  last_extracted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_site_external_product_id_idx
  on public.products (site, external_product_id);

alter table public.products enable row level security;

revoke all on table public.products from anon, authenticated;
grant select, insert, update, delete on table public.products to service_role;
