# المزاد العائلي — Family Auction Platform

A private, temporary web platform for running internal family auctions on jewelry and personal
belongings. Admin-provisioned accounts only (no self-registration), Arabic-first RTL UI,
anonymous-to-each-other bidding with a permanent audit trail.

Built with Next.js 16 (App Router), Prisma 7 (SQLite via `better-sqlite3`), and Tailwind CSS v4.

## Getting started

```bash
npm install
cp .env.example .env        # then set a real SESSION_SECRET
npx prisma migrate deploy
npm run db:seed             # creates 1 admin + 10 bidders, prints their login credentials
npm run dev
```

Visit `http://localhost:3000/login`. The seed script prints phone/PIN pairs for every account,
including the admin (`0500000000` / `998877`).

## Architecture notes

- **Auth**: phone + PIN login, bcrypt-hashed passwords, signed JWT session cookie
  (`lib/auth.ts`). Changing a user's PIN bumps `sessionVersion`, invalidating every
  previously-issued token for that user.
- **Route protection**: `proxy.ts` (Next 16's replacement for `middleware.ts`) does a cheap
  JWT-validity check on every request; pages additionally call `requireUser`/`requireAdmin`
  for the authoritative, DB-backed check.
- **Bidding engine** (`lib/bidding.ts`, `lib/auctionSync.ts`): bid placement, minimum-increment
  enforcement, self-outbid prevention, and soft-close extension all happen inside a single
  Prisma transaction. Auction status (`UPCOMING → LIVE → ENDED`) is advanced lazily on every
  read since there's no background scheduler — acceptable at this traffic scale.
- **Real-time updates**: an in-memory `EventEmitter` (`lib/events.ts`) plus a per-auction SSE
  endpoint (`app/api/auctions/[id]/stream`) push price/bid-history updates to open item pages
  without a refresh.
- **Admin mutations** (create/update user, item, auction) are implemented as plain REST route
  handlers under `app/api/admin/**` rather than React Server Actions bound to forms — this
  sidesteps a reliability issue observed with Server Actions on forms in this Next.js/Turbopack
  build. Simpler admin actions (publish/cancel/suspend/resume/toggle/delete) remain Server
  Actions since that pattern worked reliably throughout testing.
- **Privacy**: bidders only ever see aliases (`مزايد 07`, ...); phone numbers and real names
  never appear in any bidder-facing page or API response. Only the admin dashboard/API can see
  the identity behind an alias.
- **Audit log**: every bid, auction lifecycle transition, and admin action is written to an
  append-only `AuditLog` table (`app/admin/audit-log`). Bids are never deleted — a "void" status
  exists in the schema for exceptional corrections but the original row is preserved.

## Directory guide

- `app/(bidder pages)` — home dashboard, item/auction detail, my-bids, favorites, rules gate
- `app/admin/**` — admin dashboard, user/item/auction management, results, audit log
- `app/api/**` — bid placement, SSE stream, favorites toggle, admin CRUD routes
- `lib/**` — auth, validation, bidding engine, formatting, Prisma client singleton
- `prisma/seed.ts` — seeds an admin, 10 bidders, and 3 demo items/auctions (live, upcoming, ended)

## Known limitations (by design, for this MVP)

- SQLite + `better-sqlite3` is a single-connection, single-process store — fine for ~10
  concurrent bidders, not meant to scale further.
- No SMS notifications, payments, or public registration (matches the PRD's explicit scope).
- Uploaded item images are stored on local disk under `public/uploads`; a real deployment target
  should swap this for persistent object storage.
