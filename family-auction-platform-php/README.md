# المزاد العائلي — single-file PHP edition

Everything — routing, database, and HTML — lives in **`index.php`**. No build step,
no Node.js, no Composer. Just upload the file (plus the empty `uploads/` folder) to
any PHP host and it works.

## Requirements

- PHP 7.4+ (tested on 8.4) with the `pdo_sqlite` extension enabled — this is on by
  default on almost every shared host, including standard cPanel/CloudLinux setups.

## Deploying to cPanel (no SSH needed)

1. **File Manager** → upload `index.php` into the folder your domain/subdomain
   points to (e.g. `public_html` or a subdomain's document root).
2. Create an empty **`uploads`** folder next to it (File Manager → "+ Folder"), and
   make sure it's writable (right-click → Permissions → `755`, or `775` if uploads
   fail).
3. Visit the site. The very first request auto-creates `auction.db` (SQLite) next
   to `index.php` and seeds a single admin account — no demo bidders, items, or
   auctions.
4. Log in with the admin account below, then add real bidders from
   **admin → المستخدمون** and real items/auctions from **admin → القطع / المزادات**.

That's it — no database to create in phpMyAdmin, no environment variables, no
`npm install`.

## Default seeded login

| Alias | Phone | PIN |
|---|---|---|
| الإدارة (admin) | `0500000000` | `998877` |

**Change the admin PIN after first login.** No other accounts are created —
add every real bidder yourself from the admin panel.

## What's included

- Phone + PIN login (bcrypt via PHP's `password_hash`), PHP native sessions
- **Public browsing** — anyone can view the catalogue, item pages and live prices
  without an account. Bidding, "مزايداتي" and the admin area still require a login.
- **Audible bid feedback** — an approved bid plays a rising chime and says
  "تمت المزايدة"; a rejected one plays a low tone and says "لم تتم المزايدة".
  Generated in the browser, so there are no audio files to upload.
- Alias-only bidder identity — real names/phones are only ever shown to the admin
- Bidding with minimum-increment enforcement, self-outbid prevention, and
  soft-close anti-sniping (extends the auction if a bid lands in the last N minutes)
- Live-ish price/timer/bid-history updates via lightweight polling (no WebSockets)
- Admin: users, items (with image upload), auctions (draft → publish → live,
  suspend/resume, cancel), results board, append-only audit log

## Deliberately left out (vs. the full Next.js version), to keep this one file simple

- No SMS notifications, no login rate limiting, no favorites
- No cron/scheduler: auction status (`upcoming → live → ended`) advances lazily
  whenever a page reads that auction — fine at this traffic scale
- Single SQLite file — great for ~10 users, not meant to scale further

## Local testing

```bash
php -S 127.0.0.1:8000 index.php
```
Then open `http://127.0.0.1:8000/index.php`.
