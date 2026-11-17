alter table bitecast.model_versions
  add column if not exists model_family text not null default 'hourly'
    check (model_family in ('hourly', 'trip_broad')),
  add column if not exists prediction_granularity text not null default 'hour'
    check (prediction_granularity in ('hour', 'time_block'));

drop index if exists bitecast.one_champion_per_season_idx;
create unique index if not exists one_champion_per_family_season_idx
  on bitecast.model_versions (model_family, season_mode)
  where status = 'champion';

alter table bitecast.training_runs
  add column if not exists model_family text not null default 'hourly'
    check (model_family in ('hourly', 'trip_broad'));

alter table bitecast.forecast_hourly
  add column if not exists model_family text not null default 'hourly'
    check (model_family in ('hourly', 'trip_broad')),
  add column if not exists prediction_granularity text not null default 'hour'
    check (prediction_granularity in ('hour', 'time_block')),
  add column if not exists time_precision text not null default 'exact'
    check (time_precision in ('exact', 'time_block', 'day', 'unknown'));

alter table bitecast.forecast_windows
  add column if not exists model_family text not null default 'hourly'
    check (model_family in ('hourly', 'trip_broad')),
  add column if not exists prediction_granularity text not null default 'hour'
    check (prediction_granularity in ('hour', 'time_block')),
  add column if not exists time_precision text not null default 'exact'
    check (time_precision in ('exact', 'time_block', 'day', 'unknown'));

alter table bitecast.feature_snapshots
  add column if not exists model_family text not null default 'hourly'
    check (model_family in ('hourly', 'trip_broad')),
  add column if not exists prediction_granularity text not null default 'hour'
    check (prediction_granularity in ('hour', 'time_block')),
  add column if not exists time_precision text not null default 'exact'
    check (time_precision in ('exact', 'time_block', 'day', 'unknown'));

alter table bitecast.feature_snapshots
  drop constraint if exists feature_snapshots_lake_id_ts_season_mode_feature_contract_version_key;
create unique index if not exists feature_snapshots_family_unique_idx
  on bitecast.feature_snapshots
    (lake_id, ts, season_mode, model_family, feature_contract_version);

alter table bitecast.prediction_audits
  add column if not exists model_family text not null default 'hourly'
    check (model_family in ('hourly', 'trip_broad')),
  add column if not exists prediction_granularity text not null default 'hour'
    check (prediction_granularity in ('hour', 'time_block')),
  add column if not exists time_precision text not null default 'exact'
    check (time_precision in ('exact', 'time_block', 'day', 'unknown'));

alter table bitecast.prediction_audits
  drop constraint if exists prediction_audits_lake_id_ts_season_mode_model_version_key;
create unique index if not exists prediction_audits_granularity_unique_idx
  on bitecast.prediction_audits
    (lake_id, ts, season_mode, model_version, prediction_granularity);

comment on column bitecast.forecast_hourly.prediction_granularity is
  'hour for precise angler-hour champions; time_block for explicitly broad fallback forecasts.';
comment on column bitecast.forecast_hourly.time_precision is
  'Precision of the model evidence and forecast period; broad values must not be presented as exact peaks.';
