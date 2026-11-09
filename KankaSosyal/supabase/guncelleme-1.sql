-- Kanka güncellemesi: düzenleyici (yazı, çıkartma, çizim, filtre, konum) için.
-- Supabase > SQL Editor > New query > bunu yapıştır > Run. Bir kez yeterli.
alter table posts add column if not exists meta jsonb not null default '{}'::jsonb;
alter table stories add column if not exists meta jsonb not null default '{}'::jsonb;
notify pgrst, 'reload schema';
