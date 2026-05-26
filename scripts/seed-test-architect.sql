-- Script de seed : architecte test edifio
-- Usage : coller dans Supabase SQL Editor ou psql
-- Cet architecte est préféré (preferred=true) et couvre toutes les zones géo
-- pour être toujours retourné dans le matching.
--
-- ATTENTION : à supprimer avant mise en service réelle (email hello@edifio.fr
-- est un compte test — ne pas laisser en prod).

INSERT INTO architects (
  id,
  organization_id,
  cabinet,
  contact_name,
  email,
  specialty_codes,
  geo_zones,
  tutoiement,
  preferred,
  active,
  past_collabs_count,
  notes,
  rgpd_opposition
) VALUES (
  uuid_generate_v4(),
  '11111111-1111-1111-1111-111111111111',  -- ALYOS_ORG_ID
  'Architecte Test edifio',
  'Test edifio',
  'hello@edifio.fr',
  ARRAY['archi_logement','archi_sport','archi_sante','archi_culture','archi_bureau',
        'archi_enseignement','archi_industrie','archi_commerce','archi_renovation',
        'archi_patrimoine']::text[],
  ARRAY['01','02','03','04','05','06','07','08','09','10',
        '11','12','13','14','15','16','17','18','19','20',
        '21','22','23','24','25','26','27','28','29','30',
        '31','32','33','34','35','36','37','38','39','40',
        '41','42','43','44','45','46','47','48','49','50',
        '51','52','53','54','55','56','57','58','59','60',
        '61','62','63','64','65','66','67','68','69','70',
        '71','72','73','74','75','76','77','78','79','80',
        '81','82','83','84','85','86','87','88','89','90',
        '91','92','93','94','95','971','972','973','974']::text[],
  false,
  true,
  true,
  0,
  'Architecte test — preferred=true, toutes zones géo — à supprimer avant mise en service réelle.',
  false
)
ON CONFLICT DO NOTHING;
