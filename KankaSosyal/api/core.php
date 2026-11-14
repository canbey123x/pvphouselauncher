<?php
// =========================================================
// Kanka API — çekirdek: veritabanı bağlantısı, oturum, tür dönüşümleri, yardımcılar.
// =========================================================

// PHP 7.4 uyumu
if (!function_exists('str_contains')) {
    function str_contains($h, $n) { return $n === '' || strpos($h, $n) !== false; }
}
if (!function_exists('str_ends_with')) {
    function str_ends_with($h, $n) { return $n === '' || substr($h, -strlen($n)) === $n; }
}
if (!function_exists('str_starts_with')) {
    function str_starts_with($h, $n) { return strpos($h, $n) === 0; }
}

final class ApiError extends Exception
{
    public int $http;
    public function __construct(string $m, int $http = 400)
    {
        parent::__construct($m);
        $this->http = $http;
    }
}
function fail(string $m, int $http = 400)
{
    throw new ApiError($m, $http);
}

function cfg(?string $k = null)
{
    static $c = null;
    if ($c === null) {
        $f = __DIR__ . '/config.php';
        if (!is_file($f)) fail('Sunucu kurulmamış. Önce api/kurulum.php sayfasını aç.', 503);
        $c = require $f;
    }
    return $k === null ? $c : ($c[$k] ?? null);
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $dsn = 'mysql:host=' . cfg('db_host') . ';dbname=' . cfg('db_name') . ';charset=utf8mb4';
    try {
        $pdo = new PDO($dsn, cfg('db_user'), cfg('db_pass'), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => true,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
    } catch (PDOException $e) {
        fail('Veritabanına bağlanılamadı. Ayarları kontrol et.', 503);
    }
    $pdo->exec("SET time_zone = '+00:00'");
    ensure_schema($pdo);
    return $pdo;
}

const SCHEMA_VERSION = 1;
/** Tablolar yoksa / şema güncellendiyse otomatik kur (kurulum.php'ye gerek kalmadan). */
function ensure_schema(PDO $pdo): void
{
    $flag = __DIR__ . '/.cache/schema-' . SCHEMA_VERSION . '.ok';
    if (is_file($flag)) return;
    $sql = preg_replace('/^\s*--.*$/m', '', (string) file_get_contents(__DIR__ . '/schema.sql'));
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $st) $pdo->exec($st);
    prepare_dirs();
    @file_put_contents($flag, date('c'));
}
/** Yükleme klasörleri ve güvenlik dosyaları. */
function prepare_dirs(): void
{
    $root = dirname(__DIR__);
    @mkdir("$root/uploads", 0755, true);
    @mkdir("$root/private_uploads", 0755, true);
    @mkdir(__DIR__ . '/.cache', 0700, true);
    // yüklenen dosyalarda PHP çalışmasın; dosyalar uzun süre önbellekte kalsın
    if (!is_file("$root/uploads/.htaccess")) @file_put_contents("$root/uploads/.htaccess", "Options -Indexes -ExecCGI\nRemoveHandler .php .phtml .php3 .php4 .php5 .php7 .php8 .phar\nRemoveType .php .phtml .phar\n<FilesMatch \"\\.(php|phtml|phar|pl|py|cgi|sh)$\">\n  Require all denied\n</FilesMatch>\n<IfModule mod_headers.c>\n  Header set Cache-Control \"public, max-age=31536000, immutable\"\n  Header set X-Content-Type-Options nosniff\n</IfModule>\n");
    if (!is_file("$root/private_uploads/.htaccess")) @file_put_contents("$root/private_uploads/.htaccess", "Require all denied\nDeny from all\n");
    if (!is_file(__DIR__ . '/.cache/.htaccess')) @file_put_contents(__DIR__ . '/.cache/.htaccess', "Require all denied\nDeny from all\n");
}

/** Sorgu çalıştır; :me otomatik eklenir. */
function q(string $sql, array $p = []): PDOStatement
{
    global $ME;
    if (preg_match('/:me\b/', $sql) && !array_key_exists('me', $p)) $p['me'] = $ME ?? '';
    $st = db()->prepare($sql);
    $st->execute($p);
    return $st;
}
function q1(string $sql, array $p = []): ?array
{
    $r = q($sql, $p)->fetch();
    return $r === false ? null : $r;
}
function qv(string $sql, array $p = [])
{
    $r = q($sql, $p)->fetchColumn();
    return $r === false ? null : $r;
}
function ok(string $sql, array $p = []): bool
{
    return (bool) qv('SELECT (' . $sql . ')', $p);
}

function uuid(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}
function now_db(): string
{
    $t = microtime(true);
    return gmdate('Y-m-d H:i:s', (int) $t) . sprintf('.%03d', (int) (($t - floor($t)) * 1000));
}
function is_uuid($v): bool
{
    return is_string($v) && (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $v);
}

