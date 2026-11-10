alter table bitecast.lakes
  add column if not exists area_km2 numeric,
  add column if not exists max_depth_m numeric,
  add column if not exists timezone text not null default 'America/Toronto';

alter table bitecast.catch_logs
  add column if not exists species text not null default 'walleye',
  add column if not exists season_mode text check (season_mode in ('open_water', 'ice')),
  add column if not exists trip_started_at timestamptz,
  add column if not exists trip_ended_at timestamptz,
  add column if not exists effort_minutes integer check (effort_minutes between 1 and 1440),
  add column if not exists water_depth_m numeric check (water_depth_m >= 0),
  add column if not exists bait_category text,
  add column if not exists training_consent boolean not null default false,
  add column if not exists model_version_shown text,
  add column if not exists feature_snapshot jsonb not null default '{}'::jsonb;

alter table bitecast.forecast_hourly
  add column if not exists season_mode text not null default 'open_water'
    check (season_mode in ('open_water', 'ice'));
alter table bitecast.forecast_hourly drop constraint if exists forecast_hourly_pkey;
alter table bitecast.forecast_hourly
  add primary key (lake_id, species, season_mode, ts);

alter table bitecast.forecast_windows
  add column if not exists season_mode text not null default 'open_water'
    check (season_mode in ('open_water', 'ice'));
create index if not exists forecast_windows_lookup_idx
  on bitecast.forecast_windows (lake_id, species, season_mode, start_ts);
create unique index if not exists forecast_windows_model_unique_idx
  on bitecast.forecast_windows (lake_id, species, season_mode, start_ts, end_ts, engine_version);

create table if not exists bitecast.model_versions (
  version text primary key,
  season_mode text not null check (season_mode in ('open_water', 'ice')),
  status text not null check (status in ('challenger', 'champion', 'archived', 'rejected')),
  artifact_uri text not null,
  dataset_hash text not null,
  feature_contract_version text not null,
  metrics jsonb not null,
  created_at timestamptz not null default now(),
  promoted_at timestamptz
);
create unique index if not exists one_champion_per_season_idx
  on bitecast.model_versions (season_mode) where status = 'champion';

create table if not exists bitecast.training_runs (
  id uuid primary key default gen_random_uuid(),
  model_version text references bitecast.model_versions on delete set null,
  season_mode text not null check (season_mode in ('open_water', 'ice')),
  status text not null check (status in ('started', 'completed', 'failed', 'skipped')),
  dataset_hash text,
  input_rows integer not null default 0,
  accepted_rows integer not null default 0,
  rejected_rows integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  failure text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists bitecast.feature_snapshots (
  id uuid primary key default gen_random_uuid(),
  lake_id uuid not null references bitecast.lakes on delete cascade,
  ts timestamptz not null,
  season_mode text not null check (season_mode in ('open_water', 'ice')),
  feature_contract_version text not null,
  features jsonb not null,
  source text not null,
  created_at timestamptz not null default now(),
  unique (lake_id, ts, season_mode, feature_contract_version)
);

create table if not exists bitecast.prediction_audits (
  id uuid primary key default gen_random_uuid(),
  lake_id uuid not null references bitecast.lakes on delete cascade,
  ts timestamptz not null,
  season_mode text not null check (season_mode in ('open_water', 'ice')),
  model_version text not null references bitecast.model_versions,
  raw_probability numeric not null check (raw_probability between 0 and 1),
  bite_score smallint not null check (bite_score between 0 and 100),
  confidence_score numeric not null check (confidence_score between 0 and 1),
  features_hash text not null,
  observed_catch boolean,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lake_id, ts, season_mode, model_version)
);

alter table bitecast.model_versions enable row level security;
alter table bitecast.training_runs enable row level security;
alter table bitecast.feature_snapshots enable row level security;
alter table bitecast.prediction_audits enable row level security;

grant all on bitecast.model_versions, bitecast.training_runs,
  bitecast.feature_snapshots, bitecast.prediction_audits to service_role;

comment on column bitecast.forecast_hourly.score is
  'Relative custom-model bite score, not a catch probability or safety rating.';
comment on column bitecast.catch_logs.training_consent is
  'Explicit permission to use a pseudonymized log for model training.';
