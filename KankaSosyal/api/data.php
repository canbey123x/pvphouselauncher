<?php
// =========================================================
// Kanka API — genel veri işlemleri (uygulamadaki db.list / insert / update / remove / upsert)
// Her işlem rules.php'deki kurallardan geçer.
// =========================================================

$PUSH = []; // yanıt gönderildikten sonra yapılacak telefon bildirimleri

function col_ok(string $t, string $c): string
{
    if (!in_array($c, columns($t), true)) fail("Geçersiz sütun: $c");
    return 't.`' . $c . '`';
}

/** Filtreler: { eq, neq, in: [col, values], gte, ilike, order: [col, asc], limit } */
function build_where(string $t, array $o, array &$p): string
{
    $w = [];
    $i = 0;
    foreach (($o['eq'] ?? []) as $c => $v) {
        $k = 'f' . $i++;
        if ($v === null) $w[] = col_ok($t, $c) . ' IS NULL';
        else {
            $w[] = col_ok($t, $c) . " = :$k";
            $p[$k] = in_val($c, $v);
        }
    }
    foreach (($o['neq'] ?? []) as $c => $v) {
        $k = 'f' . $i++;
        $w[] = col_ok($t, $c) . " <> :$k";
        $p[$k] = in_val($c, $v);
    }
    if (!empty($o['in']) && is_array($o['in']) && count($o['in']) === 2) {
        [$c, $vals] = $o['in'];
        $vals = array_slice(array_values((array) $vals), 0, 1000);
        if (!$vals) $w[] = '1=0';
        else {
            $ks = [];
            foreach ($vals as $v) {
                $k = 'f' . $i++;
                $ks[] = ":$k";
                $p[$k] = in_val($c, $v);
            }
            $w[] = col_ok($t, $c) . ' IN (' . implode(',', $ks) . ')';
        }
    }
    foreach (($o['gte'] ?? []) as $c => $v) {
        $k = 'f' . $i++;
        $w[] = col_ok($t, $c) . " >= :$k";
        $p[$k] = in_val($c, $v);
    }
    foreach (($o['ilike'] ?? []) as $c => $v) {
        $k = 'f' . $i++;
        $w[] = col_ok($t, $c) . " LIKE :$k";
        $p[$k] = '%' . addcslashes((string) $v, '%_\\') . '%';
    }
    return $w ? ' AND ' . implode(' AND ', $w) : '';
}

function op_list(string $t, array $o = []): array
{
    if ($t === 'call_config') return call_config();
    $read = rule_read($t);
    if ($read === null) fail(DENY);
    $p = [];
    $sql = "SELECT t.* FROM `$t` t WHERE ($read)" . build_where($t, $o, $p);
    if (!empty($o['order'][0])) $sql .= ' ORDER BY ' . col_ok($t, (string) $o['order'][0]) . (empty($o['order'][1]) ? ' DESC' : ' ASC');
    $lim = (int) ($o['limit'] ?? 0);
    $sql .= ' LIMIT ' . ($lim > 0 ? min($lim, 1000) : 1000);
    return array_map('out_row', q($sql, $p)->fetchAll());
}

function key_where(string $t, array $row, array &$p): string
{
    $w = [];
    foreach (pk($t) as $i => $c) {
        $w[] = "t.`$c` = :k$i";
        $p["k$i"] = $row[$c] ?? '';
    }
    return implode(' AND ', $w);
}
function raw_by_key(string $t, array $key): ?array
{
    $p = [];
    return q1("SELECT t.* FROM `$t` t WHERE " . key_where($t, $key, $p), $p);
}

function op_get(string $t, $id): ?array
{
    if (!is_string($id) || $id === '') return null;
    $r = op_list($t, ['eq' => ['id' => $id], 'limit' => 1]);
    return $r[0] ?? null;
}

