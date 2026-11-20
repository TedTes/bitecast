alter table bitecast.catch_logs
  add column if not exists training_consent_version text,
  add column if not exists training_consent_updated_at timestamptz,
  add column if not exists validation_status text not null default 'pending'
    check (validation_status in ('pending', 'accepted', 'rejected')),
  add column if not exists validation_errors jsonb not null default '[]'::jsonb,
  add column if not exists dedupe_key text;

create index if not exists catch_logs_training_export_idx
  on bitecast.catch_logs (training_consent, validation_status, client_updated_at)
  where training_consent and deleted_at is null;
create unique index if not exists catch_logs_user_dedupe_idx
  on bitecast.catch_logs (user_id, dedupe_key)
  where deleted_at is null;

create table if not exists bitecast.log_consent_events (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references bitecast.catch_logs on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  granted boolean not null,
  policy_version text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (log_id, occurred_at)
);

create table if not exists bitecast.training_log_lineage (
  training_run_id uuid not null references bitecast.training_runs on delete cascade,
  source_log_id uuid not null,
  source_log_updated_at timestamptz not null,
  consent_policy_version text not null,
  consent_updated_at timestamptz not null,
  observation_id text not null,
  created_at timestamptz not null default now(),
  primary key (training_run_id, observation_id)
);

alter table bitecast.log_consent_events enable row level security;
alter table bitecast.training_log_lineage enable row level security;

drop policy if exists "read own consent events" on bitecast.log_consent_events;
create policy "read own consent events"
  on bitecast.log_consent_events for select to authenticated
  using (user_id = auth.uid());

grant select on bitecast.log_consent_events to authenticated;
grant all on bitecast.log_consent_events, bitecast.training_log_lineage to service_role;

create or replace function bitecast.validate_catch_log_row()
returns trigger
language plpgsql
set search_path = bitecast, public
as $$
declare
  errors jsonb := '[]'::jsonb;
begin
  if new.trip_started_at is null or new.trip_ended_at is null or new.trip_ended_at <= new.trip_started_at then
    errors := errors || jsonb_build_array('invalid_trip_window');
  end if;
  if new.effort_minutes is null or new.effort_minutes < 1 or new.effort_minutes > 1440 then
    errors := errors || jsonb_build_array('invalid_effort');
  elsif new.trip_started_at is not null and new.trip_ended_at is not null
    and abs(new.effort_minutes - extract(epoch from (new.trip_ended_at - new.trip_started_at)) / 60) > 2 then
    errors := errors || jsonb_build_array('effort_mismatch');
  end if;
  if (new.caught and new.count < 1) or (not new.caught and new.count <> 0) then
    errors := errors || jsonb_build_array('inconsistent_outcome');
  end if;
  if new.caught and (new.caught_at < new.trip_started_at or new.caught_at > new.trip_ended_at) then
    errors := errors || jsonb_build_array('catch_outside_trip');
  end if;
  if lower(new.species) <> 'walleye' then
    errors := errors || jsonb_build_array('unsupported_species');
  end if;
  if new.training_consent and (
    nullif(trim(new.training_consent_version), '') is null
    or new.training_consent_updated_at is null
    or new.training_consent_updated_at > new.client_updated_at
  ) then
    errors := errors || jsonb_build_array('invalid_training_consent');
  end if;
  if new.depth_m is not null and (new.depth_m < 0 or new.depth_m > 100) then
    errors := errors || jsonb_build_array('invalid_fishing_depth');
  end if;
  if new.water_depth_m is not null and (new.water_depth_m < 0 or new.water_depth_m > 300) then
    errors := errors || jsonb_build_array('invalid_water_depth');
  end if;

  new.dedupe_key := md5(concat_ws('|', new.lake_id::text, new.species, new.trip_started_at::text,
    new.trip_ended_at::text, coalesce(new.method, ''), coalesce(new.bait_category, '')));
  new.validation_errors := errors;
  new.validation_status := case when jsonb_array_length(errors) = 0 then 'accepted' else 'rejected' end;
  return new;
end;
$$;

drop trigger if exists validate_catch_log_before_write on bitecast.catch_logs;
create trigger validate_catch_log_before_write
before insert or update on bitecast.catch_logs
for each row execute function bitecast.validate_catch_log_row();

create or replace function bitecast.audit_catch_log_consent()
returns trigger
language plpgsql
security definer
set search_path = bitecast, public
as $$
declare
  should_audit boolean := false;
begin
  if tg_op = 'INSERT' then
    should_audit := true;
  elsif old.training_consent is distinct from new.training_consent
    or old.training_consent_version is distinct from new.training_consent_version then
    should_audit := true;
  end if;

  if should_audit then
    insert into bitecast.log_consent_events (
      log_id, user_id, granted, policy_version, occurred_at
    ) values (
      new.id,
      new.user_id,
      new.training_consent,
      coalesce(nullif(new.training_consent_version, ''), 'legacy-unversioned'),
      coalesce(new.training_consent_updated_at, new.client_updated_at)
    ) on conflict (log_id, occurred_at) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_catch_log_consent_after_write on bitecast.catch_logs;
create trigger audit_catch_log_consent_after_write
after insert or update on bitecast.catch_logs
for each row execute function bitecast.audit_catch_log_consent();

create or replace view bitecast.training_eligible_catch_logs
with (security_invoker = true)
as
select *
from bitecast.catch_logs
where training_consent
  and training_consent_version is not null
  and training_consent_updated_at is not null
  and validation_status = 'accepted'
  and deleted_at is null;

revoke all on bitecast.training_eligible_catch_logs from anon, authenticated;
grant select on bitecast.training_eligible_catch_logs to service_role;

comment on table bitecast.log_consent_events is
  'Append-only audit of per-trip training consent grants and revocations.';
comment on table bitecast.training_log_lineage is
  'Exact consented source observations used by an immutable training run.';
comment on view bitecast.training_eligible_catch_logs is
  'Currently consented, valid, non-deleted logs eligible for a new training snapshot.';
