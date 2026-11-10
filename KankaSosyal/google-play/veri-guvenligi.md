# Veri güvenliği (Data safety) formu cevapları

Play Console > Uygulama içeriği > Veri güvenliği. Aşağıdaki cevaplar Kanka'nın bugünkü koduna göredir.

## Genel sorular
| Soru | Cevap |
|---|---|
| Uygulamanız gerekli kullanıcı veri türlerinden herhangi birini topluyor veya paylaşıyor mu? | **Evet** |
| Toplanan tüm kullanıcı verileri aktarım sırasında şifreleniyor mu? | **Evet** (HTTPS) |
| Kullanıcıların verilerinin silinmesini isteyebileceği bir yol sunuyor musunuz? | **Evet** (uygulama içi: Ayarlar > Hesabımı sil; web: hesap silme sayfası) |
| Hesap oluşturma | **Kullanıcı adı ve şifre / e-posta ile** |
| Silme adresi | `https://kankaa.com.tr/legal/hesap-silme.html` |

## Toplanan veriler

"Paylaşılıyor mu?" sorusuna hepsi için **Hayır** (Supabase bizim adımıza işleyen hizmet sağlayıcısıdır; Google'ın tanımına göre bu "paylaşım" sayılmaz).
"İsteğe bağlı mı?" sütunu: Zorunlu = uygulamayı kullanmak için gerekli.

| Kategori | Veri türü | Toplanıyor | İsteğe bağlı mı | Amaç |
|---|---|---|---|---|
| Kişisel bilgiler | Ad | Evet | Zorunlu | Uygulama işlevi, hesap yönetimi |
| Kişisel bilgiler | E-posta adresi | Evet | Zorunlu | Hesap yönetimi |
| Kişisel bilgiler | Kullanıcı kimlikleri (kullanıcı adı) | Evet | Zorunlu | Uygulama işlevi, hesap yönetimi |
| Kişisel bilgiler | Diğer bilgiler (doğum tarihi) | Evet | Zorunlu | Hesap yönetimi, dolandırıcılığı önleme / güvenlik / uyumluluk (yaş sınırı) |
| Fotoğraflar ve videolar | Fotoğraflar | Evet | İsteğe bağlı | Uygulama işlevi (paylaşım, profil fotoğrafı, mavi tik doğrulama) |
| Fotoğraflar ve videolar | Videolar | Evet | İsteğe bağlı | Uygulama işlevi |
| Mesajlar | Diğer uygulama içi mesajlar | Evet | İsteğe bağlı | Uygulama işlevi |
| Uygulama etkinliği | Uygulama etkileşimleri (beğeni, takip, gördüğün gönderiler) | Evet | Zorunlu | Uygulama işlevi, kişiselleştirme (akış sıralaması) |
| Uygulama etkinliği | Kullanıcı tarafından oluşturulan diğer içerikler (gönderi, yorum, hikâye, konum yazısı) | Evet | İsteğe bağlı | Uygulama işlevi |

## Toplanmayanlar
Konum (GPS), kişiler, takvim, ses, finans, sağlık, web geçmişi, cihaz kimlikleri, reklam kimliği,
uygulama içi arama geçmişi, kilitlenme kayıtları ve analiz verileri **toplanmaz**.
(Gönderiye eklenen "konum" kullanıcının elle yazdığı serbest metindir; GPS kullanılmaz.)

## Not: Mavi tik yüz fotoğrafı
Yüz fotoğrafı "Fotoğraflar" kapsamında, isteğe bağlı, amaç: hesap yönetimi / dolandırıcılığı önleme.
Herkese kapalı depoda saklanır, sadece yöneticiler görür, karar sonrası silinir. Biyometrik işlem yapılmaz.
