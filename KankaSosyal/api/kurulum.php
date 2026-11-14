<?php
// =========================================================
// Kanka — tek seferlik kurulum sayfası.
// Veritabanı bilgilerini alır, api/config.php dosyasını yazar ve tabloları kurar.
// Kurulumdan sonra sadece "tabloları güncelle" düğmesi kalır (bilgiler bir daha gösterilmez).
// =========================================================
declare(strict_types=1);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
$cfgFile = __DIR__ . '/config.php';
$msg = '';
$err = '';

function h($s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
}
/** schema.sql'i çalıştır. */
function run_schema(PDO $pdo): int
{
    $sql = (string) file_get_contents(__DIR__ . '/schema.sql');
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    $n = 0;
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $st) {
        $pdo->exec($st);
        $n++;
    }
    return $n;
}
function prepare_dirs_k(): void
{
    $root = dirname(__DIR__);
    @mkdir("$root/uploads", 0755, true);
    @mkdir("$root/private_uploads", 0755, true);
    @mkdir(__DIR__ . '/.cache', 0700, true);
    @file_put_contents("$root/uploads/.htaccess", "Options -Indexes -ExecCGI\nRemoveHandler .php .phtml .php3 .php4 .php5 .php7 .php8 .phar\nRemoveType .php .phtml .phar\n<FilesMatch \"\\.(php|phtml|phar|pl|py|cgi|sh)$\">\n  Require all denied\n</FilesMatch>\n<IfModule mod_headers.c>\n  Header set Cache-Control \"public, max-age=31536000, immutable\"\n  Header set X-Content-Type-Options nosniff\n</IfModule>\n");
    @file_put_contents("$root/private_uploads/.htaccess", "Require all denied\nDeny from all\n");
    @file_put_contents(__DIR__ . '/.cache/.htaccess', "Require all denied\nDeny from all\n");
}

