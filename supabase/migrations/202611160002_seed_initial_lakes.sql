insert into bitecast.lakes (
  slug,
  name,
  region,
  province_state,
  country,
  lat,
  lon,
  clarity_class,
  species,
  is_active,
  timezone
)
values
  ('lake-erie', 'Lake Erie', 'Great Lakes', 'ON', 'CA', 42.2, -81.2, 'stained', array['walleye'], true, 'America/Toronto'),
  ('lake-ontario', 'Lake Ontario', 'Great Lakes', 'ON', 'CA', 43.6, -77.9, 'clear', array['walleye'], true, 'America/Toronto'),
  ('bay-of-quinte', 'Bay of Quinte', 'Eastern Ontario', 'ON', 'CA', 44.16, -77.18, 'stained', array['walleye'], true, 'America/Toronto'),
  ('lake-simcoe', 'Lake Simcoe', 'Central Ontario', 'ON', 'CA', 44.43, -79.37, 'clear', array['walleye'], true, 'America/Toronto'),
  ('rainy-lake', 'Rainy Lake', 'Northwestern Ontario', 'ON', 'CA', 48.62, -93.16, 'stained', array['walleye'], true, 'America/Toronto'),
  ('lake-nipissing', 'Lake Nipissing', 'Northeastern Ontario', 'ON', 'CA', 46.25, -79.78, 'stained', array['walleye'], true, 'America/Toronto'),
  ('lake-of-the-woods', 'Lake of the Woods', 'Northwestern Ontario', 'ON', 'CA', 49.1, -94.1, 'stained', array['walleye'], true, 'America/Toronto'),
  ('french-river', 'French River', 'Northeastern Ontario', 'ON', 'CA', 46.03, -80.52, 'murky', array['walleye'], true, 'America/Toronto')
on conflict (slug) do update
set
  name = excluded.name,
  region = excluded.region,
  province_state = excluded.province_state,
  country = excluded.country,
  lat = excluded.lat,
  lon = excluded.lon,
  clarity_class = excluded.clarity_class,
  species = excluded.species,
  is_active = excluded.is_active,
  timezone = excluded.timezone,
  updated_at = now();
