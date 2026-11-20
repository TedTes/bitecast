-- Per-lake fishing condition chosen by the angler. NULL = automatic (typical for the
-- lake's latitude and date on the client). This never records or implies ice safety.
alter table bitecast.follows
  add column if not exists season_mode text check (season_mode in ('open_water', 'ice'));

comment on column bitecast.profiles.season_mode is
  'Account default: ice when the angler uses ice-fishing mode at all; per-lake choices live on follows.season_mode.';
