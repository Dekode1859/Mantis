create table if not exists public.scraper_configurations (
  id uuid primary key default gen_random_uuid(),
  site text not null,
  version integer not null check (version > 0),
  configuration_hash text not null
    check (configuration_hash ~ '^[0-9a-f]{64}$'),
  selectors jsonb not null
    check (jsonb_typeof(selectors) = 'object'),
  model text not null,
  source text not null default 'llm'
    check (source in ('llm', 'manual')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (site, version),
  unique (site, configuration_hash)
);

alter table public.products
  add column if not exists scraper_configuration_id uuid
  references public.scraper_configurations(id)
  on delete set null;

create index if not exists scraper_configurations_site_idx
  on public.scraper_configurations (site);

create index if not exists products_scraper_configuration_id_idx
  on public.products (scraper_configuration_id);

alter table public.scraper_configurations enable row level security;

revoke all on table public.scraper_configurations from public, anon, authenticated;
grant select, insert, update, delete on table public.scraper_configurations to service_role;
