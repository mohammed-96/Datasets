<?php
// المزاد العائلي — single-file PHP version.
// Everything (routing, DB, HTML) lives in this one file on purpose: this is the
// "upload one file to cPanel and it just works" edition of the Next.js app.
// SQLite (pdo_sqlite) is used so no MySQL database needs to be created by hand.

declare(strict_types=1);
session_start();

// All times (auction start/end, soft-close extension, countdown) are handled in
// Riyadh local time so they match what the admin types and what bidders see,
// regardless of what timezone the hosting server is set to.
date_default_timezone_set('Asia/Riyadh');

const DB_FILE = __DIR__ . '/auction.db';
const UPLOAD_DIR = __DIR__ . '/uploads';
const ADMIN_PHONE = '0500000000';
const ADMIN_PIN = '998877';
// After a bid is accepted, the auction is locked for this many seconds: only the
// first bid in each window counts, any others that arrive during it are denied.
const BID_COOLDOWN_SECONDS = 3;
const CATEGORIES = ['GOLD' => 'ذهب', 'DIAMOND' => 'ألماس', 'WATCHES' => 'ساعات', 'JEWELRY' => 'مجوهرات', 'COLLECTIBLES' => 'مقتنيات', 'OTHER' => 'أخرى'];

// ---------------------------------------------------------------------------
// Serve uploaded images through PHP. This makes photos load in every setup —
// the PHP built-in server (which routes everything through this file), Apache,
// and installs in a subfolder — instead of depending on the web server to serve
// the uploads/ folder directly.
// ---------------------------------------------------------------------------
if (isset($_GET['media'])) {
    session_write_close();
    $name = basename((string)$_GET['media']); // strip any path components (no traversal)
    $path = UPLOAD_DIR . '/' . $name;
    $types = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif', 'svg' => 'image/svg+xml'];
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    if ($name !== '' && isset($types[$ext]) && is_file($path)) {
        header('Content-Type: ' . $types[$ext]);
        header('Cache-Control: public, max-age=86400');
        header('Content-Length: ' . filesize($path));
        readfile($path);
    } else {
        http_response_code(404);
    }
    exit;
}

// ---------------------------------------------------------------------------
// Database bootstrap
// ---------------------------------------------------------------------------

function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $isNew = !file_exists(DB_FILE);
    $pdo = new PDO('sqlite:' . DB_FILE);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('PRAGMA foreign_keys = ON');
    // Wait (up to 5s) for a competing write instead of erroring out. Combined with
    // BEGIN IMMEDIATE in place_bid(), this serializes concurrent bids so two people
    // can never both win the same price.
    $pdo->exec('PRAGMA busy_timeout = 5000');
    if ($isNew) {
        install_schema($pdo);
        seed($pdo);
    }
    return $pdo;
}

function install_schema(PDO $pdo): void {
    $pdo->exec("CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        real_name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        pin_hash TEXT NOT NULL,
        alias TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'bidder',
        status TEXT NOT NULL DEFAULT 'active',
        accepted_rules_at TEXT,
        created_at TEXT NOT NULL
    )");
    $pdo->exec("CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        weight_grams REAL,
        karat TEXT,
        condition_text TEXT,
        notes TEXT,
        category TEXT,
        internal_code TEXT,
        created_at TEXT NOT NULL
    )");
    $pdo->exec("CREATE TABLE item_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        url TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
    )");
    $pdo->exec("CREATE TABLE auctions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        opening_price INTEGER NOT NULL,
        current_price INTEGER NOT NULL,
        bid_increment INTEGER NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        original_end_at TEXT NOT NULL,
        soft_close_enabled INTEGER NOT NULL DEFAULT 1,
        extension_minutes INTEGER NOT NULL DEFAULT 2,
        status TEXT NOT NULL DEFAULT 'draft',
        winner_user_id INTEGER,
        winning_bid INTEGER,
        suspended_reason TEXT,
        created_at TEXT NOT NULL
    )");
    $pdo->exec("CREATE TABLE bids (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        auction_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL
    )");
    $pdo->exec("CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_user_id INTEGER,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        details TEXT,
        created_at TEXT NOT NULL
    )");
}

