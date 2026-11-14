<?php
// =========================================================
// Kanka API — tek giriş noktası.
// İstek: POST JSON { op, ... }  (dosya yükleme: multipart/form-data)
// Oturum: Authorization: Bearer <anahtar>
// Yanıt: { data } ya da { error }
// =========================================================
declare(strict_types=1);
require __DIR__ . '/core.php';
require __DIR__ . '/rules.php';
require __DIR__ . '/data.php';
require __DIR__ . '/rpc.php';
require __DIR__ . '/push.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Max-Age: 86400');
header('X-Content-Type-Options: nosniff');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

const MAX_UPLOAD = 60 * 1024 * 1024;
const MIME_EXT = [
    'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp', 'image/heic' => 'heic',
    'video/mp4' => 'mp4', 'video/webm' => 'webm', 'video/quicktime' => 'mov', 'video/3gpp' => '3gp',
    'audio/webm' => 'weba', 'audio/ogg' => 'ogg', 'audio/mp4' => 'm4a', 'audio/x-m4a' => 'm4a', 'audio/mpeg' => 'mp3', 'audio/aac' => 'aac', 'audio/wav' => 'wav', 'audio/x-wav' => 'wav',
];

function respond($data, int $code = 200): void
{
    global $PUSH;
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    $body = json_encode($code === 200 ? ['data' => $data] : ['error' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    header('Content-Length: ' . strlen($body));
    echo $body;
    // bildirimleri yanıttan sonra gönder (uygulama beklemesin)
    if ($PUSH) {
        if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
        elseif (function_exists('litespeed_finish_request')) litespeed_finish_request();
        else {
            @ob_end_flush();
            @flush();
        }
        ignore_user_abort(true);
        run_push($PUSH);
    }
    exit;
}

/* ---------- Giriş / kayıt ---------- */
function too_many_attempts(): void
{
    $n = (int) qv('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND created_at > UTC_TIMESTAMP(3) - INTERVAL 15 MINUTE', [client_ip()]);
    if ($n >= 12) fail('Çok fazla deneme yapıldı. 15 dakika sonra tekrar dene.', 429);
}
function op_signup(array $b): array
{
    too_many_attempts();
    $email = strtolower(trim((string) ($b['email'] ?? '')));
    $pass = (string) ($b['password'] ?? '');
    $user = strtolower(preg_replace('/[^a-z0-9_.]/i', '', (string) ($b['username'] ?? '')));
    $name = mb_substr(trim((string) ($b['name'] ?? '')), 0, 40);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Geçerli bir e-posta yaz.');
    if (strlen($pass) < 6) fail('Şifre en az 6 karakter olmalı.');
    if (strlen($user) < 3 || strlen($user) > 24) fail('Kullanıcı adı 3-24 karakter olmalı (harf, rakam, _ ve .).');
    if (qv('SELECT 1 FROM accounts WHERE email = ?', [$email])) fail('Bu e-posta ile zaten bir hesap var. Giriş yap.');
    if (qv('SELECT 1 FROM profiles WHERE username = ?', [$user])) fail('Bu kullanıcı adı alınmış.');
    q('INSERT INTO login_attempts (ip, email, created_at) VALUES (?, ?, ?)', [client_ip(), $email, now_db()]);
    $id = uuid();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        // ilk hesap kurucu olur
        $first = !qv("SELECT 1 FROM profiles WHERE role IN ('admin','owner') LIMIT 1");
        q('INSERT INTO accounts (id, email, pass, created_at) VALUES (?, ?, ?, ?)', [$id, $email, password_hash($pass, PASSWORD_DEFAULT), now_db()]);
        q('INSERT INTO profiles (id, username, name, bio, verified, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [$id, $user, $name, '', $first ? 1 : 0, $first ? 'owner' : 'user', now_db()]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        if ($e instanceof PDOException && $e->getCode() === '23000') fail('Bu e-posta ya da kullanıcı adı alınmış.');
        throw $e;
    }
    return ['token' => new_session($id), 'user_id' => $id];
}
function op_signin(array $b): array
{
    too_many_attempts();
    $email = strtolower(trim((string) ($b['email'] ?? '')));
    $a = q1('SELECT * FROM accounts WHERE email = ?', [$email]);
    if (!$a || !password_verify((string) ($b['password'] ?? ''), $a['pass'])) {
        q('INSERT INTO login_attempts (ip, email, created_at) VALUES (?, ?, ?)', [client_ip(), $email, now_db()]);
        fail('E-posta ya da şifre yanlış.');
    }
    if (password_needs_rehash($a['pass'], PASSWORD_DEFAULT)) q('UPDATE accounts SET pass = ? WHERE id = ?', [password_hash((string) $b['password'], PASSWORD_DEFAULT), $a['id']]);
    if (!qv('SELECT 1 FROM profiles WHERE id = ?', [$a['id']])) fail('Bu hesap silinmiş.');
    return ['token' => new_session($a['id']), 'user_id' => $a['id']];
}
function op_password(array $b): void
{
    global $ME;
    need_auth();
    $pw = (string) ($b['password'] ?? '');
    if (strlen($pw) < 6) fail('Şifre en az 6 karakter olmalı.');
    q('UPDATE accounts SET pass = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $ME]);
    // diğer cihazlardaki oturumları kapat
    q('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', [$ME, hash('sha256', bearer())]);
}

/* ---------- Dosyalar ---------- */
function upload_root(bool $private): string
{
    return dirname(__DIR__) . ($private ? '/private_uploads' : '/uploads');
}
function save_upload(bool $private): string
{
    global $ME;
    need_auth();
    if (!$private) need_active();
    $f = $_FILES['file'] ?? null;
    if (!$f || ($f['error'] ?? 1) !== UPLOAD_ERR_OK) {
        $err = $f['error'] ?? -1;
        if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) fail('Dosya sunucunun izin verdiğinden büyük. (cPanel > PHP ayarları: upload_max_filesize ve post_max_size en az 64M olmalı)');
        fail('Dosya yüklenemedi.');
    }
    if ($f['size'] > MAX_UPLOAD) fail('Dosya çok büyük (en fazla 60 MB).');
    $mime = '';
    if (function_exists('finfo_open')) {
        $fi = finfo_open(FILEINFO_MIME_TYPE);
        $mime = (string) finfo_file($fi, $f['tmp_name']);
        finfo_close($fi);
    }
    $claimed = strtolower(explode(';', (string) ($_POST['type'] ?? $f['type'] ?? ''))[0]);
    // tarayıcı ses kayıtları bazen video/webm görünür; tür ailesi uyuşuyorsa beyan edileni kullan
    if (!isset(MIME_EXT[$mime]) || ($mime === 'video/webm' && $claimed === 'audio/webm') || ($mime === 'video/mp4' && $claimed === 'audio/mp4') || $mime === 'application/octet-stream') $mime = $claimed;
    if (!isset(MIME_EXT[$mime])) fail('Bu dosya türü desteklenmiyor.');
    if ($private && !str_starts_with($mime, 'image/')) fail('Sadece fotoğraf yüklenebilir.');
    $rel = $ME . '/' . gmdate('Ym') . '/' . bin2hex(random_bytes(12)) . '.' . MIME_EXT[$mime];
    $dst = upload_root($private) . '/' . $rel;
    if (!is_dir(dirname($dst)) && !@mkdir(dirname($dst), 0755, true)) fail('Sunucuda klasör oluşturulamadı (yazma izni).');
    if (!move_uploaded_file($f['tmp_name'], $dst)) fail('Dosya kaydedilemedi.');
    @chmod($dst, 0644);
    return $private ? $rel : site_url() . '/uploads/' . $rel;
}
function sign_file(string $rel, int $exp): string
{
    return hash_hmac('sha256', $rel . '|' . $exp, (string) cfg('secret'));
}
/** Gizli dosya (mavi tik selfie'si): sahibi ve yöneticiler için kısa süreli bağlantı. */
function op_signed_url(string $rel): string
{
    global $ME;
    need_auth();
    if (!preg_match('#^[0-9a-f-]{36}/\d{6}/[0-9a-f]{24}\.[a-z0-9]+$#', $rel)) return '';
    if (!is_admin() && !str_starts_with($rel, $ME . '/')) return '';
    $exp = time() + 600;
    return site_url() . '/api/index.php?file=' . rawurlencode($rel) . "&exp=$exp&sig=" . sign_file($rel, $exp);
}
function op_remove_private(string $rel): void
{
    global $ME;
    need_auth();
    if (!preg_match('#^[0-9a-f-]{36}/\d{6}/[0-9a-f]{24}\.[a-z0-9]+$#', $rel)) return;
    if (!is_admin() && !str_starts_with($rel, $ME . '/')) return;
    @unlink(upload_root(true) . '/' . $rel);
}
function delete_user_files(string $uid): void
{
    foreach ([false, true] as $priv) {
        $dir = upload_root($priv) . '/' . $uid;
        if (!is_uuid($uid) || !is_dir($dir)) continue;
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($it as $f) $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
        @rmdir($dir);
    }
}
function serve_private_file(): void
{
    $rel = (string) ($_GET['file'] ?? '');
    $exp = (int) ($_GET['exp'] ?? 0);
    $sig = (string) ($_GET['sig'] ?? '');
    if ($exp < time() || !hash_equals(sign_file($rel, $exp), $sig) || str_contains($rel, '..')) {
        http_response_code(403);
        exit('Bağlantının süresi doldu.');
    }
    $p = upload_root(true) . '/' . $rel;
    if (!is_file($p)) {
        http_response_code(404);
        exit;
    }
    header('Content-Type: ' . (array_search(pathinfo($p, PATHINFO_EXTENSION), MIME_EXT, true) ?: 'application/octet-stream'));
    header('Cache-Control: private, max-age=600');
    readfile($p);
    exit;
}

/* ---------- Yönlendirme ---------- */
try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        if (isset($_GET['file'])) serve_private_file();
        respond(['ok' => true, 'app' => 'kanka', 'setup' => is_file(__DIR__ . '/config.php')]);
    }
    $isForm = isset($_POST['op']);
    $b = $isForm ? $_POST : (json_decode((string) file_get_contents('php://input'), true) ?: []);
    $op = (string) ($b['op'] ?? '');
    load_session();
    $t = (string) ($b['table'] ?? '');
    switch ($op) {
        case 'ping':
            respond(['ok' => true]);
        case 'signup':
            respond(op_signup($b));
        case 'signin':
            respond(op_signin($b));
        case 'signout':
            if (bearer()) q('DELETE FROM sessions WHERE token_hash = ?', [hash('sha256', bearer())]);
            respond(null);
        case 'me':
            global $ME;
            respond(['user_id' => $ME]);
        case 'password':
            op_password($b);
            respond(null);
        case 'delete_account':
            op_delete_account();
            respond(null);
        case 'list':
            need_auth();
            respond(op_list($t, (array) ($b['o'] ?? [])));
        case 'get':
            need_auth();
            respond(op_get($t, $b['id'] ?? ''));
        case 'insert':
            respond(op_insert($t, (array) ($b['row'] ?? [])));
        case 'update':
            respond(op_update($t, $b['id'] ?? '', (array) ($b['patch'] ?? [])));
        case 'remove':
            op_remove($t, (array) ($b['match'] ?? []));
            respond(null);
        case 'upsert':
            respond(op_upsert($t, (array) ($b['row'] ?? []), isset($b['on']) ? (string) $b['on'] : null));
        case 'rpc':
            respond(op_rpc((string) ($b['name'] ?? ''), (array) ($b['args'] ?? [])));
        case 'upload':
            respond(save_upload(false));
        case 'upload_private':
            respond(save_upload(true));
        case 'signed_url':
            respond(op_signed_url((string) ($b['path'] ?? '')));
        case 'remove_private':
            op_remove_private((string) ($b['path'] ?? ''));
            respond(null);
        case 'poll':
            respond(op_poll(isset($b['after']) && $b['after'] !== null ? (int) $b['after'] : null, (array) ($b['tables'] ?? [])));
        case 'send':
            op_send((string) ($b['channel'] ?? ''), (string) ($b['ev'] ?? ''), $b['payload'] ?? null);
            respond(null);
        case 'recv':
            respond(op_recv((array) ($b['channels'] ?? []), isset($b['after']) && $b['after'] !== null ? (int) $b['after'] : null));
        case 'sync':
            // tek istekte hem değişiklikler hem sinyaller (pil ve trafik tasarrufu)
            $out = [];
            if (isset($b['poll'])) $out['poll'] = op_poll(isset($b['poll']['after']) && $b['poll']['after'] !== null ? (int) $b['poll']['after'] : null, (array) ($b['poll']['tables'] ?? []));
            if (isset($b['recv'])) $out['recv'] = op_recv((array) ($b['recv']['channels'] ?? []), isset($b['recv']['after']) && $b['recv']['after'] !== null ? (int) $b['recv']['after'] : null);
            respond($out);
    }
    fail('Bilinmeyen işlem');
} catch (ApiError $e) {
    respond($e->getMessage(), $e->http);
} catch (Throwable $e) {
    error_log('kanka api: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    respond((is_file(__DIR__ . '/config.php') && cfg('debug')) ? $e->getMessage() : 'Sunucu hatası. Biraz sonra tekrar dene.', 500);
}
