-- hallo flow v2 — seed the 12 demo tenants for hallo theo Berlin Mitte
insert into tenants (id, name, unit, rent_cents, archetype) values
  ('muller',    'Müller',    '1A', 110000, 'reliable'),
  ('weber',     'Weber',     '1B', 125000, 'reliable'),
  ('schneider', 'Schneider', '2A',  98000, 'reliable'),
  ('fischer',   'Fischer',   '2B', 130000, 'reliable'),
  ('wagner',    'Wagner',    '3A', 105000, 'reliable'),
  ('becker',    'Becker',    '3B', 140000, 'reliable'),
  ('hoffmann',  'Hoffmann',  '4A', 120000, 'soft_fail'),
  ('kaya',      'Kaya',      '4B', 120000, 'payment_plan'),
  ('nowak',     'Nowak',     '5A', 135000, 'soft_fail'),
  ('braun',     'Braun',     '5B', 110000, 'reliable'),
  ('richter',   'Richter',   '6A', 147000, 'critical'),
  ('klein',     'Klein',     '6B', 140000, 'reliable')
on conflict (id) do nothing;