function op_insert(string $t, array $row): ?array
{
    global $ME;
    need_auth();
    if (in_array($t, ['profiles', 'accounts', 'sessions', 'changes', 'signals', 'activity_days', 'login_attempts'], true)) fail(DENY);
    $cols = columns($t);
    $r = [];
    foreach ($row as $k => $v) if (in_array($k, $cols, true)) $r[$k] = in_val($k, $v);
    if (pk($t) === ['id'] && !is_uuid($r['id'] ?? null)) $r['id'] = uuid();
    if (in_array('created_at', $cols, true)) $r['created_at'] = now_db();
    foreach (['bio', 'caption', 'text'] as $c) if (in_array($c, $cols, true) && !isset($r[$c])) $r[$c] = '';
    if ($t === 'posts' || $t === 'stories') $r['meta'] = $r['meta'] ?? '{}';
    if ($t === 'highlights') $r['story_ids'] = $r['story_ids'] ?? '[]';
    rule_insert($t, $r);
    foreach ($r as $k => $v) if (!in_array($k, $cols, true)) unset($r[$k]);
    $ks = array_keys($r);
    $sql = "INSERT INTO `$t` (" . implode(',', array_map(fn($k) => "`$k`", $ks)) . ') VALUES (' . implode(',', array_map(fn($k) => ":$k", $ks)) . ')';
    try {
        q($sql, $r);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            if (str_contains($e->getMessage(), 'foreign key')) fail('Kayıt bulunamadı (silinmiş olabilir).');
            fail('duplicate key value violates unique constraint');
        }
        throw $e;
    }
    $new = raw_by_key($t, $r) ?? $r;
    after_write($t, 'INSERT', null, $new);
    return out_row($new);
}

function op_update(string $t, $id, array $patch): ?array
{
    need_auth();
    if (!is_string($id)) return null;
    $read = rule_read($t);
    if ($read === null) return null;
    $old = q1("SELECT t.* FROM `$t` t WHERE t.id = :id AND ($read)", ['id' => $id]);
    if (!$old) return null;
    return apply_update($t, $old, $patch);
}
function apply_update(string $t, array $old, array $patch): ?array
{
    $cols = columns($t);
    $new = $old;
    foreach ($patch as $k => $v) if (in_array($k, $cols, true)) $new[$k] = in_val($k, $v);
    if (!rule_update($t, $old, $new)) return null;
    $set = [];
    $p = [];
    foreach ($new as $k => $v) {
        if (!in_array($k, $cols, true) || in_array($k, pk($t), true)) continue;
        if ((string) ($old[$k] ?? "\0null") === (string) ($v ?? "\0null") && (($old[$k] === null) === ($v === null))) continue;
        $set[] = "`$k` = :s_$k";
        $p["s_$k"] = $v;
    }
    if ($set) {
        $w = [];
        foreach (pk($t) as $i => $c) {
            $w[] = "`$c` = :k$i";
            $p["k$i"] = $old[$c];
        }
        try {
            q("UPDATE `$t` SET " . implode(', ', $set) . ' WHERE ' . implode(' AND ', $w), $p);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail('duplicate key value violates unique constraint');
            throw $e;
        }
        $new = raw_by_key($t, $old) ?? $new;
        after_write($t, 'UPDATE', $old, $new);
    }
    return out_row($new);
}

function op_remove(string $t, array $match): void
{
    need_auth();
    if (!$match) fail('Silme için koşul gerekli');
    $read = rule_read($t);
    if ($read === null) return;
    $p = [];
    $rows = q("SELECT t.* FROM `$t` t WHERE ($read)" . build_where($t, ['eq' => $match], $p) . ' LIMIT 500', $p)->fetchAll();
    foreach ($rows as $o) {
        if (!rule_delete($t, $o)) continue;
        $w = [];
        $kp = [];
        foreach (pk($t) as $i => $c) {
            $w[] = "`$c` = :k$i";
            $kp["k$i"] = $o[$c];
        }
        if ($t === 'profiles') q('DELETE FROM accounts WHERE id = ?', [$o['id']]); // hesap da silinir (profil zincirle gider)
        else q("DELETE FROM `$t` WHERE " . implode(' AND ', $w), $kp);
        after_write($t, 'DELETE', $o, null);
    }
}

function op_upsert(string $t, array $row, ?string $onConflict): ?array
{
    need_auth();
    $keys = $onConflict ? array_map('trim', explode(',', $onConflict)) : pk($t);
    $read = rule_read($t);
    if ($read === null) fail(DENY);
    $p = [];
    $w = [];
    foreach ($keys as $i => $c) {
        $w[] = col_ok($t, $c) . " = :u$i";
        $p["u$i"] = in_val($c, $row[$c] ?? null);
    }
    $old = q1("SELECT t.* FROM `$t` t WHERE ($read) AND " . implode(' AND ', $w), $p);
    if ($old) return apply_update($t, $old, $row);
    return op_insert($t, $row);
}

/** Yazma sonrası: canlı güncelleme kaydı ve telefon bildirimleri. */
function after_write(string $t, string $ev, ?array $old, ?array $new): void
{
    global $PUSH;
    log_change($t, $new ?? $old, $ev);
    if ($ev === 'INSERT' && in_array($t, ['notifications', 'messages', 'calls', 'group_calls', 'lives'], true)) $PUSH[] = [$t, 'INSERT', $new];
    if ($ev === 'UPDATE' && $t === 'calls' && $old['status'] !== $new['status']) $PUSH[] = [$t, 'UPDATE', $new];
}

