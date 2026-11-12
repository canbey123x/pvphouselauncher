-- =========================================================
-- Kanka — sesli arama aktarma (TURN) sunucusu bilgileri
-- Bilgiler depoya (GitHub) konmaz; burada saklanır ve sadece giriş yapmış kullanıcılar okuyabilir.
-- Doldurulmuş hâli sana ayrıca verildi; bu dosya boş şablondur.
-- =========================================================
create table if not exists call_config (
  id int primary key default 1 check (id = 1),
  ice jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table call_config enable row level security;
drop policy if exists "read_call_config" on call_config;
create policy "read_call_config" on call_config for select to authenticated using (true);
-- ekleme / değiştirme sadece SQL Editor'den (yönetici) yapılır

insert into call_config (id, ice) values (1, '[
  {"urls": "stun:stun.relay.metered.ca:80"},
  {"urls": ["turn:standard.relay.metered.ca:80", "turn:standard.relay.metered.ca:80?transport=tcp",
            "turn:standard.relay.metered.ca:443", "turns:standard.relay.metered.ca:443?transport=tcp"],
   "username": "KULLANICI_ADI", "credential": "SIFRE"}
]'::jsonb)
on conflict (id) do update set ice = excluded.ice, updated_at = now();

notify pgrst, 'reload schema';