/* ---------- Sütun türleri ---------- */
const BOOL_COLS = ['verified', 'banned', 'private', 'hide_likes', 'restricted', 'is_group', 'is_channel', 'once', 'read', 'active'];
const JSON_COLS = ['meta', 'story_ids'];
const INT_COLS = ['ttl_hours', 'choice'];
const FLOAT_COLS = ['lat', 'lng'];
const DATE_COLS = ['birth_date', 'day'];
const PKS = [
    'conversation_reads' => ['conversation_id', 'user_id'],
    'message_reactions' => ['message_id', 'user_id'],
    'post_votes' => ['post_id', 'user_id'],
    'private_info' => ['user_id'],
    'user_locations' => ['user_id'],
    'device_tokens' => ['token'],
    'activity_days' => ['user_id', 'day'],
];
function pk(string $t): array
{
    return PKS[$t] ?? ['id'];
}
function is_ts_col(string $c): bool
{
    return str_ends_with($c, '_at') || in_array($c, ['banned_until', 'restricted_until'], true);
}

/** Tablonun gerçek sütunları (beyaz liste). */
function columns(string $t): array
{
    static $cache = [];
    if (!isset($cache[$t])) {
        if (!preg_match('/^[a-z_]+$/', $t)) fail('Geçersiz tablo');
        try {
            $cache[$t] = array_column(q("SHOW COLUMNS FROM `$t`")->fetchAll(), 'Field');
        } catch (PDOException $e) {
            fail("Tablo yok: $t");
        }
    }
    return $cache[$t];
}

/** Veritabanı satırı -> uygulamanın beklediği JSON. */
function out_row(array $r): array
{
    foreach ($r as $k => $v) {
        if ($v === null) continue;
        if (in_array($k, BOOL_COLS, true)) $r[$k] = (bool) (int) $v;
        elseif (in_array($k, JSON_COLS, true)) $r[$k] = json_decode((string) $v, true) ?? ($k === 'story_ids' ? [] : new stdClass());
        elseif (in_array($k, INT_COLS, true)) $r[$k] = is_numeric($v) ? (int) $v : $v;
        elseif (in_array($k, FLOAT_COLS, true)) $r[$k] = (float) $v;
        elseif (is_ts_col($k)) {
            $s = (string) $v;
            if (strlen($s) === 19) $s .= '.000';
            $r[$k] = str_replace(' ', 'T', substr($s, 0, 23)) . 'Z';
        }
    }
    if (array_key_exists('meta', $r) && $r['meta'] === null) $r['meta'] = new stdClass();
    if (array_key_exists('story_ids', $r) && $r['story_ids'] === null) $r['story_ids'] = [];
    return $r;
}
/** Uygulamadan gelen değer -> veritabanı değeri. */
function in_val(string $k, $v)
{
    if ($v === null) return null;
    if (in_array($k, BOOL_COLS, true)) return $v ? 1 : 0;
    if (in_array($k, JSON_COLS, true)) return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    // "choice": anket gönderisinde sayı, hikâye anketinde yazı
    if (in_array($k, INT_COLS, true)) return ($k === 'choice' && !is_numeric($v)) ? (string) $v : (int) $v;
    if (in_array($k, FLOAT_COLS, true)) return (float) $v;
    if (is_ts_col($k)) return ts_in($v);
    if (in_array($k, DATE_COLS, true)) {
        $d = substr((string) $v, 0, 10);
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) ? $d : null;
    }
    if (is_array($v) || is_object($v)) return json_encode($v, JSON_UNESCAPED_UNICODE);
    return (string) $v;
}
function ts_in($v): ?string
{
    if ($v === null || $v === '') return null;
    $t = strtotime((string) $v);
    if ($t === false) return null;
    $ms = preg_match('/\.(\d{1,3})/', (string) $v, $m) ? str_pad($m[1], 3, '0') : '000';
    return gmdate('Y-m-d H:i:s', $t) . '.' . $ms;
}

