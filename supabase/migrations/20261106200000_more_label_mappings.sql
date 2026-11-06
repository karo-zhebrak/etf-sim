-- GICS sub-industry labels used by the iShares S&P 500 sector funds (IUIT, IUHC), which
-- break their holdings down below sector level. Each maps to its GICS sector, so these
-- funds show as 100% Information Technology or Health Care in the sector chart.
insert into public.label_mappings (kind, issuer, source_label, normalised_label) values
  ('sector', '*', 'Semiconductors',                              'Information Technology'),
  ('sector', '*', 'Semiconductor Equipment',                     'Information Technology'),
  ('sector', '*', 'Technology Hardware, Storage & Peripherals',  'Information Technology'),
  ('sector', '*', 'Systems Software',                            'Information Technology'),
  ('sector', '*', 'Application Software',                        'Information Technology'),
  ('sector', '*', 'Communications Equip.',                       'Information Technology'),
  ('sector', '*', 'Communications Equipment',                    'Information Technology'),
  ('sector', '*', 'IT Consulting & Other Services',              'Information Technology'),
  ('sector', '*', 'Electronic Components',                       'Information Technology'),
  ('sector', '*', 'Electronic Manufacturing Services',           'Information Technology'),
  ('sector', '*', 'Electronic Equipment & Instruments',          'Information Technology'),
  ('sector', '*', 'Internet Services & Infrastructure',          'Information Technology'),
  ('sector', '*', 'Technology Distributors',                     'Information Technology'),
  ('sector', '*', 'Pharmaceuticals',                             'Health Care'),
  ('sector', '*', 'Biotechnology',                               'Health Care'),
  ('sector', '*', 'Health Care Equipment',                       'Health Care'),
  ('sector', '*', 'Health Care Supplies',                        'Health Care'),
  ('sector', '*', 'Health Care Services',                        'Health Care'),
  ('sector', '*', 'Health Care Facilities',                      'Health Care'),
  ('sector', '*', 'Health Care Distributors',                    'Health Care'),
  ('sector', '*', 'Health Care Technology',                      'Health Care'),
  ('sector', '*', 'Managed Health Care',                         'Health Care'),
  ('sector', '*', 'Life Sciences Tools & Services',              'Health Care')
on conflict (kind, issuer, source_label) do nothing;

-- Macao, as printed on HSBC factsheets (MSCI Pacific ex Japan).
insert into public.label_mappings (kind, issuer, source_label, normalised_label, iso_code) values
  ('country', '*', 'Macao (Sar)', 'Macao', 'MO'),
  ('country', '*', 'Macao (SAR)', 'Macao', 'MO'),
  ('country', '*', 'Macao',       'Macao', 'MO'),
  ('country', '*', 'Macau',       'Macao', 'MO')
on conflict (kind, issuer, source_label) do nothing;
