-- ==============================================================================
-- RESTORE AUTH USERS (15 USERS)
-- ==============================================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '1aa48c2e-70fd-4b7c-929e-cae88b33e63c',
  'authenticated',
  'authenticated',
  'davipp2009@gmail.com',
  '$2a$06$NL/sWd7clGP5gIFrdpYNiuezk1I/H6fwyi80jTHdI2gw4pfq5K5xG',
  '2026-01-09 23:32:57.968067+00',
  '2026-01-09 23:33:52.150363+00',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "davipp2009"}'::jsonb,
  now(),
  now()) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email = EXCLUDED.email;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '2f83fb5d-cfb0-45d9-aae8-ab7e14390c36',
  'authenticated',
  'authenticated',
  'adrianoeich@gmail.com',
  '$2a$06$nIM..2PsykSKESGYmHkFtuf0BFkUv24tv0FV0ALu8W61Al6xlJhUa',
  '2026-03-01 19:31:45.46416+00',
  '2026-07-23 12:46:20.257319+00',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "adrianoeich"}'::jsonb,
  now(),
  now()) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email = EXCLUDED.email;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '4826063b-ec1c-4866-ae62-a1b3380794aa',
  'authenticated',
  'authenticated',
  'doge9000wow@gmail.com',
  '$2a$06$eEPwK7lzc2rsl.mH1JX/V.4JAsxqgEJSLexuD9gOE3eRhvPsfPYJ6',
  '2026-02-13 01:33:53.434293+00',
  '2026-02-13 01:34:15.030732+00',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "doge9000wow"}'::jsonb,
  now(),
  now()) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email = EXCLUDED.email;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '644a4651-1dd7-42bb-90c5-f8f4c3b5ee8a',
  'authenticated',
  'authenticated',
  'ismael.azambuja@hotmail.com',
  '$2a$10$Tvl/wwVZ2.r92yxXiV/pbu5Z/JwxmqJAFCS8ZlnFvcdJQwPMEK42e',
  '2026-02-20 16:45:05.642914+00',
  '2026-06-10 22:53:29.752883+00',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "ismael.azambuja"}'::jsonb,
  now(),
  now()) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email = EXCLUDED.email;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '710d8670-fbc1-45a5-8d74-e05945c4e154',
  'authenticated',
  'authenticated',
  'fischerlegrand@gmail.com',
  '$2a$06$/WpZmCggZycOvwXdxiG7aO/BF5vQTsiLvCnUIjq140ZrJwNHBNJPG',
  '2025-12-22 16:30:35.559783+00',
  '2026-03-20 14:50:59.734884+00',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "fischerlegrand"}'::jsonb,
  now(),
  now()) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email = EXCLUDED.email;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '75f23839-79b2-49c2-a4f7-928bb320c251',
  'authenticated',
  'authenticated',
  'fabiano_fischer@hotmail.com',
  '$2a$10$nWLDAmmpFPRAGsxo2bxLuubZ8xaQcoCXxReU4Fp/NKpsyAVgtE4Xi',
  '2025-12-22 15:48:40.652296+00',
  '2026-07-27 13:55:15.651773+00',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "fabiano_fischer"}'::jsonb,
  now(),
  now()) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email = EXCLUDED.email;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '75f39207-c11f-4085-99fe-79a587fd7f7f',
  'authenticated',
  'authenticated',
  'maycon.finatto@gmail.com',
  '$2a$06$uNA8ikv4Suw2V.DvSyHae.Pc6omCcDqQYR4VsLrN9ttNdMeK9UXVO',
  '2026-02-06 14:45:56.591076+00',
  '2026-02-06 14:48:32.763236+00',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "maycon.finatto"}'::jsonb,
  now(),
  now()) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email = EXCLUDED.email;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '80e11cfa-a8ef-4894-9598-d9666448a000',
  'authenticated',
  'authenticated',
  'tiagogris@gmail.com',
  '$2a$06$pxnZwvbePcrRONDDUJkbK.e7j7HySWC0ekt2IsTW6K.l2rlvfNl.q',
  '2026-01-01 23:59:23.259058+00',
  '2026-07-11 04:00:14.058633+00',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "tiagogris"}'::jsonb,
  now(),
  now()) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email = EXCLUDED.email;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a0968bf6-ebd6-4cbd-8b41-99869e7aa43a',
  'authenticated',
  'authenticated',
  'jonas.fabiane2016@gmail.com',
  '$2a$06$suBS9LBBzTn3sHFW/mOFBumcWaFS.bGXlq.5QZFn73PN9BYB8Pc9G',
  '2026-01-03 22:24:06.625788+00',
  '2026-01-03 22:25:20.709097+00',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "jonas.fabiane2016"}'::jsonb,
  now(),
  now()) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email = EXCLUDED.email;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a2bdf1ce-129c-4602-9eb9-2cf45492725a',
  'authenticated',
  'authenticated',
  'oficial@louvorplay.com.br',
  '$2a$06$ZsWZIcLKRTDNWY3Em.59OeHsl0117CXolzRRyqfoN/ELMjNxr3pU6',
  '2026-02-06 15:37:28.19023+00',
  '2026-07-26 21:41:49.324165+00',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "oficial"}'::jsonb,
  now(),
  now()) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email = EXCLUDED.email;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'ae5cdbd1-5c4b-42b6-86f3-d4199938d895',
  'authenticated',
  'authenticated',
  'fabiano@tetracomunicacao.com.br',
  '$2a$06$C6FNBHVO5IU.tNGSCEVTGeL7CGh8liC5qWB6NcGei6qlFmHzVK95O',
  '2025-12-28 11:58:38.125072+00',
  '2026-03-20 14:41:56.200452+00',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "fabiano"}'::jsonb,
  now(),
  now()) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email = EXCLUDED.email;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'd2ae41a3-4926-4a39-9873-ac213fe91b5c',
  'authenticated',
  'authenticated',
  'tingolopes@gmail.com',
  '$2a$10$TG66lEGcFw5uvPtq2eKddeGL4A3YYmuD3QJp1Ozo0DTcjml45okkW',
  '2026-06-23 01:47:32.244312+00',
  '2026-06-23 01:47:47.666805+00',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "tingolopes"}'::jsonb,
  now(),
  now()) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email = EXCLUDED.email;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'e0691e77-7631-4dd0-aacd-fc1256c99ad5',
  'authenticated',
  'authenticated',
  'contato@tetracomunicacao.com.br',
  '$2a$10$Z2TckKUEb6ydB9s4fbLN3ONxVx03wcBOxw9Cf.0dzVjdPiEUOPxSy',
  NULL,
  NULL,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "contato"}'::jsonb,
  now(),
  now()) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email = EXCLUDED.email;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'e8d99b4a-042a-4f19-bc55-16a339b4afc6',
  'authenticated',
  'authenticated',
  'edgarferlin@gmail.com',
  '$2a$10$C5yKoONK/qIHRUmhFdx2suv.hDmQwszOXoEL4KMjjaNE/I61.sGq2',
  '2026-03-31 16:33:21.623041+00',
  '2026-04-15 19:54:09.505084+00',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "edgarferlin"}'::jsonb,
  now(),
  now()) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email = EXCLUDED.email;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'efdf71af-07df-40dd-ae36-d1c852e3bb03',
  'authenticated',
  'authenticated',
  'laerciovelasque@hotmail.com',
  '$2a$06$xWF1UBWGkh6GqFrt5osDQOLTBVe9u3lDF05vs4eyXBQruJvve0FcC',
  '2026-02-26 13:58:38.791221+00',
  '2026-02-28 22:55:52.345568+00',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "laerciovelasque"}'::jsonb,
  now(),
  now()) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  email = EXCLUDED.email;