function seed(PDO $pdo): void {
    // Only the admin account is seeded. Add real bidders from admin -> المستخدمون,
    // and real items/auctions from admin -> القطع / المزادات.
    $pdo->prepare('INSERT INTO users (real_name, phone, pin_hash, alias, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        ->execute(['مدير المزاد', ADMIN_PHONE, password_hash(ADMIN_PIN, PASSWORD_DEFAULT), 'الإدارة', 'admin', 'active', now()]);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function now(): string { return date('Y-m-d H:i:s'); }
function h(?string $s): string { return htmlspecialchars($s ?? '', ENT_QUOTES, 'UTF-8'); }
function money(int $amount): string { return number_format($amount) . ' ريال'; }
function fmt_dt(string $sqlDateTime): string { return date('Y-m-d h:i A', strtotime($sqlDateTime)); }
function media_url(string $storedUrl): string { return 'index.php?media=' . rawurlencode(basename($storedUrl)); }

function csrf_token(): string {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    return $_SESSION['csrf'];
}
function csrf_field(): string { return '<input type="hidden" name="csrf" value="' . h(csrf_token()) . '">'; }
function csrf_check(): void {
    if (!hash_equals($_SESSION['csrf'] ?? '', $_POST['csrf'] ?? '')) {
        http_response_code(400);
        die('طلب غير صالح، الرجاء إعادة تحميل الصفحة والمحاولة مرة أخرى.');
    }
}

function redirect(string $to): never {
    header('Location: ' . $to);
    exit;
}

function current_user(): ?array {
    static $user = false;
    if ($user !== false) return $user;
    if (empty($_SESSION['user_id'])) return $user = null;
    $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || $row['status'] !== 'active') return $user = null;
    return $user = $row;
}

function require_login(): array {
    $u = current_user();
    if (!$u) redirect('index.php?page=login');
    return $u;
}

function require_admin(): array {
    $u = require_login();
    if ($u['role'] !== 'admin') redirect('index.php');
    return $u;
}

function write_audit(?int $actorId, string $action, string $entityType, ?int $entityId = null, ?string $details = null): void {
    db()->prepare('INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$actorId, $action, $entityType, $entityId, $details, now()]);
}

// ---------------------------------------------------------------------------
// Auction lifecycle: lazily advance UPCOMING -> LIVE -> ENDED on every read,
// since there's no cron/scheduler in a single-file shared-hosting app.
// ---------------------------------------------------------------------------

function sync_auction(array $auction): array {
    $nowTs = time();
    if ($auction['status'] === 'UPCOMING' && $nowTs >= strtotime($auction['start_at'])) {
        db()->prepare("UPDATE auctions SET status = 'LIVE' WHERE id = ? AND status = 'UPCOMING'")->execute([$auction['id']]);
        write_audit(null, 'auction_started', 'Auction', $auction['id']);
        $auction['status'] = 'LIVE';
    }
    if ($auction['status'] === 'LIVE' && $nowTs >= strtotime($auction['end_at'])) {
        $top = db()->prepare("SELECT * FROM bids WHERE auction_id = ? AND status = 'active' ORDER BY amount DESC, id ASC LIMIT 1");
        $top->execute([$auction['id']]);
        $topBid = $top->fetch(PDO::FETCH_ASSOC);
        $winnerId = $topBid['user_id'] ?? null;
        $winningBid = $topBid['amount'] ?? null;
        $res = db()->prepare("UPDATE auctions SET status = 'ENDED', winner_user_id = ?, winning_bid = ? WHERE id = ? AND status = 'LIVE'");
        $res->execute([$winnerId, $winningBid, $auction['id']]);
        if ($res->rowCount() > 0) {
            write_audit(null, 'auction_ended', 'Auction', $auction['id'], json_encode(['winner_user_id' => $winnerId, 'winning_bid' => $winningBid]));
        }
        $auction['status'] = 'ENDED';
        $auction['winner_user_id'] = $winnerId;
        $auction['winning_bid'] = $winningBid;
    }
    return $auction;
}

function get_auction(int $id): ?array {
    $stmt = db()->prepare('SELECT * FROM auctions WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ? sync_auction($row) : null;
}

function min_next_bid(array $auction, bool $hasBids): int {
    return $hasBids ? $auction['current_price'] + $auction['bid_increment'] : $auction['opening_price'];
}

function active_bids(int $auctionId): array {
    // Rank by amount so bids[0] is the true top bidder — the same rule the bid
    // engine uses. Ordering by created_at alone breaks when two bids share the
    // same second (only second precision is stored), which would show the wrong
    // person as the top bidder. id DESC is a deterministic final tiebreak.
    $stmt = db()->prepare("SELECT b.*, u.alias FROM bids b JOIN users u ON u.id = b.user_id WHERE b.auction_id = ? AND b.status = 'active' ORDER BY b.amount DESC, b.id DESC");
    $stmt->execute([$auctionId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

class BidError extends Exception {}
// Thrown when the user is already the top bidder. Not a real error — usually
// just a stale page from before an auto-refresh — so the caller refreshes
// quietly instead of showing an alarming message.
class AlreadyTopError extends BidError {}
// Thrown when the price moved before this bid landed (someone else got there
// first). The requested amount is no longer enough, so the caller just refreshes
// to the new price and shows the (now higher) bid button.
class StaleBidError extends BidError {}
// Thrown when a bid arrives during the few-second lock that follows an accepted
// bid. Only the first bid in each window is kept; the rest are denied.
class CooldownError extends BidError {}

function place_bid(int $userId, int $auctionId, int $amount): void {
    $pdo = db();
    // BEGIN IMMEDIATE takes the write lock right away, so two bids arriving at the
    // same time are processed one after the other — not both against the old price.
    // The second one then re-reads the updated price below and gets rejected.
    $pdo->exec('BEGIN IMMEDIATE');
    try {
        $stmt = $pdo->prepare('SELECT * FROM auctions WHERE id = ?');
        $stmt->execute([$auctionId]);
        $auction = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$auction) throw new BidError('المزاد غير موجود');

        $nowTs = time();
        if ($auction['status'] !== 'LIVE') throw new BidError('لا يمكن المزايدة، المزاد غير قائم حاليًا');
        if ($nowTs < strtotime($auction['start_at'])) throw new BidError('لم يبدأ المزاد بعد');
        if ($nowTs >= strtotime($auction['end_at'])) throw new BidError('انتهى المزاد');

        $top = $pdo->prepare("SELECT * FROM bids WHERE auction_id = ? AND status = 'active' ORDER BY amount DESC, id ASC LIMIT 1");
        $top->execute([$auctionId]);
        $topBid = $top->fetch(PDO::FETCH_ASSOC);

        if ($topBid && (int)$topBid['user_id'] === $userId) {
            throw new AlreadyTopError('أنت بالفعل أعلى مزايد على هذه القطعة');
        }

        // 3-second window: the highest bid is also the most recent accepted one
        // (amounts only ever go up). If it landed less than the window ago, this
        // bid loses the race and is denied.
        if ($topBid) {
            $sinceLast = $nowTs - strtotime($topBid['created_at']);
            if ($sinceLast < BID_COOLDOWN_SECONDS) {
                throw new CooldownError('تمت مزايدة قبل لحظات — انتظر ' . BID_COOLDOWN_SECONDS . ' ثوانٍ ثم أعد المزايدة');
            }
        }

        // The confirmed amount must exactly match the amount required right now.
        // If it differs (the price moved after the page was shown), the bid is
        // NOT approved — the bidder is told the new amount and can confirm again.
        $minNext = min_next_bid($auction, (bool)$topBid);
        if ($amount !== $minNext) {
            throw new StaleBidError('تغيّر السعر، لم تتم المزايدة. المبلغ المطلوب الآن ' . money($minNext) . ' — حدّث الصفحة وأعد المحاولة');
        }

        $newEndAt = $auction['end_at'];
        $extended = false;
        if ((int)$auction['soft_close_enabled'] === 1) {
            $extensionSeconds = (int)$auction['extension_minutes'] * 60;
            $msRemaining = strtotime($auction['end_at']) - $nowTs;
            if ($msRemaining <= $extensionSeconds) {
                $newEndAt = date('Y-m-d H:i:s', $nowTs + $extensionSeconds);
                $extended = true;
            }
        }

        $pdo->prepare('INSERT INTO bids (auction_id, user_id, amount, created_at) VALUES (?, ?, ?, ?)')
            ->execute([$auctionId, $userId, $amount, now()]);
        $pdo->prepare('UPDATE auctions SET current_price = ?, end_at = ? WHERE id = ?')
            ->execute([$amount, $newEndAt, $auctionId]);

        $pdo->exec('COMMIT');

        write_audit($userId, 'bid_placed', 'Auction', $auctionId, json_encode(['amount' => $amount]));
        if ($extended) write_audit($userId, 'auction_extended', 'Auction', $auctionId, json_encode(['new_end_at' => $newEndAt]));
    } catch (Exception $e) {
        try { $pdo->exec('ROLLBACK'); } catch (Exception $ignore) {}
        throw $e;
    }
}

// ---------------------------------------------------------------------------
// POST handlers (mutations run before any HTML is emitted, then redirect)
// ---------------------------------------------------------------------------

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action === 'login') {
        $phone = trim($_POST['phone'] ?? '');
        $pin = trim($_POST['pin'] ?? '');
        $stmt = db()->prepare('SELECT * FROM users WHERE phone = ?');
        $stmt->execute([$phone]);
        $u = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($u && $u['status'] === 'active' && password_verify($pin, $u['pin_hash'])) {
            session_regenerate_id(true);
            $_SESSION['user_id'] = $u['id'];
            // Return the visitor to the page they came from (e.g. the item they were
            // browsing as a guest). Only same-file paths are allowed, never an
            // external URL, so this can't be used to redirect somewhere else.
            $next = (string)($_POST['next'] ?? '');
            if ($next !== '' && str_starts_with($next, 'index.php?') && !str_contains($next, "\n")) {
                redirect($next);
            }
            redirect($u['role'] === 'admin' ? 'index.php?page=admin' : 'index.php');
        }
        redirect('index.php?page=login&error=' . urlencode('رقم الجوال أو الرقم السري غير صحيح'));
    }

    if ($action === 'logout') {
        $_SESSION = [];
        session_destroy();
        redirect('index.php?page=login');
    }

    csrf_check();
    $user = require_login();

    if ($action === 'accept_rules') {
        db()->prepare('UPDATE users SET accepted_rules_at = ? WHERE id = ?')->execute([now(), $user['id']]);
        write_audit($user['id'], 'rules_accepted', 'User', $user['id']);
        redirect($_POST['next'] ?? 'index.php');
    }

    if ($action === 'bid') {
        $auctionId = (int)$_POST['auction_id'];
        if (!$user['accepted_rules_at']) redirect('index.php?page=rules&next=' . urlencode('index.php?page=item&id=' . $auctionId));
        // The exact amount the bidder saw and confirmed on screen. place_bid only
        // accepts it if it still equals the current required amount — so a bid is
        // never placed at a different number than the one shown in the dialog.
        $amount = (int)($_POST['amount'] ?? 0);
        try {
            place_bid((int)$user['id'], $auctionId, $amount);
        } catch (AlreadyTopError $e) {
            // You were already winning — nothing to do, just refresh to the truth.
            redirect('index.php?page=item&id=' . $auctionId);
        } catch (BidError $e) {
            // bid=no marks a rejected bid so the page can sound the rejection tone.
            redirect('index.php?page=item&id=' . $auctionId . '&bid=no&error=' . urlencode($e->getMessage()));
        }
        // bid=ok marks an approved bid so the page can sound the approval tone.
        redirect('index.php?page=item&id=' . $auctionId . '&bid=ok');
    }

    // ---- Admin mutations ----
    if (str_starts_with($action, 'admin_')) {
        require_admin();
    }

    if ($action === 'admin_user_create') {
        $realName = trim($_POST['real_name']);
        $phone = trim($_POST['phone']);
        $alias = trim($_POST['alias']);
        $pin = trim($_POST['pin']);
        if ($realName === '' || $phone === '' || $alias === '' || strlen($pin) < 4) {
            redirect('index.php?page=admin_user_new&error=' . urlencode('الرجاء تعبئة جميع الحقول (رقم سري 4 أرقام على الأقل)'));
        }
        $dup = db()->prepare('SELECT id FROM users WHERE phone = ? OR alias = ?');
        $dup->execute([$phone, $alias]);
        if ($dup->fetch()) redirect('index.php?page=admin_user_new&error=' . urlencode('رقم الجوال أو المعرف مستخدم بالفعل'));
        db()->prepare('INSERT INTO users (real_name, phone, pin_hash, alias, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([$realName, $phone, password_hash($pin, PASSWORD_DEFAULT), $alias, 'bidder', 'active', now()]);
        write_audit($user['id'], 'user_created', 'User', (int)db()->lastInsertId(), json_encode(['alias' => $alias]));
        redirect('index.php?page=admin_users');
    }

    if ($action === 'admin_user_update') {
        $id = (int)$_POST['id'];
        $realName = trim($_POST['real_name']);
        $phone = trim($_POST['phone']);
        $alias = trim($_POST['alias']);
        $pin = trim($_POST['pin'] ?? '');
        if ($realName === '' || $phone === '' || $alias === '') {
            redirect('index.php?page=admin_user_edit&id=' . $id . '&error=' . urlencode('جميع الحقول الأساسية مطلوبة'));
        }
        $dup = db()->prepare('SELECT id FROM users WHERE (phone = ? OR alias = ?) AND id != ?');
        $dup->execute([$phone, $alias, $id]);
        if ($dup->fetch()) redirect('index.php?page=admin_user_edit&id=' . $id . '&error=' . urlencode('رقم الجوال أو المعرف مستخدم من قبل آخر'));
        if ($pin !== '') {
            if (strlen($pin) < 4) redirect('index.php?page=admin_user_edit&id=' . $id . '&error=' . urlencode('الرقم السري يجب ألا يقل عن 4 أرقام'));
            db()->prepare('UPDATE users SET real_name=?, phone=?, alias=?, pin_hash=? WHERE id=?')
                ->execute([$realName, $phone, $alias, password_hash($pin, PASSWORD_DEFAULT), $id]);
        } else {
            db()->prepare('UPDATE users SET real_name=?, phone=?, alias=? WHERE id=?')->execute([$realName, $phone, $alias, $id]);
        }
        write_audit($user['id'], $pin !== '' ? 'user_updated_pin_reset' : 'user_updated', 'User', $id);
        redirect('index.php?page=admin_users');
    }

    if ($action === 'admin_user_toggle') {
        $id = (int)$_POST['id'];
        $stmt = db()->prepare('SELECT status FROM users WHERE id = ?');
        $stmt->execute([$id]);
        $current = $stmt->fetchColumn();
        $new = $current === 'active' ? 'disabled' : 'active';
        db()->prepare('UPDATE users SET status = ? WHERE id = ?')->execute([$new, $id]);
        write_audit($user['id'], $new === 'active' ? 'user_enabled' : 'user_disabled', 'User', $id);
        redirect('index.php?page=admin_users');
    }

    if ($action === 'admin_item_save') {
        $id = isset($_POST['id']) && $_POST['id'] !== '' ? (int)$_POST['id'] : null;
        $title = trim($_POST['title']);
        if ($title === '') redirect('index.php?page=' . ($id ? 'admin_item_edit&id=' . $id : 'admin_item_new') . '&error=' . urlencode('اسم القطعة مطلوب'));
        $fields = [
            trim($_POST['description'] ?? '') ?: null,
            $_POST['weight_grams'] !== '' ? (float)$_POST['weight_grams'] : null,
            trim($_POST['karat'] ?? '') ?: null,
            trim($_POST['condition_text'] ?? '') ?: null,
            trim($_POST['notes'] ?? '') ?: null,
            array_key_exists($_POST['category'] ?? '', CATEGORIES) ? $_POST['category'] : null,
            trim($_POST['internal_code'] ?? '') ?: null,
        ];
        if ($id) {
            db()->prepare('UPDATE items SET title=?, description=?, weight_grams=?, karat=?, condition_text=?, notes=?, category=?, internal_code=? WHERE id=?')
                ->execute([$title, ...$fields, $id]);
            write_audit($user['id'], 'item_updated', 'Item', $id);
        } else {
            db()->prepare('INSERT INTO items (title, description, weight_grams, karat, condition_text, notes, category, internal_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$title, ...$fields, now()]);
            $id = (int)db()->lastInsertId();
            write_audit($user['id'], 'item_created', 'Item', $id, json_encode(['title' => $title]));
        }
        $uploadErrors = [];
        if (!empty($_FILES['images']['name'][0])) {
            // Make sure the uploads folder exists and is writable (cPanel users
            // sometimes forget to create it, or create it read-only).
            if (!is_dir(UPLOAD_DIR)) @mkdir(UPLOAD_DIR, 0775, true);
            $allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'];
            $sortBase = (int)db()->query('SELECT COUNT(*) FROM item_images WHERE item_id = ' . $id)->fetchColumn();
            foreach ($_FILES['images']['tmp_name'] as $i => $tmp) {
                $origName = $_FILES['images']['name'][$i] ?? '';
                if ($origName === '') continue;
                $err = $_FILES['images']['error'][$i] ?? UPLOAD_ERR_OK;
                if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) {
                    $uploadErrors[] = $origName . ': حجم الصورة أكبر من الحد المسموح على الخادم';
                    continue;
                }
                if ($err !== UPLOAD_ERR_OK || !is_uploaded_file($tmp)) {
                    $uploadErrors[] = $origName . ': تعذّر رفع الصورة';
                    continue;
                }
                $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
                if (!in_array($ext, $allowed, true)) {
                    $uploadErrors[] = $origName . ': نوع غير مدعوم (استخدم JPG أو PNG — صور آيفون بصيغة HEIC غير مدعومة)';
                    continue;
                }
                if (!is_writable(UPLOAD_DIR)) {
                    $uploadErrors[] = 'مجلد uploads غير قابل للكتابة — عدّل صلاحياته إلى 755 من مدير الملفات';
                    break;
                }
                $filename = uniqid('item' . $id . '_') . '.' . $ext;
                if (@move_uploaded_file($tmp, UPLOAD_DIR . '/' . $filename)) {
                    db()->prepare('INSERT INTO item_images (item_id, url, sort_order) VALUES (?, ?, ?)')
                        ->execute([$id, 'uploads/' . $filename, $sortBase + $i]);
                } else {
                    $uploadErrors[] = $origName . ': تعذّر حفظ الصورة (تحقق من صلاحيات مجلد uploads)';
                }
            }
        }
        redirect('index.php?page=admin_item_edit&id=' . $id . ($uploadErrors ? '&error=' . urlencode(implode(' • ', $uploadErrors)) : ''));
    }

    if ($action === 'admin_image_delete') {
        $imgId = (int)$_POST['id'];
        $stmt = db()->prepare('SELECT * FROM item_images WHERE id = ?');
        $stmt->execute([$imgId]);
        $img = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($img) {
            @unlink(__DIR__ . '/' . $img['url']);
            db()->prepare('DELETE FROM item_images WHERE id = ?')->execute([$imgId]);
            write_audit($user['id'], 'item_image_removed', 'Item', (int)$img['item_id']);
            redirect('index.php?page=admin_item_edit&id=' . $img['item_id']);
        }
        redirect('index.php?page=admin_items');
    }

    if ($action === 'admin_auction_save') {
        $id = isset($_POST['id']) && $_POST['id'] !== '' ? (int)$_POST['id'] : null;
        $itemId = (int)$_POST['item_id'];
        $opening = (int)$_POST['opening_price'];
        $increment = (int)$_POST['bid_increment'];
        $startAt = str_replace('T', ' ', $_POST['start_at']) . ':00';
        $endAt = str_replace('T', ' ', $_POST['end_at']) . ':00';
        $soft = isset($_POST['soft_close_enabled']) ? 1 : 0;
        $extMinutes = max(1, (int)$_POST['extension_minutes']);

        if ($opening <= 0 || $increment <= 0 || strtotime($endAt) <= strtotime($startAt)) {
            redirect('index.php?page=' . ($id ? 'admin_auction_edit&id=' . $id : 'admin_auction_new&item_id=' . $itemId) . '&error=' . urlencode('بيانات غير صحيحة'));
        }

        if ($id) {
            $stmt = db()->prepare('SELECT status FROM auctions WHERE id = ?');
            $stmt->execute([$id]);
            $status = $stmt->fetchColumn();
            if (!in_array($status, ['DRAFT', 'UPCOMING'], true)) {
                redirect('index.php?page=admin_auction_edit&id=' . $id . '&error=' . urlencode('لا يمكن تعديل مزاد قائم أو منتهٍ'));
            }
            db()->prepare('UPDATE auctions SET opening_price=?, current_price=?, bid_increment=?, start_at=?, end_at=?, original_end_at=?, soft_close_enabled=?, extension_minutes=? WHERE id=?')
                ->execute([$opening, $opening, $increment, $startAt, $endAt, $endAt, $soft, $extMinutes, $id]);
            write_audit($user['id'], 'auction_edited', 'Auction', $id);
        } else {
            $existing = db()->prepare("SELECT id FROM auctions WHERE item_id = ? AND status IN ('DRAFT','UPCOMING','LIVE')");
            $existing->execute([$itemId]);
            if ($existing->fetch()) {
                redirect('index.php?page=admin_auction_new&item_id=' . $itemId . '&error=' . urlencode('توجد بالفعل مزاد نشط أو مسودة لهذه القطعة'));
            }
            db()->prepare('INSERT INTO auctions (item_id, opening_price, current_price, bid_increment, start_at, end_at, original_end_at, soft_close_enabled, extension_minutes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$itemId, $opening, $opening, $increment, $startAt, $endAt, $endAt, $soft, $extMinutes, 'DRAFT', now()]);
            $id = (int)db()->lastInsertId();
            write_audit($user['id'], 'auction_created', 'Auction', $id, json_encode(['item_id' => $itemId]));
        }
        redirect('index.php?page=admin_auction_edit&id=' . $id);
    }

    if (in_array($action, ['admin_auction_publish', 'admin_auction_cancel', 'admin_auction_suspend', 'admin_auction_resume'], true)) {
        $id = (int)$_POST['id'];
        $stmt = db()->prepare('SELECT * FROM auctions WHERE id = ?');
        $stmt->execute([$id]);
        $auction = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($auction) {
            if ($action === 'admin_auction_publish' && $auction['status'] === 'DRAFT') {
                db()->prepare("UPDATE auctions SET status = 'UPCOMING' WHERE id = ?")->execute([$id]);
                write_audit($user['id'], 'auction_published', 'Auction', $id);
            } elseif ($action === 'admin_auction_cancel' && !in_array($auction['status'], ['ENDED', 'CANCELLED'], true)) {
                db()->prepare("UPDATE auctions SET status = 'CANCELLED' WHERE id = ?")->execute([$id]);
                write_audit($user['id'], 'auction_cancelled', 'Auction', $id);
            } elseif ($action === 'admin_auction_suspend' && $auction['status'] === 'LIVE') {
                $reason = trim($_POST['reason'] ?? '') ?: null;
                db()->prepare("UPDATE auctions SET status = 'SUSPENDED', suspended_reason = ? WHERE id = ?")->execute([$reason, $id]);
                write_audit($user['id'], 'auction_suspended', 'Auction', $id, $reason ? json_encode(['reason' => $reason]) : null);
            } elseif ($action === 'admin_auction_resume' && $auction['status'] === 'SUSPENDED') {
                $newEndAtRaw = trim($_POST['new_end_at'] ?? '');
                $newEndAt = $newEndAtRaw !== '' ? str_replace('T', ' ', $newEndAtRaw) . ':00' : $auction['end_at'];
                $newStatus = time() >= strtotime($auction['start_at']) ? 'LIVE' : 'UPCOMING';
                db()->prepare('UPDATE auctions SET status = ?, end_at = ?, suspended_reason = NULL WHERE id = ?')->execute([$newStatus, $newEndAt, $id]);
                write_audit($user['id'], 'auction_resumed', 'Auction', $id, json_encode(['new_end_at' => $newEndAt]));
            }
        }
        redirect('index.php?page=admin_auction_edit&id=' . $id);
    }
}

// ---------------------------------------------------------------------------
// AJAX polling endpoint — bypasses HTML rendering entirely
// ---------------------------------------------------------------------------

if (isset($_GET['ajax']) && $_GET['ajax'] === 'status') {
    $me = current_user();
    header('Content-Type: application/json; charset=utf-8');
    // Safari caches identical fetch() GETs aggressively; force it to always ask.
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');
    // Guests get the same live price/bid feed as members — they just have no
    // "mine"/"top bidder" state, since those need an account.
    $myId = $me ? (int)$me['id'] : 0;
    $auction = get_auction((int)($_GET['id'] ?? 0));
    if (!$auction) { http_response_code(404); echo json_encode(['error' => 'not_found']); exit; }
    $bids = active_bids((int)$auction['id']);
    $hasBids = count($bids) > 0;
    $topBid = $bids[0] ?? null;
    echo json_encode([
        'status' => $auction['status'],
        'current_price' => (int)$auction['current_price'],
        'end_at' => $auction['end_at'],
        'min_next_bid' => min_next_bid($auction, $hasBids),
        'is_top_bidder' => $topBid && (int)$topBid['user_id'] === $myId,
        'has_user_bid' => (bool)array_filter($bids, fn($b) => (int)$b['user_id'] === $myId),
        'winner_alias' => null,
        'winning_bid' => $auction['winning_bid'] ? (int)$auction['winning_bid'] : null,
        'bids' => array_map(fn($b) => ['alias' => $b['alias'], 'amount' => (int)$b['amount'], 'time' => date('h:i A', strtotime($b['created_at'])), 'is_mine' => (int)$b['user_id'] === $myId], $bids),
    ]);
    exit;
}

// ---------------------------------------------------------------------------
// Page rendering
// ---------------------------------------------------------------------------

function layout_start(string $title, ?array $user): void {
    ?><!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f5f5f7">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="مزاد الذكريات">
<meta name="description" content="مزاد الذكريات — كل قطعةٍ تروي قصة، وكل قصةٍ تحفظ أثرًا.">
<title><?= h($title) ?> — مزاد الذكريات</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<?php
// Loaded without blocking the first paint: the page renders immediately in the
// system Arabic face (SF Arabic on iPhone, which is already handsome) and swaps
// to Amiri / IBM Plex once they arrive. On a weak connection the site still shows
// instantly instead of waiting on a font server.
$fontsHref = 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap';
?>
<link rel="stylesheet" href="<?= h($fontsHref) ?>" media="print" onload="this.media='all';this.onload=null">
<noscript><link rel="stylesheet" href="<?= h($fontsHref) ?>"></noscript>
<style>
  :root {
    --ink: #1d1d1f;          /* primary text */
    --muted: #6e6e73;        /* secondary text */
    --bg: #f5f5f7;           /* page background */
    --surface: #ffffff;      /* cards */
    --line: rgba(0,0,0,.09); /* hairlines */
    --gold: #9c7c3c;         /* accent — the one colour that carries the brand */
    --gold-dark: #866832;
    --radius: 20px;
    --shadow: 0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.05);
    /* Amiri (classical Naskh) carries the name and headings the way an auction
       house wordmark would; IBM Plex Sans Arabic keeps the interface crisp on
       small screens. Both fall back to iOS's own SF Arabic if they don't load. */
    --font-display: 'Amiri', 'SF Arabic', Georgia, serif;
    --font-ui: 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, 'SF Arabic', 'Segoe UI', Tahoma, sans-serif;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    font-family: var(--font-ui);
    margin: 0; background: var(--bg); color: var(--ink);
    -webkit-font-smoothing: antialiased; line-height: 1.6;
  }
  a { color: inherit; text-decoration: none; }
  h1 { font-family: var(--font-display); font-size: 32px; font-weight: 700; margin: 0 0 4px; line-height: 1.35; }
  h2 { font-family: var(--font-display); font-size: 25px; font-weight: 700; margin: 30px 0 12px; line-height: 1.4; }
  h3 { font-size: 17px; font-weight: 600; letter-spacing: -.01em; }

  /* Frosted, sticky header — the Apple signature */
  header {
    position: sticky; top: 0; z-index: 50;
    background: rgba(250,250,252,.82);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    backdrop-filter: saturate(180%) blur(20px);
    border-bottom: 1px solid var(--line);
    padding: 11px 20px; display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 10px;
  }
  header .brand { font-family: var(--font-display); font-weight: 700; font-size: 21px; letter-spacing: .01em; }
  .header-actions { display: flex; align-items: center; gap: 14px; }
  .hlink { font-size: 14px; color: var(--muted); transition: color .2s; }
  .hlink:hover { color: var(--ink); }

  nav { display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 20px 0; max-width: 1040px; margin: 0 auto; }
  nav a, nav button {
    background: rgba(0,0,0,.04); border: none; border-radius: 980px; padding: 7px 15px;
    font-size: 13.5px; font-weight: 500; color: var(--ink); cursor: pointer; transition: background .2s;
  }
  nav a:hover { background: rgba(0,0,0,.08); }
  nav a.active { background: var(--gold); color: #fff; }

  main { max-width: 1040px; margin: 0 auto; padding: 24px 20px 40px; }

  .card {
    background: var(--surface); border-radius: var(--radius); padding: 24px;
    margin-bottom: 18px; box-shadow: var(--shadow);
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 16px; }

  .item-card {
    display: block; background: var(--surface); border-radius: 18px; overflow: hidden;
    box-shadow: var(--shadow); transition: transform .25s cubic-bezier(.2,.8,.3,1), box-shadow .25s;
  }
  .item-card:hover { transform: translateY(-3px); box-shadow: 0 2px 4px rgba(0,0,0,.05), 0 16px 36px rgba(0,0,0,.09); }
  .item-card img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background: #ececee; }
  .item-card .body { padding: 14px 15px 16px; }
  .item-card h3 { margin: 7px 0 3px; font-size: 15px; font-weight: 600; }

  .badge {
    display: inline-block; padding: 3px 10px; border-radius: 980px;
    font-size: 11px; font-weight: 600; letter-spacing: .01em;
  }
  .badge.live { background: rgba(48,209,88,.14); color: #1a7f37; }
  .badge.upcoming { background: rgba(0,113,227,.12); color: #0058b0; }
  .badge.ended { background: rgba(0,0,0,.06); color: var(--muted); }
  .badge.cancelled, .badge.suspended { background: rgba(255,59,48,.12); color: #c0271d; }
  .user-pill {
    display: inline-block; padding: 4px 12px; border-radius: 980px; font-size: 13px;
    font-weight: 550; background: rgba(156,124,60,.13); color: var(--gold-dark);
  }

  label { display: block; font-weight: 550; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
  input[type=text], input[type=tel], input[type=password], input[type=number], input[type=datetime-local], textarea, select {
    width: 100%; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px;
    font-size: 16px; /* 16px keeps iOS from zooming on focus */
    margin-bottom: 16px; font-family: inherit; background: #fff; color: var(--ink);
    transition: border-color .2s, box-shadow .2s;
  }
  input:focus, textarea:focus, select:focus {
    outline: none; border-color: var(--gold); box-shadow: 0 0 0 4px rgba(156,124,60,.13);
  }

  button, .btn {
    display: inline-block; background: var(--gold); color: #fff; border: none; border-radius: 14px;
    padding: 13px 22px; font-size: 15.5px; font-weight: 600; font-family: inherit; cursor: pointer;
    letter-spacing: -.01em; transition: background .2s, transform .12s, opacity .2s;
  }
  button:hover, .btn:hover { background: var(--gold-dark); }
  button:active, .btn:active { transform: scale(.975); }
  button:disabled { background: rgba(0,0,0,.08) !important; color: var(--muted); cursor: default; transform: none; }
  .btn.secondary { background: rgba(0,0,0,.05); color: var(--ink); }
  .btn.secondary:hover { background: rgba(0,0,0,.09); }
  .btn.danger { background: rgba(255,59,48,.1); color: #c0271d; }
  .btn.danger:hover { background: rgba(255,59,48,.16); }
  .btn-sm { padding: 8px 16px; font-size: 14px; border-radius: 980px; }

  table { width: 100%; border-collapse: collapse; font-size: 14.5px; }
  table th {
    padding: 10px; text-align: right; font-weight: 550; font-size: 12.5px;
    color: var(--muted); border-bottom: 1px solid var(--line);
  }
  table td { padding: 12px 10px; text-align: right; border-top: 1px solid var(--line); }
  table td:nth-child(2) { font-variant-numeric: tabular-nums; }

  .error {
    background: rgba(255,59,48,.1); color: #c0271d; padding: 13px 16px;
    border-radius: 14px; margin-bottom: 18px; font-size: 14.5px; font-weight: 500;
  }
  .success-box {
    background: rgba(48,209,88,.13); color: #1a7f37; padding: 20px;
    border-radius: 16px; text-align: center; font-size: 16px;
  }
  .muted { color: var(--muted); font-size: 13.5px; }
  .price {
    font-size: 42px; font-weight: 680; letter-spacing: -.03em;
    font-variant-numeric: tabular-nums; line-height: 1.15;
  }
  .thumbs { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .thumbs img { width: 64px; height: 64px; object-fit: cover; border-radius: 10px; box-shadow: var(--shadow); }

  /* Image gallery — swiping is handled natively by CSS scroll-snap, which is
     what feels right on iPhone; the dots and thumbnails just follow along. */
  .gallery { position: relative; }
  .gal-track {
    display: flex; overflow-x: auto; scroll-snap-type: x mandatory;
    border-radius: 16px; background: #ececee; -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .gal-track::-webkit-scrollbar { display: none; }
  .gal-track img {
    flex: 0 0 100%; width: 100%; aspect-ratio: 1; object-fit: cover;
    scroll-snap-align: center; display: block;
  }
  .gal-dots { display: flex; gap: 6px; justify-content: center; margin-top: 12px; }
  .gal-dots span {
    width: 6px; height: 6px; border-radius: 50%; background: rgba(0,0,0,.16);
    transition: width .25s, background .25s;
  }
  .gal-dots span.on { background: var(--gold); width: 20px; border-radius: 3px; }
  .thumbs img { cursor: pointer; opacity: .55; transition: opacity .2s, box-shadow .2s; }
  .thumbs img.on { opacity: 1; box-shadow: 0 0 0 2px var(--gold); }

  /* Hero — the story-first opening an auction house leads with */
  .hero { text-align: center; padding: 40px 4px 8px; }
  .hero .kicker {
    font-size: 10.5px; letter-spacing: .34em; color: var(--gold-dark);
    font-weight: 600; margin-bottom: 14px;
  }
  .hero h1 { font-size: 46px; line-height: 1.25; margin-bottom: 10px; }
  .hero .tagline {
    font-family: var(--font-display); font-size: 20px; color: var(--gold-dark);
    line-height: 1.75; margin: 0 auto; max-width: 460px;
  }
  .hero .lede {
    max-width: 580px; margin: 18px auto 0; color: var(--muted);
    font-size: 15px; line-height: 2;
  }
  .rule {
    width: 54px; height: 1px; background: var(--gold); opacity: .5;
    margin: 22px auto; border: 0;
  }
  .chip {
    display: inline-block; padding: 9px 18px; border-radius: 980px;
    background: rgba(156,124,60,.11); color: var(--gold-dark);
    font-size: 13.5px; font-weight: 500; line-height: 1.5;
  }
  .hero-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 22px; }

  /* Section heading with a quiet subtitle beside it */
  .section-head { margin: 38px 0 14px; }
  .section-head h2 { margin: 0; }
  .section-head .sub { color: var(--muted); font-size: 13.5px; margin-top: 2px; }

  .story p { font-size: 15.5px; line-height: 2.1; color: #3a3a3d; margin: 0 0 16px; }
  .story ul { padding-inline-start: 20px; margin: 0 0 16px; color: #3a3a3d; line-height: 2.1; font-size: 15.5px; }
  .story .pull {
    font-family: var(--font-display); font-size: 21px; line-height: 1.85;
    color: var(--gold-dark); text-align: center; margin: 26px 0; padding: 0 10px;
  }

  /* Guest banner — invites sign-in without nagging */
  .guest-note {
    background: var(--surface); border-radius: 16px; padding: 14px 18px; margin-bottom: 18px;
    box-shadow: var(--shadow); display: flex; align-items: center; justify-content: space-between;
    gap: 14px; flex-wrap: wrap; font-size: 14.5px;
  }

  footer {
    max-width: 1040px; margin: 0 auto; padding: 38px 20px 34px;
    text-align: center; border-top: 1px solid var(--line);
  }
  footer .fbrand { font-family: var(--font-display); font-size: 19px; font-weight: 700; }
  footer .fline { font-size: 13px; color: var(--muted); margin-top: 4px; }
  footer .flinks { margin-top: 14px; display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; }
  footer .flinks a { font-size: 13.5px; color: var(--muted); }
  footer .flinks a:hover { color: var(--ink); }
  footer .sig { margin-top: 20px; font-size: 10.5px; color: #a1a1a6; letter-spacing: .04em; }

  /* Phones first — this is where nearly all the bidding happens */
  @media (max-width: 500px) {
    h1 { font-size: 27px; }
    h2 { font-size: 22px; }
    main { padding: 18px 16px 32px; }
    .card { padding: 20px; border-radius: 18px; }
    .price { font-size: 38px; }
    .grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 13px; }
    .hero { padding: 26px 2px 4px; }
    .hero h1 { font-size: 36px; }
    .hero .tagline { font-size: 17.5px; }
    .hero .lede { font-size: 14.5px; line-height: 1.95; }
    .story p, .story ul { font-size: 15px; line-height: 2; }
    .story .pull { font-size: 18.5px; }
    header { padding: 10px 16px; }
    header .brand { font-size: 19px; }
  }
</style>
</head>
<body>
<?php
    $onLoginPage = ($_GET['page'] ?? '') === 'login';
    // Send a guest back to the item they were viewing after they sign in.
    $loginHref = 'index.php?page=login';
    if (($_GET['page'] ?? '') === 'item' && !empty($_GET['id'])) {
        $loginHref .= '&next=' . urlencode('index.php?page=item&id=' . (int)$_GET['id']);
    }
?>
<?php if (!$onLoginPage): ?>
<header>
  <a class="brand" href="index.php">مزاد الذكريات</a>
  <div class="header-actions">
    <?php if ($user): ?>
      <?php if ($user['role'] === 'admin'): ?><a class="hlink" href="index.php?page=admin">لوحة الإدارة</a><?php endif; ?>
      <a class="hlink" href="index.php?page=my_bids">مزايداتي</a>
      <span class="user-pill"><?= h($user['alias']) ?></span>
      <form method="post" style="margin:0"><input type="hidden" name="action" value="logout"><button class="btn secondary btn-sm" type="submit">خروج</button></form>
    <?php else: ?>
      <a class="hlink" href="index.php?page=about">قصة المزاد</a>
      <a class="btn btn-sm" href="<?= h($loginHref) ?>">تسجيل الدخول</a>
    <?php endif; ?>
  </div>
</header>
<?php endif; ?>
<?php if ($user && $user['role'] === 'admin'): ?>
<nav>
  <a href="index.php?page=admin">لوحة التحكم</a>
  <a href="index.php?page=admin_items">القطع</a>
  <a href="index.php?page=admin_auctions">المزادات</a>
  <a href="index.php?page=admin_users">المستخدمون</a>
  <a href="index.php?page=admin_results">النتائج</a>
  <a href="index.php?page=admin_audit">سجل العمليات</a>
</nav>
<?php endif; ?>
<main>
<?php
    if (!empty($_GET['error'])) echo '<div class="error">' . h($_GET['error']) . '</div>';
}

function layout_end(): void { ?>
</main>
<footer>
  <div class="fbrand">مزاد الذكريات</div>
  <div class="fline">كل قطعةٍ تروي قصة... وكل قصةٍ تحفظ أثرًا</div>
  <div class="flinks">
    <a href="index.php">المقتنيات</a>
    <a href="index.php?page=about">قصة المزاد</a>
    <a href="index.php?page=rules">قواعد المزاد</a>
  </div>
  <div class="sig">مدار البيان</div>
</footer>
<script>
/* Audible bid feedback — a soft chime plus a spoken result, so an approved or
   rejected bid is unmistakable even without reading the screen. Sound is
   generated in the browser (no audio files to upload). */
(function () {
  var ctx = null;
  function unlock() {                     // must run inside a tap to satisfy iOS
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
  }
  function tone(freq, startAt, dur, peak) {
    if (!ctx) return;
    var osc = ctx.createOscillator(), gain = ctx.createGain(), t = ctx.currentTime + startAt;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);                        // soft attack/decay
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.03);     // keeps it gentle,
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);    // never a harsh beep
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  function say(text) {
    try {
      if (!window.speechSynthesis) return;
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'ar-SA'; u.rate = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  function feedback(ok) {
    unlock();
    if (ok) { tone(784, 0, .18, .16); tone(1175, .13, .28, .14); say('تمت المزايدة'); }
    else    { tone(320, 0, .2, .16);  tone(200, .16, .32, .15);  say('لم تتم المزايدة'); }
  }
  window.__bidFeedback = feedback;
  window.__unlockAudio = unlock;

  // Sound the result carried in the URL after a normal (non-JS) form post.
  var m = location.search.match(/[?&]bid=(ok|no)\b/);
  if (m) {
    var ok = m[1] === 'ok';
    document.addEventListener('click', function once() {   // fallback if autoplay is blocked
      document.removeEventListener('click', once);
    });
    setTimeout(function () { feedback(ok); }, 120);
  }

  // Image gallery: tap a thumbnail to jump, swipe to browse. The active slide is
  // found by whichever image sits closest to the track's centre, which works the
  // same in RTL as in LTR (no scrollLeft maths, which differs across browsers).
  var track = document.getElementById('gal-track');
  if (track) {
    var slides = Array.prototype.slice.call(track.querySelectorAll('img'));
    var dots = Array.prototype.slice.call(document.querySelectorAll('#gal-dots span'));
    var thumbs = Array.prototype.slice.call(document.querySelectorAll('#gal-thumbs img'));
    function activeIndex() {
      var mid = track.getBoundingClientRect().left + track.clientWidth / 2, best = 0, min = Infinity;
      slides.forEach(function (s, i) {
        var r = s.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - mid);
        if (d < min) { min = d; best = i; }
      });
      return best;
    }
    function sync() {
      var i = activeIndex();
      dots.forEach(function (d, n) { d.className = n === i ? 'on' : ''; });
      thumbs.forEach(function (t, n) { t.className = n === i ? 'on' : ''; });
    }
    var raf;
    track.addEventListener('scroll', function () {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    }, { passive: true });
    thumbs.forEach(function (t, i) {
      t.addEventListener('click', function () {
        slides[i].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      });
    });
    sync();
  }

  // Bid form: keep the confirm dialog, then post in the background so the sound
  // can play while the tap is still "live" (iOS blocks audio otherwise).
  var form = document.getElementById('bid-form');
  if (form && window.fetch) {
    form.addEventListener('submit', function (e) {
      if (e.defaultPrevented) return;      // the confirm() dialog was cancelled
      e.preventDefault();
      unlock();
      window.__bidding = true;             // pause polling until we navigate
      var btn = form.querySelector('button[type=submit]');
      if (btn) { btn.disabled = true; btn.style.opacity = '.6'; }
      fetch('index.php', { method: 'POST', body: new FormData(form), credentials: 'same-origin' })
        .then(function (r) {
          var ok = r.url.indexOf('bid=ok') !== -1;
          feedback(ok);
          setTimeout(function () { location.href = r.url; }, ok ? 750 : 1000);
        })
        .catch(function () { window.__bidding = false; form.submit(); });
    });
  }
})();
</script>
</body>
</html>
<?php }

function status_label(string $s): string {
    return ['DRAFT' => 'مسودة', 'UPCOMING' => 'قادم', 'LIVE' => 'قائم الآن', 'ENDED' => 'منتهي', 'CANCELLED' => 'ملغي', 'SUSPENDED' => 'معلّق'][$s] ?? $s;
}
function status_class(string $s): string { return strtolower($s); }

function auction_card(array $a): string {
    $img = db()->prepare('SELECT url FROM item_images WHERE item_id = ? ORDER BY sort_order LIMIT 1');
    $img->execute([$a['item_id']]);
    $url = $img->fetchColumn() ?: null;
    $price = $a['status'] === 'ENDED' && $a['winning_bid'] ? (int)$a['winning_bid'] : (int)$a['current_price'];
    return '<a class="item-card" href="index.php?page=item&id=' . $a['id'] . '">'
        . ($url ? '<img src="' . h(media_url($url)) . '" alt="">' : '<div style="aspect-ratio:1;background:#eee"></div>')
        . '<div class="body">'
        . '<span class="badge ' . status_class($a['status']) . '">' . status_label($a['status']) . '</span>'
        . '<h3>' . h($a['title']) . '</h3>'
        . '<div class="muted">' . ($a['status'] === 'ENDED' ? 'السعر النهائي' : 'السعر الحالي') . '</div>'
        . '<div style="font-weight:800">' . money($price) . '</div>'
        . '</div></a>';
}

function fetch_auctions(string $whereSql, array $params = []): array {
    $stmt = db()->prepare("SELECT a.*, i.title FROM auctions a JOIN items i ON i.id = a.item_id WHERE $whereSql");
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return array_map('sync_auction', $rows);
}

// ---- Router ----

$user = current_user();
// Browsing is public: anyone can see the catalogue and any item, signed in or not.
// Bidding, "my bids" and the admin area still require an account.
const PUBLIC_PAGES = ['login', 'home', 'item', 'about', 'rules'];
$page = $_GET['page'] ?? 'home';
if (!$user && !in_array($page, PUBLIC_PAGES, true)) $page = 'login';

switch ($page) {
    case 'login':
        $next = (string)($_GET['next'] ?? '');
        if (!str_starts_with($next, 'index.php?')) $next = '';
        layout_start('تسجيل الدخول', null);
        ?>
        <div style="max-width:380px;margin:44px auto 0">
          <div style="text-align:center;margin-bottom:26px">
            <div class="kicker" style="font-size:10.5px;letter-spacing:.34em;color:var(--gold-dark);font-weight:600;margin-bottom:12px">مبادرة عائلية</div>
            <h1 style="font-size:40px">مزاد الذكريات</h1>
            <p class="tagline" style="font-family:var(--font-display);font-size:17px;color:var(--gold-dark);margin:6px 0 0">كل قطعةٍ تروي قصة... وكل قصةٍ تحفظ أثرًا.</p>
          </div>
          <div class="card">
            <form method="post">
              <input type="hidden" name="action" value="login">
              <?php if ($next !== ''): ?><input type="hidden" name="next" value="<?= h($next) ?>"><?php endif; ?>
              <label>رقم الجوال</label>
              <input type="tel" name="phone" required>
              <label>الرقم السري</label>
              <input type="password" name="pin" required>
              <button type="submit" style="width:100%">تسجيل الدخول</button>
            </form>
          </div>
          <p style="text-align:center;margin-top:20px">
            <a class="hlink" href="index.php">تصفّح المزادات بدون تسجيل ←</a>
          </p>
          <p class="muted" style="text-align:center">الحسابات تُنشأ مسبقًا بواسطة مدير المزاد فقط</p>
        </div>
        <?php
        layout_end();
        break;

    case 'rules':
        $next = $_GET['next'] ?? 'index.php';
        layout_start('قواعد المزاد', $user);
        ?>
        <h1>قواعد المزاد</h1>
        <p class="muted" style="margin-bottom:18px">قواعد واضحة تحفظ حق الجميع، وتضمن مزايدة عادلة وشفافة.</p>
        <div class="card">
          <ol style="line-height:2.1;padding-inline-start:20px;margin:0">
            <li>المزايدة نهائية بعد التأكيد ولا يمكن التراجع عنها.</li>
            <li>أعلى مزايدة صحيحة عند إغلاق المزاد هي الفائزة.</li>
            <li>الهوية الحقيقية للمزايدين مخفية، ويظهر فقط المعرف المستعار.</li>
            <li>مدير المزاد وحده يستطيع معرفة الهوية الحقيقية خلف كل حساب.</li>
            <li>يتم الاحتفاظ بسجل دائم لكل مزايدة.</li>
            <li>تمديد تلقائي لمنع الفوز بمزايدة في آخر لحظة (Soft Close).</li>
          </ol>
          <?php if ($user): ?>
          <form method="post" style="margin-top:20px">
            <input type="hidden" name="action" value="accept_rules">
            <input type="hidden" name="next" value="<?= h($next) ?>">
            <?= csrf_field() ?>
            <button type="submit" style="width:100%">قرأت وأوافق على قواعد المزاد</button>
          </form>
          <?php else: ?>
          <a class="btn" style="display:block;text-align:center;margin-top:20px" href="index.php?page=login">سجّل الدخول للمشاركة</a>
          <?php endif; ?>
        </div>
        <?php
        layout_end();
        break;

    case 'about':
        layout_start('قصة المزاد', $user);
        ?>
        <div class="hero" style="padding-top:26px">
          <div class="kicker">قصة المزاد</div>
          <h1>مزاد الذكريات</h1>
          <p class="tagline">كل قطعةٍ تروي قصة... وكل قصةٍ تحفظ أثرًا.</p>
        </div>
        <hr class="rule">
        <div class="card story">
          <p>مرحبًا بكم في <strong>مزاد الذكريات</strong>، وهي مبادرة عائلية مستوحاة من أعرق دور المزادات العالمية، أُطلقت وفاءً لذكرى والدتنا – رحمها الله – واحتفاءً بإرثها الذي ترك أثره في حياتنا جميعًا.</p>
          <p class="pull">في هذا المزاد، لا تُعرض المقتنيات لقيمتها المادية فحسب، بل لما تحمله من حكايات وذكريات.</p>
          <p>فلكل قطعة تاريخها، ولكل مجوهرة قصة، ولكل أثر معنى يستحق أن يُروى، ولما تمثله من محطاتٍ في حياة صاحبتها.</p>
          <h3 style="margin:24px 0 10px">ستجدون هنا</h3>
          <ul>
            <li>إعلانات المزاد ومراحله.</li>
            <li>استعراض المقتنيات وصورها.</li>
            <li>قصص مختارة لبعض القطع وتفاصيلها.</li>
            <li>مواعيد وآلية المشاركة في المزايدة.</li>
            <li>جميع المستجدات المتعلقة بالمزاد.</li>
          </ul>
          <h3 style="margin:24px 0 10px">أثرٌ يتجاوز الذكرى</h3>
          <p>نأمل أن يكون لهذا المزاد أثرٌ يتجاوز حفظ الذكريات، إذ سيُخصص <strong>ثلث صافي قيمة المزاد</strong> – بإذن الله – للأعمال الخيرية، سائلين الله أن يجعلها صدقةً جارية في ميزان حسنات والدتنا، وأن يبارك في أثرها.</p>
          <p>ونرحب بكل من يود مشاركة قصة أو ذكرى أو معلومة عن إحدى المقتنيات، لتبقى جزءًا من هذا الإرث الجميل، ولتُحفظ للأجيال القادمة.</p>
          <div style="text-align:center;margin-top:26px">
            <a class="btn" href="index.php">تصفّح المقتنيات</a>
          </div>
        </div>
        <?php
        layout_end();
        break;

    case 'home':
        layout_start('الرئيسية', $user);
        $live = fetch_auctions("a.status = 'LIVE' ORDER BY a.end_at ASC");
        $upcoming = fetch_auctions("a.status = 'UPCOMING' ORDER BY a.start_at ASC");
        $ended = fetch_auctions("a.status = 'ENDED' ORDER BY a.end_at DESC LIMIT 30");
        ?>
        <?php if ($user): ?>
          <div style="padding:8px 0 2px">
            <h1 style="font-size:30px">مرحبًا، <?= h($user['alias']) ?></h1>
            <p class="muted">كل قطعةٍ تروي قصة... وكل قصةٍ تحفظ أثرًا.</p>
          </div>
        <?php else: ?>
          <div class="hero">
            <div class="kicker">مبادرة عائلية</div>
            <h1>مزاد الذكريات</h1>
            <p class="tagline">كل قطعةٍ تروي قصة... وكل قصةٍ تحفظ أثرًا.</p>
            <p class="lede">مبادرة عائلية مستوحاة من أعرق دور المزادات العالمية، أُطلقت وفاءً لذكرى والدتنا – رحمها الله – واحتفاءً بإرثها. لا تُعرض المقتنيات لقيمتها المادية فحسب، بل لما تحمله من حكايات وذكريات.</p>
            <div class="hero-actions">
              <a class="btn" href="#المقتنيات">تصفّح المقتنيات</a>
              <a class="btn secondary" href="index.php?page=about">قصة المزاد</a>
            </div>
            <hr class="rule">
            <span class="chip">ثلثُ صافي قيمة المزاد يُخصَّص للأعمال الخيرية</span>
          </div>
        <?php endif; ?>

        <div class="section-head" id="المقتنيات">
          <h2>قائمة الآن<?= $live ? ' (' . count($live) . ')' : '' ?></h2>
          <div class="sub">مقتنيات مفتوحة للمزايدة في هذه اللحظة</div>
        </div>
        <div class="grid"><?php foreach ($live as $a) echo auction_card($a); ?></div>
        <?php if (!$live): ?><p class="muted">لا توجد مزادات قائمة حاليًا — تابعونا، فالقادم يحمل حكايات.</p><?php endif; ?>

        <div class="section-head">
          <h2>القادمة<?= $upcoming ? ' (' . count($upcoming) . ')' : '' ?></h2>
          <div class="sub">قطعٌ تستعد لتروي قصتها</div>
        </div>
        <div class="grid"><?php foreach ($upcoming as $a) echo auction_card($a); ?></div>
        <?php if (!$upcoming): ?><p class="muted">لا توجد مزادات قادمة حاليًا</p><?php endif; ?>

        <div class="section-head">
          <h2>المنتهية<?= $ended ? ' (' . count($ended) . ')' : '' ?></h2>
          <div class="sub">ذكرياتٌ وجدت أصحابها</div>
        </div>
        <div class="grid"><?php foreach ($ended as $a) echo auction_card($a); ?></div>
        <?php if (!$ended): ?><p class="muted">لا توجد مزادات منتهية بعد</p><?php endif; ?>
        <?php
        layout_end();
        break;

    case 'my_bids':
        require_login();
        layout_start('مزايداتي', $user);
        $mine = fetch_auctions("a.id IN (SELECT auction_id FROM bids WHERE user_id = ? AND status='active') ORDER BY a.end_at DESC", [$user['id']]);
        $leading = $outbid = $won = $lost = [];
        foreach ($mine as $a) {
            $bids = active_bids((int)$a['id']);
            $top = $bids[0] ?? null;
            $isTop = $top && (int)$top['user_id'] === (int)$user['id'];
            if ($a['status'] === 'LIVE') { $isTop ? $leading[] = $a : $outbid[] = $a; }
            elseif ($a['status'] === 'ENDED') { $isTop ? $won[] = $a : $lost[] = $a; }
        }
        foreach (['أعلى مزايد حاليًا' => $leading, 'تم تجاوز مزايدتي' => $outbid, 'فزت بها' => $won, 'لم أفز' => $lost] as $label => $list) {
            echo '<h2>' . h($label) . ' (' . count($list) . ')</h2><div class="grid">';
            foreach ($list as $a) echo auction_card($a);
            echo '</div>';
            if (!$list) echo '<p class="muted">لا توجد قطع في هذا القسم</p>';
        }
        layout_end();
        break;

    case 'item':
        $id = (int)($_GET['id'] ?? 0);
        $auction = get_auction($id);
        if (!$auction) { http_response_code(404); layout_start('غير موجود', $user); echo '<p>القطعة غير موجودة.</p>'; layout_end(); break; }
        $item = db()->query('SELECT * FROM items WHERE id = ' . (int)$auction['item_id'])->fetch(PDO::FETCH_ASSOC);
        $images = db()->prepare('SELECT * FROM item_images WHERE item_id = ? ORDER BY sort_order');
        $images->execute([$auction['item_id']]);
        $images = $images->fetchAll(PDO::FETCH_ASSOC);
        $bids = active_bids($id);
        $hasBids = count($bids) > 0;
        $topBid = $bids[0] ?? null;
        $myId = $user ? (int)$user['id'] : 0;   // 0 = guest, matches no bidder
        $isTop = $topBid && (int)$topBid['user_id'] === $myId;
        $hasUserBid = (bool)array_filter($bids, fn($b) => (int)$b['user_id'] === $myId);
        $minNext = min_next_bid($auction, $hasBids);
        $winnerAlias = null;
        if ($auction['winner_user_id']) {
            $w = db()->prepare('SELECT alias FROM users WHERE id = ?');
            $w->execute([$auction['winner_user_id']]);
            $winnerAlias = $w->fetchColumn();
        }
        layout_start($item['title'], $user);
        ?>
        <a href="index.php" class="muted">← رجوع</a>
        <div style="display:grid;grid-template-columns:1fr;gap:20px;margin-top:10px" id="grid-cols">
          <div>
            <h1><?= h($item['title']) ?></h1>
            <?php if ($images): ?>
              <div class="gallery" data-count="<?= count($images) ?>">
                <div class="gal-track" id="gal-track">
                  <?php foreach ($images as $i => $im): ?>
                    <img src="<?= h(media_url($im['url'])) ?>" alt="<?= h($item['title']) ?> — <?= $i + 1 ?>">
                  <?php endforeach; ?>
                </div>
                <?php if (count($images) > 1): ?>
                  <div class="gal-dots" id="gal-dots">
                    <?php foreach ($images as $i => $im): ?><span<?= $i === 0 ? ' class="on"' : '' ?>></span><?php endforeach; ?>
                  </div>
                  <div class="thumbs" id="gal-thumbs">
                    <?php foreach ($images as $i => $im): ?>
                      <img src="<?= h(media_url($im['url'])) ?>"<?= $i === 0 ? ' class="on"' : '' ?> alt="">
                    <?php endforeach; ?>
                  </div>
                <?php endif; ?>
              </div>
            <?php else: ?>
              <div style="aspect-ratio:1;background:#ececee;border-radius:16px"></div>
            <?php endif; ?>
            <div class="card" style="margin-top:12px">
              <?php
              $fields = [
                  'الوصف' => $item['description'], 'الوزن' => $item['weight_grams'] ? $item['weight_grams'] . ' جرام' : null,
                  'العيار' => $item['karat'], 'الحالة' => $item['condition_text'],
                  'التصنيف' => $item['category'] ? CATEGORIES[$item['category']] : null, 'ملاحظات' => $item['notes'],
              ];
              foreach ($fields as $label => $val) {
                  if ($val) echo '<p><strong>' . h($label) . ':</strong> ' . h((string)$val) . '</p>';
              }
              ?>
            </div>
          </div>
          <div>
            <div class="card" id="auction-panel" data-id="<?= $id ?>">
              <?php if ($auction['status'] === 'LIVE'): ?>
                <div class="muted"><?= $hasBids ? 'السعر الحالي' : 'سعر الافتتاح' ?></div>
                <div class="price" id="js-price"><?= money((int)$auction['current_price']) ?></div>
                <?php if ($isTop): ?><p class="badge live">أنت أعلى مزايد حاليًا</p><?php elseif ($hasUserBid): ?><p class="badge cancelled">تم تجاوز مزايدتك</p><?php endif; ?>
                <p class="muted" style="margin:6px 0">
                  <?php if (!$hasBids): ?>
                    أول مزايدة تبدأ من سعر الافتتاح، ثم تزيد <?= money((int)$auction['bid_increment']) ?> في كل مزايدة.
                  <?php else: ?>
                    قيمة كل زيادة: <?= money((int)$auction['bid_increment']) ?>
                  <?php endif; ?>
                </p>
                <div class="muted">ينتهي بعد <b id="js-countdown" data-end="<?= h($auction['end_at']) ?>"></b></div>
                <p class="muted">ينتهي: <?= fmt_dt($auction['end_at']) ?></p>
                <?php if (!$user): ?>
                  <a class="btn" style="display:block;text-align:center;margin-top:10px" href="index.php?page=login&next=<?= urlencode('index.php?page=item&id=' . $id) ?>">سجّل الدخول للمزايدة</a>
                <?php elseif (!$user['accepted_rules_at']): ?>
                  <a class="btn" style="display:block;text-align:center;margin-top:10px" href="index.php?page=rules&next=<?= urlencode('index.php?page=item&id=' . $id) ?>">الرجاء الموافقة على قواعد المزاد للمشاركة</a>
                <?php elseif ($isTop): ?>
                  <button disabled style="width:100%;margin-top:10px" id="js-bid-btn">أنت أعلى مزايد حاليًا</button>
                <?php else: ?>
                  <form method="post" id="bid-form" onsubmit="return confirm('تأكيد المزايدة بمبلغ <?= $minNext ?> ريال على <?= h(addslashes($item['title'])) ?>؟');">
                    <input type="hidden" name="action" value="bid">
                    <input type="hidden" name="auction_id" value="<?= $id ?>">
                    <input type="hidden" name="amount" value="<?= $minNext ?>">
                    <?= csrf_field() ?>
                    <button type="submit" style="width:100%;margin-top:10px" id="js-bid-btn"><?php if (!$hasBids): ?>ابدأ المزايدة بـ <?= money($minNext) ?> (سعر الافتتاح)<?php else: ?>زايد بـ <span id="js-min-next"><?= money($minNext) ?></span><?php endif; ?></button>
                  </form>
                <?php endif; ?>
              <?php elseif ($auction['status'] === 'UPCOMING'): ?>
                <div class="muted">سعر الافتتاح</div>
                <div class="price"><?= money((int)$auction['opening_price']) ?></div>
                <p class="muted">يبدأ: <?= fmt_dt($auction['start_at']) ?></p>
              <?php elseif ($auction['status'] === 'ENDED'): ?>
                <?php if ($winnerAlias && $isTop): ?>
                  <div class="success-box"><strong>🎉 مبروك! رسا عليك المزاد</strong><br><?= money((int)$auction['winning_bid']) ?></div>
                <?php elseif ($winnerAlias): ?>
                  <p>انتهى المزاد</p><div class="price"><?= money((int)$auction['winning_bid']) ?></div>
                  <?php if ($hasUserBid): ?><p class="muted">لم ترسُ عليك هذه القطعة</p><?php endif; ?>
                <?php else: ?>
                  <p>انتهى المزاد بدون فائز</p>
                <?php endif; ?>
              <?php else: ?>
                <p><?= $auction['status'] === 'SUSPENDED' ? 'تم تعليق المزاد بواسطة مدير المزاد' : 'تم إلغاء المزاد' ?></p>
              <?php endif; ?>

              <h3 style="margin-top:20px">سجل المزايدات</h3>
              <table id="js-bids-table">
                <thead><tr><th>المزايد</th><th>المبلغ</th><th>الوقت</th></tr></thead>
                <tbody id="js-bids-body">
                  <?php foreach ($bids as $b): ?>
                  <tr<?= (int)$b['user_id'] === (int)$user['id'] ? ' style="background:#fef3c7"' : '' ?>>
                    <td><?= h($b['alias']) ?></td><td><?= money((int)$b['amount']) ?></td><td><?= date('h:i A', strtotime($b['created_at'])) ?></td>
                  </tr>
                  <?php endforeach; if (!$bids): ?><tr><td colspan="3" class="muted">لا توجد مزايدات بعد</td></tr><?php endif; ?>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <style>@media(min-width:800px){#grid-cols{grid-template-columns:1fr 1fr}}</style>
        <script>
        (function() {
          var panel = document.getElementById('auction-panel');
          if (!panel || '<?= $auction['status'] ?>' !== 'LIVE') return;
          // Baseline count of bids as rendered on the server. When the poll sees a
          // different number of bids, someone has bid (or been outbid), so we reload
          // the whole page — that way every open viewer re-renders with the correct
          // price, button state, and "you are the top bidder" / "you were outbid" badge.
          var lastBidCount = <?= (int)count($bids) ?>;
          var endEl = document.getElementById('js-countdown');
          function tick() {
            if (!endEl) return;
            var end = new Date(endEl.dataset.end.replace(' ', 'T')).getTime();
            var diff = Math.max(0, end - Date.now());
            var h = Math.floor(diff / 3600000), m = Math.floor(diff % 3600000 / 60000), s = Math.floor(diff % 60000 / 1000);
            endEl.textContent = diff <= 0 ? 'انتهى' : [h, m, s].map(function(n){return String(n).padStart(2,'0');}).join(':');
          }
          tick();
          setInterval(tick, 1000);

          function poll() {
            if (window.__bidding) return;   // a bid is being submitted — don't reload under it
            // The _ param + no-store keep Safari from serving a cached response
            // (which would freeze the price and stop auto-refresh).
            fetch('index.php?ajax=status&id=' + panel.dataset.id + '&_=' + Date.now(), { cache: 'no-store' }).then(function(r){return r.json();}).then(function(data) {
              if (data.error) return;
              // Auction ended, got suspended/cancelled, or a new bid landed → reload
              // so the server re-renders the panel correctly for this viewer.
              if (data.status !== 'LIVE' || (data.bids && data.bids.length !== lastBidCount)) {
                location.reload();
                return;
              }
              if (endEl) endEl.dataset.end = data.end_at;
            }).catch(function(){});
          }
          setInterval(poll, 4000);
        })();
        </script>
        <?php
        layout_end();
        break;

    case 'admin':
        require_admin();
        layout_start('لوحة التحكم', $user);
        $itemCount = (int)db()->query('SELECT COUNT(*) FROM items')->fetchColumn();
        $live = (int)db()->query("SELECT COUNT(*) FROM auctions WHERE status='LIVE'")->fetchColumn();
        $upcoming = (int)db()->query("SELECT COUNT(*) FROM auctions WHERE status='UPCOMING'")->fetchColumn();
        $ended = (int)db()->query("SELECT COUNT(*) FROM auctions WHERE status='ENDED'")->fetchColumn();
        $bidCount = (int)db()->query("SELECT COUNT(*) FROM bids WHERE status='active'")->fetchColumn();
        $totalEnded = (int)db()->query("SELECT COALESCE(SUM(winning_bid),0) FROM auctions WHERE status='ENDED'")->fetchColumn();
        ?>
        <h1>لوحة التحكم</h1>
        <div class="grid">
          <div class="card"><div class="muted">عدد القطع</div><div class="price"><?= $itemCount ?></div></div>
          <div class="card"><div class="muted">المزادات الحالية</div><div class="price"><?= $live ?></div></div>
          <div class="card"><div class="muted">المزادات القادمة</div><div class="price"><?= $upcoming ?></div></div>
          <div class="card"><div class="muted">المزادات المنتهية</div><div class="price"><?= $ended ?></div></div>
          <div class="card"><div class="muted">عدد المزايدات</div><div class="price"><?= $bidCount ?></div></div>
          <div class="card"><div class="muted">إجمالي المزادات المنتهية</div><div class="price"><?= money($totalEnded) ?></div></div>
        </div>
        <p>
          <a class="btn" href="index.php?page=admin_item_new">+ إضافة قطعة</a>
          <a class="btn secondary" href="index.php?page=admin_auction_new">+ إنشاء مزاد</a>
          <a class="btn secondary" href="index.php?page=admin_user_new">+ إضافة مستخدم</a>
        </p>
        <?php
        layout_end();
        break;

    case 'admin_users':
        require_admin();
        layout_start('المستخدمون', $user);
        $users = db()->query('SELECT * FROM users ORDER BY role, alias')->fetchAll(PDO::FETCH_ASSOC);
        ?>
        <div style="display:flex;justify-content:space-between;align-items:center"><h1>المستخدمون</h1><a class="btn" href="index.php?page=admin_user_new">+ إضافة مستخدم</a></div>
        <div class="card">
        <table>
          <thead><tr><th>المعرف</th><th>الاسم الحقيقي</th><th>الجوال</th><th>الدور</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
          <?php foreach ($users as $u): ?>
            <tr>
              <td><?= h($u['alias']) ?></td><td><?= h($u['real_name']) ?></td><td><?= h($u['phone']) ?></td>
              <td><?= $u['role'] === 'admin' ? 'مدير' : 'مزايد' ?></td>
              <td><span class="badge <?= $u['status'] === 'active' ? 'live' : 'cancelled' ?>"><?= $u['status'] === 'active' ? 'مفعل' : 'معطل' ?></span></td>
              <td>
                <a href="index.php?page=admin_user_edit&id=<?= $u['id'] ?>">تعديل</a>
                <?php if ($u['role'] !== 'admin'): ?>
                <form method="post" style="display:inline"><input type="hidden" name="action" value="admin_user_toggle"><input type="hidden" name="id" value="<?= $u['id'] ?>"><?= csrf_field() ?>
                  <button type="submit" class="btn secondary" style="padding:2px 8px"><?= $u['status'] === 'active' ? 'تعطيل' : 'تفعيل' ?></button>
                </form>
                <?php endif; ?>
              </td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
        </div>
        <?php
        layout_end();
        break;

    case 'admin_user_new':
    case 'admin_user_edit':
        require_admin();
        $editing = $page === 'admin_user_edit';
        $u = null;
        if ($editing) {
            $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
            $stmt->execute([(int)$_GET['id']]);
            $u = $stmt->fetch(PDO::FETCH_ASSOC);
        }
        layout_start($editing ? 'تعديل مستخدم' : 'إضافة مستخدم', $user);
        ?>
        <h1><?= $editing ? 'تعديل مستخدم' : 'إضافة مستخدم' ?></h1>
        <div class="card" style="max-width:420px">
          <form method="post">
            <input type="hidden" name="action" value="<?= $editing ? 'admin_user_update' : 'admin_user_create' ?>">
            <?php if ($editing): ?><input type="hidden" name="id" value="<?= $u['id'] ?>"><?php endif; ?>
            <?= csrf_field() ?>
            <label>الاسم الحقيقي</label><input type="text" name="real_name" required value="<?= h($u['real_name'] ?? '') ?>">
            <label>رقم الجوال</label><input type="tel" name="phone" required value="<?= h($u['phone'] ?? '') ?>">
            <label>المعرف المستعار</label><input type="text" name="alias" required placeholder="مزايد 07" value="<?= h($u['alias'] ?? '') ?>">
            <label><?= $editing ? 'رقم سري جديد (اختياري)' : 'الرقم السري' ?></label>
            <input type="text" name="pin" <?= $editing ? '' : 'required' ?>>
            <button type="submit" style="width:100%">حفظ</button>
          </form>
        </div>
        <?php
        layout_end();
        break;

    case 'admin_items':
        require_admin();
        layout_start('القطع', $user);
        $items = db()->query('SELECT * FROM items ORDER BY created_at DESC')->fetchAll(PDO::FETCH_ASSOC);
        ?>
        <div style="display:flex;justify-content:space-between;align-items:center"><h1>القطع</h1><a class="btn" href="index.php?page=admin_item_new">+ إضافة قطعة</a></div>
        <div class="grid">
        <?php foreach ($items as $it):
          $img = db()->prepare('SELECT url FROM item_images WHERE item_id = ? ORDER BY sort_order LIMIT 1');
          $img->execute([$it['id']]);
          $url = $img->fetchColumn();
        ?>
          <a class="item-card" href="index.php?page=admin_item_edit&id=<?= $it['id'] ?>">
            <?= $url ? '<img src="' . h(media_url($url)) . '" alt="">' : '<div style="aspect-ratio:1;background:#eee"></div>' ?>
            <div class="body"><h3><?= h($it['title']) ?></h3><div class="muted"><?= h($it['internal_code'] ?? '—') ?></div></div>
          </a>
        <?php endforeach; ?>
        </div>
        <?php
        layout_end();
        break;

    case 'admin_item_new':
    case 'admin_item_edit':
        require_admin();
        $editing = $page === 'admin_item_edit';
        $it = ['title'=>'','description'=>'','weight_grams'=>'','karat'=>'','condition_text'=>'','notes'=>'','category'=>'','internal_code'=>''];
        $images = [];
        $auctions = [];
        if ($editing) {
            $id = (int)$_GET['id'];
            $stmt = db()->prepare('SELECT * FROM items WHERE id = ?');
            $stmt->execute([$id]);
            $it = $stmt->fetch(PDO::FETCH_ASSOC);
            $imgStmt = db()->prepare('SELECT * FROM item_images WHERE item_id = ? ORDER BY sort_order');
            $imgStmt->execute([$id]);
            $images = $imgStmt->fetchAll(PDO::FETCH_ASSOC);
            $aucStmt = db()->prepare('SELECT * FROM auctions WHERE item_id = ? ORDER BY created_at DESC');
            $aucStmt->execute([$id]);
            $auctions = array_map('sync_auction', $aucStmt->fetchAll(PDO::FETCH_ASSOC));
        }
        layout_start($editing ? 'تعديل قطعة' : 'إضافة قطعة', $user);
        ?>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h1><?= $editing ? 'تعديل: ' . h($it['title']) : 'إضافة قطعة جديدة' ?></h1>
          <?php if ($editing): ?><a class="btn secondary" href="index.php?page=admin_auction_new&item_id=<?= $it['id'] ?>">+ إنشاء مزاد لهذه القطعة</a><?php endif; ?>
        </div>
        <div style="display:grid;grid-template-columns:1fr;gap:20px" id="grid-cols">
          <div>
            <?php if ($editing): ?>
            <h3>الصور الحالية</h3>
            <div class="thumbs">
            <?php foreach ($images as $im): ?>
              <div style="position:relative">
                <img src="<?= h(media_url($im['url'])) ?>" alt="">
                <form method="post" style="position:absolute;top:-6px;left:-6px;margin:0">
                  <input type="hidden" name="action" value="admin_image_delete"><input type="hidden" name="id" value="<?= $im['id'] ?>"><?= csrf_field() ?>
                  <button type="submit" style="padding:0 6px;border-radius:50%;background:#000;color:#fff;font-size:10px">×</button>
                </form>
              </div>
            <?php endforeach; ?>
            <?php if (!$images): ?><p class="muted">لا توجد صور بعد</p><?php endif; ?>
            </div>
            <?php if ($auctions): ?>
            <h3>المزادات المرتبطة</h3>
            <ul><?php foreach ($auctions as $a) echo '<li><a href="index.php?page=admin_auction_edit&id=' . $a['id'] . '">' . status_label($a['status']) . ' — ' . money((int)$a['current_price']) . '</a></li>'; ?></ul>
            <?php endif; ?>
            <?php endif; ?>
          </div>
          <div class="card">
            <form method="post" enctype="multipart/form-data">
              <input type="hidden" name="action" value="admin_item_save">
              <?php if ($editing): ?><input type="hidden" name="id" value="<?= $it['id'] ?>"><?php endif; ?>
              <?= csrf_field() ?>
              <label>اسم القطعة *</label><input type="text" name="title" required value="<?= h($it['title']) ?>">
              <label>الوصف</label><textarea name="description" rows="3"><?= h($it['description'] ?? '') ?></textarea>
              <label>الوزن (جرام)</label><input type="number" step="0.01" name="weight_grams" value="<?= h((string)($it['weight_grams'] ?? '')) ?>">
              <label>العيار</label><input type="text" name="karat" value="<?= h($it['karat'] ?? '') ?>">
              <label>الحالة</label><input type="text" name="condition_text" value="<?= h($it['condition_text'] ?? '') ?>">
              <label>التصنيف</label>
              <select name="category">
                <option value="">بدون تصنيف</option>
                <?php foreach (CATEGORIES as $k => $v): ?><option value="<?= $k ?>" <?= ($it['category'] ?? '') === $k ? 'selected' : '' ?>><?= h($v) ?></option><?php endforeach; ?>
              </select>
              <label>رقم داخلي للقطعة</label><input type="text" name="internal_code" value="<?= h($it['internal_code'] ?? '') ?>">
              <label>ملاحظات</label><textarea name="notes" rows="2"><?= h($it['notes'] ?? '') ?></textarea>
              <label>إضافة صور</label><input type="file" name="images[]" multiple accept="image/*">
              <button type="submit" style="width:100%">حفظ</button>
            </form>
          </div>
        </div>
        <style>@media(min-width:800px){#grid-cols{grid-template-columns:1fr 1fr}}</style>
        <?php
        layout_end();
        break;

    case 'admin_auctions':
        require_admin();
        layout_start('المزادات', $user);
        $auctions = fetch_auctions('1=1 ORDER BY a.created_at DESC');
        ?>
        <div style="display:flex;justify-content:space-between;align-items:center"><h1>المزادات</h1><a class="btn" href="index.php?page=admin_auction_new">+ إنشاء مزاد</a></div>
        <div class="card">
        <table>
          <thead><tr><th>القطعة</th><th>الحالة</th><th>السعر الحالي</th><th>البداية</th><th>النهاية</th><th></th></tr></thead>
          <tbody>
          <?php foreach ($auctions as $a): ?>
            <tr>
              <td><?= h($a['title']) ?></td>
              <td><span class="badge <?= status_class($a['status']) ?>"><?= status_label($a['status']) ?></span></td>
              <td><?= money((int)$a['current_price']) ?></td>
              <td><?= fmt_dt($a['start_at']) ?></td><td><?= fmt_dt($a['end_at']) ?></td>
              <td><a href="index.php?page=admin_auction_edit&id=<?= $a['id'] ?>">إدارة</a></td>
            </tr>
          <?php endforeach; ?>
          <?php if (!$auctions): ?><tr><td colspan="6" class="muted">لا توجد مزادات بعد</td></tr><?php endif; ?>
          </tbody>
        </table>
        </div>
        <?php
        layout_end();
        break;

    case 'admin_auction_new':
        require_admin();
        $itemId = (int)($_GET['item_id'] ?? 0);
        $items = db()->query('SELECT id, title FROM items ORDER BY created_at DESC')->fetchAll(PDO::FETCH_ASSOC);
        layout_start('إنشاء مزاد', $user);
        ?>
        <h1>إنشاء مزاد جديد</h1>
        <div class="card" style="max-width:500px">
          <form method="post">
            <input type="hidden" name="action" value="admin_auction_save">
            <?= csrf_field() ?>
            <label>القطعة *</label>
            <select name="item_id" required <?= $itemId ? 'disabled' : '' ?>>
              <option value="">اختر القطعة</option>
              <?php foreach ($items as $it): ?><option value="<?= $it['id'] ?>" <?= $itemId === (int)$it['id'] ? 'selected' : '' ?>><?= h($it['title']) ?></option><?php endforeach; ?>
            </select>
            <?php if ($itemId): ?><input type="hidden" name="item_id" value="<?= $itemId ?>"><?php endif; ?>
            <label>سعر الافتتاح (ريال) *</label><input type="number" name="opening_price" required min="1">
            <label>قيمة الزيادة *</label><input type="number" name="bid_increment" required min="1" value="500">
            <label>بداية المزاد *</label><input type="datetime-local" name="start_at" required>
            <label>نهاية المزاد *</label><input type="datetime-local" name="end_at" required>
            <label><input type="checkbox" name="soft_close_enabled" checked style="width:auto;display:inline-block"> تمديد المزاد التلقائي (Soft Close)</label>
            <label>مدة التمديد (دقائق)</label><input type="number" name="extension_minutes" value="2" min="1">
            <button type="submit" style="width:100%">حفظ</button>
          </form>
        </div>
        <?php
        layout_end();
        break;

    case 'admin_auction_edit':
        require_admin();
        $id = (int)$_GET['id'];
        $auction = get_auction($id);
        if (!$auction) { redirect('index.php?page=admin_auctions'); }
        $item = db()->query('SELECT * FROM items WHERE id = ' . (int)$auction['item_id'])->fetch(PDO::FETCH_ASSOC);
        $bids = db()->prepare("SELECT b.*, u.alias, u.real_name FROM bids b JOIN users u ON u.id=b.user_id WHERE b.auction_id=? ORDER BY b.created_at DESC");
        $bids->execute([$id]);
        $bids = $bids->fetchAll(PDO::FETCH_ASSOC);
        $winner = null;
        if ($auction['winner_user_id']) {
            $w = db()->prepare('SELECT * FROM users WHERE id = ?');
            $w->execute([$auction['winner_user_id']]);
            $winner = $w->fetch(PDO::FETCH_ASSOC);
        }
        layout_start('إدارة مزاد', $user);
        ?>
        <h1>إدارة مزاد: <?= h($item['title']) ?></h1>
        <span class="badge <?= status_class($auction['status']) ?>"><?= status_label($auction['status']) ?></span>
        <div style="display:grid;grid-template-columns:1fr;gap:20px;margin-top:12px" id="grid-cols">
          <div>
            <?php if ($auction['status'] === 'DRAFT'): ?>
              <form method="post" class="card"><input type="hidden" name="action" value="admin_auction_publish"><input type="hidden" name="id" value="<?= $id ?>"><?= csrf_field() ?><button type="submit" style="width:100%;background:#047857">نشر المزاد</button></form>
            <?php endif; ?>

            <?php if (in_array($auction['status'], ['DRAFT', 'UPCOMING'], true)): ?>
            <div class="card">
              <form method="post">
                <input type="hidden" name="action" value="admin_auction_save"><input type="hidden" name="id" value="<?= $id ?>"><input type="hidden" name="item_id" value="<?= $auction['item_id'] ?>"><?= csrf_field() ?>
                <label>سعر الافتتاح *</label><input type="number" name="opening_price" required value="<?= $auction['opening_price'] ?>">
                <label>قيمة الزيادة *</label><input type="number" name="bid_increment" required value="<?= $auction['bid_increment'] ?>">
                <label>بداية المزاد *</label><input type="datetime-local" name="start_at" required value="<?= date('Y-m-d\TH:i', strtotime($auction['start_at'])) ?>">
                <label>نهاية المزاد *</label><input type="datetime-local" name="end_at" required value="<?= date('Y-m-d\TH:i', strtotime($auction['end_at'])) ?>">
                <label><input type="checkbox" name="soft_close_enabled" <?= $auction['soft_close_enabled'] ? 'checked' : '' ?> style="width:auto;display:inline-block"> Soft Close</label>
                <label>مدة التمديد (دقائق)</label><input type="number" name="extension_minutes" value="<?= $auction['extension_minutes'] ?>">
                <button type="submit" style="width:100%">حفظ التعديلات</button>
              </form>
            </div>
            <?php endif; ?>

            <?php if ($auction['status'] === 'LIVE'): ?>
            <div class="card">
              <div class="muted">السعر الحالي</div><div class="price"><?= money((int)$auction['current_price']) ?></div>
              <p class="muted">ينتهي: <?= fmt_dt($auction['end_at']) ?></p>
              <form method="post"><input type="hidden" name="action" value="admin_auction_suspend"><input type="hidden" name="id" value="<?= $id ?>"><?= csrf_field() ?>
                <label>تعليق المزاد (عطل تقني)</label>
                <textarea name="reason" rows="2" placeholder="السبب (اختياري)"></textarea>
                <button type="submit" style="width:100%">تعليق المزاد</button>
              </form>
            </div>
            <?php endif; ?>

            <?php if ($auction['status'] === 'SUSPENDED'): ?>
            <div class="card">
              <p><strong>المزاد معلّق</strong></p>
              <?php if ($auction['suspended_reason']): ?><p class="muted">السبب: <?= h($auction['suspended_reason']) ?></p><?php endif; ?>
              <form method="post"><input type="hidden" name="action" value="admin_auction_resume"><input type="hidden" name="id" value="<?= $id ?>"><?= csrf_field() ?>
                <label>موعد نهاية جديد (اختياري)</label><input type="datetime-local" name="new_end_at">
                <button type="submit" style="width:100%;background:#047857">استئناف المزاد</button>
              </form>
            </div>
            <?php endif; ?>

            <?php if ($auction['status'] === 'ENDED'): ?>
            <div class="card">
              <div class="muted">الفائز</div>
              <div><?= $winner ? h($winner['real_name']) . ' (' . h($winner['alias']) . ')' : 'بدون فائز' ?></div>
              <div class="muted" style="margin-top:8px">المبلغ النهائي</div>
              <div class="price"><?= money((int)($auction['winning_bid'] ?? 0)) ?></div>
            </div>
            <?php endif; ?>

            <?php if (in_array($auction['status'], ['DRAFT', 'UPCOMING', 'LIVE'], true)): ?>
            <form method="post"><input type="hidden" name="action" value="admin_auction_cancel"><input type="hidden" name="id" value="<?= $id ?>"><?= csrf_field() ?><button type="submit" class="btn danger" style="width:100%">إلغاء المزاد</button></form>
            <?php endif; ?>
          </div>
          <div class="card">
            <h3>سجل المزايدات الكامل</h3>
            <table>
              <thead><tr><th>المزايد</th><th>الاسم الحقيقي</th><th>المبلغ</th><th>الوقت</th><th>الحالة</th></tr></thead>
              <tbody>
              <?php foreach ($bids as $b): ?>
                <tr><td><?= h($b['alias']) ?></td><td><?= h($b['real_name']) ?></td><td><?= money((int)$b['amount']) ?></td><td><?= fmt_dt($b['created_at']) ?></td><td><?= $b['status'] === 'active' ? 'فعّالة' : 'ملغاة' ?></td></tr>
              <?php endforeach; ?>
              <?php if (!$bids): ?><tr><td colspan="5" class="muted">لا توجد مزايدات بعد</td></tr><?php endif; ?>
              </tbody>
            </table>
          </div>
        </div>
        <style>@media(min-width:800px){#grid-cols{grid-template-columns:1fr 1fr}}</style>
        <?php
        layout_end();
        break;

    case 'admin_results':
        require_admin();
        layout_start('لوحة النتائج', $user);
        $stmt = db()->query("SELECT a.*, i.title, u.real_name, u.alias FROM auctions a JOIN items i ON i.id=a.item_id LEFT JOIN users u ON u.id=a.winner_user_id WHERE a.status='ENDED' ORDER BY a.end_at DESC");
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        ?>
        <h1>لوحة النتائج</h1>
        <div class="card">
        <table>
          <thead><tr><th>القطعة</th><th>الفائز</th><th>المعرف</th><th>المبلغ</th><th></th></tr></thead>
          <tbody>
          <?php foreach ($results as $r): ?>
            <tr>
              <td><?= h($r['title']) ?></td><td><?= h($r['real_name'] ?? '—') ?></td><td><?= h($r['alias'] ?? '—') ?></td>
              <td><?= money((int)($r['winning_bid'] ?? 0)) ?></td>
              <td><a href="index.php?page=admin_auction_edit&id=<?= $r['id'] ?>">سجل المزايدات</a></td>
            </tr>
          <?php endforeach; ?>
          <?php if (!$results): ?><tr><td colspan="5" class="muted">لا توجد نتائج بعد</td></tr><?php endif; ?>
          </tbody>
        </table>
        </div>
        <?php
        layout_end();
        break;

    case 'admin_audit':
        require_admin();
        layout_start('سجل العمليات', $user);
        $stmt = db()->query('SELECT l.*, u.real_name, u.alias FROM audit_log l LEFT JOIN users u ON u.id = l.actor_user_id ORDER BY l.created_at DESC LIMIT 200');
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
        ?>
        <h1>سجل العمليات (Audit Log)</h1>
        <div class="card">
        <table>
          <thead><tr><th>الوقت</th><th>العملية</th><th>نوع الكائن</th><th>المعرف</th><th>المنفذ</th></tr></thead>
          <tbody>
          <?php foreach ($logs as $l): ?>
            <tr>
              <td><?= fmt_dt($l['created_at']) ?></td><td><?= h($l['action']) ?></td><td><?= h($l['entity_type']) ?></td>
              <td class="muted"><?= h((string)($l['entity_id'] ?? '—')) ?></td>
              <td><?= $l['real_name'] ? h($l['real_name'] . ' (' . $l['alias'] . ')') : 'النظام' ?></td>
            </tr>
          <?php endforeach; ?>
          <?php if (!$logs): ?><tr><td colspan="5" class="muted">لا توجد عمليات</td></tr><?php endif; ?>
          </tbody>
        </table>
        </div>
        <?php
        layout_end();
        break;

    default:
        http_response_code(404);
        layout_start('غير موجود', $user);
        echo '<p>الصفحة غير موجودة. <a href="index.php">الرجوع للرئيسية</a></p>';
        layout_end();
}
