// =========================================================
// config.js — Sunucu ayarı.
// Arkadaşlarınla ORTAK kullanmak için ücretsiz bir Supabase projesi aç
// (README'deki adımlar), aşağıya URL ve "anon public" anahtarı yaz.
// Boş bırakılırsa uygulama "Yerel mod"da çalışır: her şey sadece bu cihazda saklanır.
// Uygulamanın içinden de (Ayarlar > Sunucu) girilebilir.
// =========================================================
export const SUPABASE_URL = 'https://dwjznnbukzliaiywzugk.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_s2rnDOtXpDz3eb2aMws7Fw_X0xaYUHw';

// Sesli arama için bağlantı sunucuları. Varsayılan: Google STUN (ücretsiz).
// Bazı mobil ağlarda aramanın bağlanması için bir TURN sunucusu gerekebilir, örnek:
// export const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'turn:turn.ornek.com:3478', username: 'kullanici', credential: 'sifre' }];
export const ICE_SERVERS = [];
