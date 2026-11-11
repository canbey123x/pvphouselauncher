-- =========================================================
-- Kanka — telefon bildirimleri (uygulama kapalıyken / telefon kilitliyken)
-- Önce "push" Edge Function'ını kur (README: Bildirimler), sonra bunu SQL Editor'da çalıştır.
-- Yeni bildirim, mesaj ve arama olunca veritabanı "push" fonksiyonunu çağırır;
-- fonksiyon da Firebase üzerinden telefona iletir. Tekrar çalıştırmak güvenlidir.
-- =========================================================
create extension if not exists pg_net with schema extensions;

create or replace function push_hook() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://dwjznnbukzliaiywzugk.supabase.co/functions/v1/push',
    body := jsonb_build_object('type', tg_op, 'table', tg_table_name, 'record', to_jsonb(new)),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 8000
  );
  return new;
exception when others then
  return new; -- bildirim gitmese de kayıt bozulmasın
end $$;

drop trigger if exists push_notifications on notifications;
create trigger push_notifications after insert on notifications for each row execute function push_hook();

drop trigger if exists push_messages on messages;
create trigger push_messages after insert on messages for each row execute function push_hook();

drop trigger if exists push_calls_ins on calls;
create trigger push_calls_ins after insert on calls for each row execute function push_hook();

drop trigger if exists push_calls_upd on calls;
create trigger push_calls_upd after update of status on calls for each row
  when (old.status is distinct from new.status) execute function push_hook();