/** Sesli arama TURN bilgileri (sadece giriş yapmış kullanıcılara). */
function call_config(): array
{
    need_auth();
    $ice = cfg('turn_servers');
    return [['id' => 1, 'ice' => is_array($ice) ? $ice : []]];
}

/* ---------- Canlı güncelleme: değişiklikler ve sinyaller ---------- */
function op_poll(?int $after, array $tables): array
{
    need_auth();
    if (mt_rand(1, 50) === 1) {
        q('DELETE FROM changes WHERE created_at < UTC_TIMESTAMP(3) - INTERVAL 15 MINUTE');
        q('DELETE FROM signals WHERE created_at < UTC_TIMESTAMP(3) - INTERVAL 3 MINUTE');
    }
    if ($after === null) return ['last' => (int) qv('SELECT COALESCE(MAX(id), 0) FROM changes'), 'events' => []];
    $tables = array_values(array_intersect($tables, LIVE_TABLES));
    if (!$tables) return ['last' => $after, 'events' => []];
    $in = implode(',', array_map(fn($x) => db()->quote($x), $tables));
    $rows = q("SELECT * FROM changes WHERE id > ? AND tbl IN ($in) ORDER BY id LIMIT 300", [$after])->fetchAll();
    $last = $after;
    $out = [];
    foreach ($rows as $c) {
        $last = (int) $c['id'];
        $t = $c['tbl'];
        $data = json_decode((string) $c['data'], true) ?: [];
        if ($c['ev'] === 'DELETE') {
            // silinen satır: sadece ilgili kişilere anahtar alanlar
            if (!deleted_visible($t, $data)) continue;
            $out[] = ['table' => $t, 'ev' => 'DELETE', 'row' => out_row($data)];
            continue;
        }
        $read = rule_read($t);
        $p = [];
        $row = q1("SELECT t.* FROM `$t` t WHERE (" . $read . ') AND ' . key_where($t, $data, $p), $p);
        if ($row) $out[] = ['table' => $t, 'ev' => $c['ev'], 'row' => out_row($row)];
    }
    return ['last' => $last, 'events' => $out];
}
function deleted_visible(string $t, array $d): bool
{
    global $ME;
    if (isset($d['conversation_id'])) return is_member($d['conversation_id']);
    if ($t === 'calls') return in_array($ME, [$d['caller_id'] ?? '', $d['callee_id'] ?? ''], true);
    if ($t === 'message_reactions') {
        $cv = qv('SELECT conversation_id FROM messages WHERE id = ?', [$d['message_id'] ?? '']);
        return $cv ? is_member($cv) : false;
    }
    if ($t === 'notifications') return ($d['user_id'] ?? '') === $ME;
    return false;
}
function op_send(string $ch, string $ev, $payload): void
{
    global $ME;
    need_auth();
    if (!preg_match('/^[a-z]+-[0-9a-f-]{36}$/i', $ch)) fail('Geçersiz kanal');
    q('INSERT INTO signals (channel, sender, ev, payload, created_at) VALUES (?, ?, ?, ?, ?)', [$ch, $ME, substr($ev, 0, 20), json_encode($payload, JSON_UNESCAPED_UNICODE), now_db()]);
}
function op_recv(array $channels, ?int $after): array
{
    global $ME;
    need_auth();
    $channels = array_values(array_filter($channels, fn($c) => is_string($c) && preg_match('/^[a-z]+-[0-9a-f-]{36}$/i', $c)));
    if ($after === null) return ['last' => (int) qv('SELECT COALESCE(MAX(id), 0) FROM signals'), 'items' => []];
    if (!$channels) return ['last' => $after, 'items' => []];
    $in = implode(',', array_map(fn($x) => db()->quote($x), array_slice($channels, 0, 20)));
    $rows = q("SELECT id, channel, ev, payload FROM signals WHERE id > ? AND channel IN ($in) AND sender <> ? ORDER BY id LIMIT 200", [$after, $ME])->fetchAll();
    $last = $after;
    $items = [];
    foreach ($rows as $r) {
        $last = (int) $r['id'];
        $items[] = ['channel' => $r['channel'], 'ev' => $r['ev'], 'payload' => json_decode($r['payload'], true)];
    }
    return ['last' => $last, 'items' => $items];
}
