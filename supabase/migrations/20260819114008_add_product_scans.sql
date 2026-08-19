create table if not exists public.product_scans (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null
    references public.products(id)
    on delete cascade,
  scraper_configuration_id uuid
    references public.scraper_configurations(id)
    on delete set null,
  extraction_method text not null
    check (extraction_method in ('deterministic', 'llm')),
  trigger text not null
    check (trigger in ('add', 'retry', 'scheduled', 'manual')),
  actor text not null
    check (actor in ('user', 'scheduler', 'system')),
  status text not null
    check (status in ('ready', 'failed')),
  title text,
  price numeric
    check (price is null or price >= 0),
  currency text
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  external_product_id text,
  seller_name text,
  model text,
  duration_ms integer not null
    check (duration_ms >= 0),
  extraction_error text,
  scanned_at timestamptz not null default now()
);

create index if not exists product_scans_product_scanned_at_idx
  on public.product_scans (product_id, scanned_at desc);

create index if not exists product_scans_method_scanned_at_idx
  on public.product_scans (extraction_method, scanned_at desc);

alter table public.product_scans enable row level security;

revoke all on table public.product_scans from public, anon, authenticated;
grant select, insert, update, delete on table public.product_scans to service_role;