$done = is_file($cfgFile);
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        if (!$done) {
            $c = [
                'db_host' => trim($_POST['db_host'] ?? 'localhost') ?: 'localhost',
                'db_name' => trim($_POST['db_name'] ?? ''),
                'db_user' => trim($_POST['db_user'] ?? ''),
                'db_pass' => (string) ($_POST['db_pass'] ?? ''),
                'site_url' => rtrim(trim($_POST['site_url'] ?? ''), '/'),
                'secret' => bin2hex(random_bytes(32)),
                'fcm_service_account' => trim($_POST['fcm'] ?? ''),
                'turn_servers' => [],
                'debug' => false,
            ];
            if (trim($_POST['turn_user'] ?? '') !== '') {
                $c['turn_servers'] = [
                    ['urls' => 'stun:stun.relay.metered.ca:80'],
                    ['urls' => ['turn:standard.relay.metered.ca:80', 'turn:standard.relay.metered.ca:80?transport=tcp', 'turn:standard.relay.metered.ca:443', 'turns:standard.relay.metered.ca:443?transport=tcp'], 'username' => trim($_POST['turn_user']), 'credential' => trim($_POST['turn_pass'] ?? '')],
                ];
            }
            if ($c['fcm_service_account'] !== '' && !json_decode($c['fcm_service_account'], true)) throw new Exception('Firebase hizmet hesabı geçerli bir JSON değil. Dosyanın tamamını yapıştır ya da boş bırak.');
            $pdo = new PDO('mysql:host=' . $c['db_host'] . ';dbname=' . $c['db_name'] . ';charset=utf8mb4', $c['db_user'], $c['db_pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $n = run_schema($pdo);
            prepare_dirs_k();
            $php = "<?php\n// Kanka sunucu ayarları — kurulum.php tarafından yazıldı. Kimseyle paylaşma.\nreturn " . var_export($c, true) . ";\n";
            if (@file_put_contents($cfgFile, $php) === false) throw new Exception('api/config.php yazılamadı. Dosya Yöneticisi\'nde api klasörüne yazma izni ver (755).');
            @chmod($cfgFile, 0600);
            $done = true;
            $msg = "Kurulum tamamlandı. $n tablo/işlem hazır. Artık uygulamayı açıp kaydolabilirsin; ilk açılan hesap kurucu olur.";
        } else {
            // kurulum yapılmış: sadece tabloları kur / güncelle
            $c = require $cfgFile;
            $pdo = new PDO('mysql:host=' . $c['db_host'] . ';dbname=' . $c['db_name'] . ';charset=utf8mb4', $c['db_user'], $c['db_pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $n = run_schema($pdo);
            prepare_dirs_k();
            $msg = "Tablolar güncel ($n işlem).";
        }
    } catch (PDOException $e) {
        $err = 'Veritabanına bağlanılamadı ya da tablolar kurulamadı: ' . $e->getMessage();
    } catch (Throwable $e) {
        $err = $e->getMessage();
    }
}
$status = '';
if ($done && !$err) {
    try {
        $c = require $cfgFile;
        $pdo = new PDO('mysql:host=' . $c['db_host'] . ';dbname=' . $c['db_name'] . ';charset=utf8mb4', $c['db_user'], $c['db_pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $users = $pdo->query("SELECT COUNT(*) FROM profiles")->fetchColumn();
        $status = "Veritabanı bağlantısı çalışıyor · $users kullanıcı · telefon bildirimleri: " . (!empty($c['fcm_service_account']) ? 'açık' : 'kapalı') . ' · arama sunucusu: ' . (!empty($c['turn_servers']) ? 'var' : 'yok');
    } catch (Throwable $e) {
        $status = 'Tablolar henüz kurulmamış olabilir. Aşağıdaki düğmeye bas.';
    }
}
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$guess = $https . '://' . ($_SERVER['HTTP_HOST'] ?? '') . rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/kurulum.php')), '/');
?><!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kanka kurulum</title>
<style>
body{margin:0;background:#0b0814;color:#f5f5f5;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.w{max-width:560px;margin:0 auto;padding:28px 18px}
h1{font-size:26px;margin:0 0 4px;background:linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7);-webkit-background-clip:text;background-clip:text;color:transparent}
label{display:block;margin:14px 0 4px;font-weight:600;font-size:13px}
input,textarea{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid #333;background:#16121f;color:#fff;font:inherit}
textarea{min-height:90px;font:12px monospace}
small{color:#a8a8a8}
button{margin-top:20px;width:100%;padding:13px;border:0;border-radius:10px;background:#0095f6;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
.ok{background:#10261b;border:1px solid #1d4a32;color:#5be09a;padding:12px;border-radius:10px;margin:14px 0}
.err{background:#2a0d12;border:1px solid #5a1a22;color:#ff8a92;padding:12px;border-radius:10px;margin:14px 0}
details{margin-top:14px;background:#16121f;border-radius:10px;padding:10px 12px}
summary{cursor:pointer;font-weight:600}
</style></head><body><div class="w">
<h1>Kanka kurulum</h1>
<?php if ($msg): ?><div class="ok"><?= h($msg) ?></div><?php endif; ?>
<?php if ($err): ?><div class="err"><?= h($err) ?></div><?php endif; ?>
<?php if ($done): ?>
  <p><?= h($status) ?></p>
  <p><small>Ayarları değiştirmek için cPanel Dosya Yöneticisi'nde <b>api/config.php</b> dosyasını sil ve bu sayfayı yeniden aç.</small></p>
  <form method="post"><button>Tabloları kur / güncelle</button></form>
<?php else: ?>
  <p><small>cPanel &gt; MySQL Veritabanları'nda oluşturduğun veritabanı bilgilerini yaz. Bilgiler sadece bu sunucudaki <b>api/config.php</b> dosyasına yazılır.</small></p>
  <form method="post" autocomplete="off">
    <label>Veritabanı sunucusu</label><input name="db_host" value="localhost">
    <label>Veritabanı adı</label><input name="db_name" required placeholder="kullanici_kanka">
    <label>Veritabanı kullanıcısı</label><input name="db_user" required placeholder="kullanici_kankauser">
    <label>Veritabanı şifresi</label><input name="db_pass" type="password" required>
    <label>Sitenin adresi</label><input name="site_url" value="<?= h($guess) ?>"><small>Yüklenen fotoğraf ve videoların bağlantısı bu adresle başlar.</small>
    <details><summary>İsteğe bağlı: telefon bildirimleri (Firebase)</summary>
      <label>Firebase hizmet hesabı JSON'u</label><textarea name="fcm" placeholder='{"type":"service_account", ...}'></textarea>
      <small>Firebase &gt; Proje ayarları &gt; Hizmet hesapları &gt; Yeni özel anahtar oluştur ile inen dosyanın tamamı.</small></details>
    <details><summary>İsteğe bağlı: mobil ağda arama (Metered TURN)</summary>
      <label>TURN kullanıcı adı (username)</label><input name="turn_user">
      <label>TURN şifresi (credential)</label><input name="turn_pass"></details>
    <button>Kur</button>
  </form>
<?php endif; ?>
</div></body></html>
