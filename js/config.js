// =========================================================
// config.js — Sunucu ayarı.
// API_URL: kendi sunucumuz (cPanel'deki api/ klasörü). Site aynı sunucudan açılırsa
// otomatik bulunur; Android uygulaması bu adresi (ya da server.json'daki "api") kullanır.
// Boş bırakılırsa uygulama "Yerel mod"da çalışır: her şey sadece bu cihazda saklanır.
// =========================================================
export const API_URL = 'https://kankaa.com.tr/api/';

// Eski Supabase bağlantısı (artık kullanılmıyor)
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Sesli arama için ek bağlantı sunucuları (TURN bilgileri sunucudaki config.php'de durur).
export const ICE_SERVERS = [];
