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
   to `index.php` and seeds an admin account plus 10 bidder accounts.
4. Log in with the admin account below and start adding real items/auctions —
   or just delete the demo data from **admin → القطع / المزادات** first.

That's it — no database to create in phpMyAdmin, no environment variables, no
`npm install`.

## Default seeded logins

| Alias | Phone | PIN |
|---|---|---|
| الإدارة (admin) | `0500000000` | `998877` |
| مزايد 01 | `0510000001` | `10101` |
| مزايد 02 | `0510000002` | `10202` |
| مزايد 03 | `0510000003` | `10303` |
| مزايد 04 | `0510000004` | `10404` |
| مزايد 05 | `0510000005` | `10505` |
| مزايد 06 | `0510000006` | `10606` |
| مزايد 07 | `0510000007` | `10707` |
| مزايد 08 | `0510000008` | `10808` |
| مزايد 09 | `0510000009` | `10909` |
| مزايد 10 | `0510000010` | `11010` |

**Change the admin PIN and delete/replace the demo bidder accounts before real use.**

## What's included

- Phone + PIN login (bcrypt via PHP's `password_hash`), PHP native sessions
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