/* ---------- Oturum ---------- */
$ME = null;      // giriş yapan kullanıcı
$MEP = null;     // profili
function bearer(): string
{
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!$h && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') $h = $v;
    }
    if (!$h && isset($_POST['_token'])) return (string) $_POST['_token'];
    return preg_match('/Bearer\s+([a-f0-9]{64})/i', $h, $m) ? strtolower($m[1]) : '';
}
function load_session(): void
{
    global $ME, $MEP;
    $tok = bearer();
    if (!$tok) return;
    $h = hash('sha256', $tok);
    $s = q1('SELECT user_id, last_used FROM sessions WHERE token_hash = ?', [$h]);
    if (!$s) return;
    $ME = $s['user_id'];
    $MEP = q1('SELECT * FROM profiles WHERE id = ?', [$ME]);
    if (!$MEP) {
        $ME = null;
        return;
    }
    if (strtotime($s['last_used'] . ' UTC') < time() - 3600) q('UPDATE sessions SET last_used = ? WHERE token_hash = ?', [now_db(), $h]);
}
function need_auth(): void
{
    global $ME;
    if (!$ME) fail('Oturum kapalı. Tekrar giriş yap.', 401);
}
function is_admin(): bool
{
    global $MEP;
    return $MEP && in_array($MEP['role'], ['admin', 'owner'], true);
}
function is_owner(): bool
{
    global $MEP;
    return $MEP && $MEP['role'] === 'owner';
}
/** Yasaklı / kısıtlı değil mi? */
function is_active(): bool
{
    global $MEP;
    if (!$MEP) return false;
    $now = time();
    $until = fn($c) => $MEP[$c] === null || strtotime($MEP[$c] . ' UTC') > $now;
    if ((int) $MEP['banned'] && $until('banned_until')) return false;
    if ((int) $MEP['restricted'] && $until('restricted_until')) return false;
    return true;
}
function need_active(): void
{
    if (!is_active()) fail('Hesabın kısıtlı ya da yasaklı; bu işlemi yapamazsın.', 403);
}
function new_session(string $uid): string
{
    $tok = bin2hex(random_bytes(32));
    q('INSERT INTO sessions (token_hash, user_id, created_at, last_used) VALUES (?, ?, ?, ?)', [hash('sha256', $tok), $uid, now_db(), now_db()]);
    return $tok;
}

/* ---------- Kural yardımcıları (SQL parçaları) ---------- */
$ALIAS = 0;
function al(): string
{
    global $ALIAS;
    return 'z' . (++$ALIAS);
}
function sql_blocked(string $x): string
{
    $b = al();
    return "EXISTS (SELECT 1 FROM blocks $b WHERE ($b.blocker_id = $x AND $b.blocked_id = :me) OR ($b.blocker_id = :me AND $b.blocked_id = $x))";
}
/** Bu kişinin içeriğini görebilir miyim? (gizli hesap + engelleme) */
function sql_can_view(string $x): string
{
    if (is_admin()) return '1=1';
    $p = al();
    $f = al();
    return "($x = :me OR (NOT " . sql_blocked($x) . " AND (COALESCE((SELECT $p.private FROM profiles $p WHERE $p.id = $x), 0) = 0 OR EXISTS (SELECT 1 FROM follows $f WHERE $f.follower_id = :me AND $f.following_id = $x))))";
}
function sql_is_member(string $c): string
{
    $a = al();
    $m = al();
    return "(EXISTS (SELECT 1 FROM conversations $a WHERE $a.id = $c AND (:me = $a.a OR :me = $a.b)) OR EXISTS (SELECT 1 FROM conversation_members $m WHERE $m.conversation_id = $c AND $m.user_id = :me))";
}
/** Bu kişiye mesaj atabilir miyim? */
function dm_allowed(string $target): bool
{
    global $ME;
    if ($target === $ME || is_admin()) return true;
    if (ok(sql_blocked(':t'), ['t' => $target])) return false;
    $pol = qv('SELECT dm_policy FROM profiles WHERE id = ?', [$target]) ?? 'everyone';
    if ($pol === 'everyone') return true;
    if ($pol === 'following') return (bool) qv('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', [$target, $ME]);
    return false;
}
function can_view(string $owner): bool
{
    return ok(sql_can_view(':o'), ['o' => $owner]);
}
function is_member(string $conv): bool
{
    return ok(sql_is_member(':c'), ['c' => $conv]);
}
function blocked_between(string $a): bool
{
    return ok(sql_blocked(':x'), ['x' => $a]);
}

/** Değişiklik kaydı (canlı güncelleme için). */
const LIVE_TABLES = ['messages', 'conversation_reads', 'message_reactions', 'calls', 'group_calls', 'lives', 'notifications'];
function log_change(string $t, array $row, string $ev): void
{
    if (!in_array($t, LIVE_TABLES, true)) return;
    $key = implode('|', array_map(fn($k) => (string) ($row[$k] ?? ''), pk($t)));
    // silinen satırda sadece anahtar alanlar saklanır (içerik değil)
    $keep = [];
    foreach ($row as $k => $v) if ($k === 'id' || str_ends_with($k, '_id') || $k === 'status') $keep[$k] = $v;
    q('INSERT INTO changes (tbl, row_key, ev, data, created_at) VALUES (?, ?, ?, ?, ?)', [$t, $key, $ev, json_encode($keep), now_db()]);
}

function client_ip(): string
{
    return substr((string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
}
/** Sitenin adresi (yüklenen dosyaların bağlantısı için). */
function site_url(): string
{
    $u = (string) cfg('site_url');
    if ($u) return rtrim($u, '/');
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    $base = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php')), '/');
    return ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $base;
}
