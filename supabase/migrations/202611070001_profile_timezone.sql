alter table bitecast.profiles
  add column if not exists timezone text not null default 'America/Toronto';
