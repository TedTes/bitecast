create schema if not exists bitecast;
grant usage on schema bitecast to anon, authenticated, service_role;

create table if not exists bitecast.lakes (
  id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null,
  region text not null, province_state text not null, country text not null default 'CA',
  lat double precision not null, lon double precision not null,
  clarity_class text check (clarity_class in ('clear','stained','murky')),
  species text[] not null default array['walleye'], is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists bitecast.lake_regulations (
  id uuid primary key default gen_random_uuid(), lake_id uuid not null references bitecast.lakes on delete cascade,
  species text not null default 'walleye', season_open text not null, season_close text not null,
  limits_text text not null, source_url text not null, last_verified_at date not null,
  unique (lake_id, species)
);
create table if not exists bitecast.species_profiles (
  id text not null, version text not null, config jsonb not null, is_current boolean not null default false,
  created_at timestamptz not null default now(), primary key (id, version)
);
create table if not exists bitecast.weather_hourly (
  lake_id uuid not null references bitecast.lakes on delete cascade, ts timestamptz not null,
  cloud_pct numeric, wind_kmh numeric, gust_kmh numeric, precip_mm numeric, pressure_hpa numeric,
  air_temp_c numeric, source text not null, fetched_at timestamptz not null, primary key (lake_id, ts)
);
create table if not exists bitecast.forecast_hourly (
  lake_id uuid not null references bitecast.lakes on delete cascade, species text not null default 'walleye', ts timestamptz not null,
  score smallint not null check (score between 0 and 100), light numeric not null, components jsonb not null,
  reasons jsonb not null, confidence text not null check (confidence in ('High','Medium','Low')),
  engine_version text not null, computed_at timestamptz not null, primary key (lake_id, species, ts)
);
create table if not exists bitecast.forecast_windows (
  id uuid primary key default gen_random_uuid(), lake_id uuid not null references bitecast.lakes on delete cascade,
  species text not null default 'walleye', start_ts timestamptz not null, end_ts timestamptz not null,
  peak_score smallint not null check (peak_score between 0 and 100), reasons jsonb not null,
  confidence text not null check (confidence in ('High','Medium','Low')), tactics_text text not null,
  engine_version text not null, computed_at timestamptz not null
);
create table if not exists bitecast.profiles (
  user_id uuid primary key references auth.users on delete cascade, units text not null default 'metric',
  season_mode text not null default 'open_water', region text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists bitecast.follows (
  user_id uuid not null references auth.users on delete cascade, lake_id uuid not null references bitecast.lakes on delete cascade,
  alert_enabled boolean not null default true, threshold smallint not null default 70, lead_minutes integer not null default 120,
  quiet_start time not null default '22:00', quiet_end time not null default '06:00', primary key (user_id, lake_id)
);
create table if not exists bitecast.catch_logs (
  id uuid primary key, user_id uuid not null references auth.users on delete cascade default auth.uid(),
  lake_id uuid not null references bitecast.lakes, caught_at timestamptz not null, caught boolean not null,
  count integer not null default 0, length_cm numeric, depth_m numeric, bait text, method text, clarity text, notes text,
  conditions jsonb not null default '{}'::jsonb, score_at_time smallint, engine_version text,
  client_updated_at timestamptz not null, deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists catch_logs_user_updated_idx on bitecast.catch_logs (user_id, client_updated_at);
create index if not exists catch_logs_lake_caught_idx on bitecast.catch_logs (lake_id, caught_at);
create table if not exists bitecast.push_tokens (
  user_id uuid not null references auth.users on delete cascade, token text not null, platform text not null,
  updated_at timestamptz not null default now(), primary key (user_id, token)
);
create table if not exists bitecast.alerts_sent (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  lake_id uuid not null references bitecast.lakes on delete cascade, window_id uuid not null references bitecast.forecast_windows on delete cascade,
  sent_at timestamptz not null default now(), sent_date date generated always as ((sent_at at time zone 'UTC')::date) stored,
  unique (user_id, lake_id, sent_date)
);
create table if not exists bitecast.entitlements (
  user_id uuid primary key references auth.users on delete cascade, is_active boolean not null default false,
  product_id text, expires_at timestamptz, updated_at timestamptz not null default now()
);
create table if not exists bitecast.lake_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null, region text not null, notes text, created_at timestamptz not null default now()
);

alter table bitecast.lakes enable row level security;
alter table bitecast.lake_regulations enable row level security;
alter table bitecast.species_profiles enable row level security;
alter table bitecast.weather_hourly enable row level security;
alter table bitecast.forecast_hourly enable row level security;
alter table bitecast.forecast_windows enable row level security;
alter table bitecast.profiles enable row level security;
alter table bitecast.follows enable row level security;
alter table bitecast.catch_logs enable row level security;
alter table bitecast.push_tokens enable row level security;
alter table bitecast.alerts_sent enable row level security;
alter table bitecast.entitlements enable row level security;
alter table bitecast.lake_requests enable row level security;

create policy "read active lakes" on bitecast.lakes for select to authenticated using (is_active);
create policy "read regulations" on bitecast.lake_regulations for select to authenticated using (true);
create policy "read profiles" on bitecast.species_profiles for select to authenticated using (is_current);
create policy "read forecasts" on bitecast.forecast_hourly for select to authenticated using (true);
create policy "read windows" on bitecast.forecast_windows for select to authenticated using (true);
create policy "own profile" on bitecast.profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own follows" on bitecast.follows for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own logs" on bitecast.catch_logs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own tokens" on bitecast.push_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "read own entitlement" on bitecast.entitlements for select to authenticated using (user_id = auth.uid());
create policy "insert own requests" on bitecast.lake_requests for insert to authenticated with check (user_id = auth.uid());

grant select on bitecast.lakes, bitecast.lake_regulations, bitecast.species_profiles, bitecast.forecast_hourly, bitecast.forecast_windows to authenticated;
grant select, insert, update, delete on bitecast.profiles, bitecast.follows, bitecast.catch_logs, bitecast.push_tokens to authenticated;
grant select on bitecast.entitlements to authenticated;
grant insert on bitecast.lake_requests to authenticated;
grant all on all tables in schema bitecast to service_role;
