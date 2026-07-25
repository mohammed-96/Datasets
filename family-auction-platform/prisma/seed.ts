import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

const DATABASE_URL = process.env.DATABASE_URL || "file:./dev.db";
const adapter = new PrismaBetterSqlite3({ url: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BIDDER_COUNT = 10;

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

const uploadsDir = path.join(__dirname, "..", "public", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

function placeholderImage(label: string, bg: string, filename: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
  <rect width="800" height="800" fill="${bg}"/>
  <text x="400" y="420" font-size="48" text-anchor="middle" fill="white" font-family="sans-serif">${label}</text>
</svg>`;
  fs.writeFileSync(path.join(uploadsDir, filename), svg);
  return `/uploads/${filename}`;
}

async function main() {
  const adminPin = "998877";
  const admin = await prisma.user.upsert({
    where: { phone: "0500000000" },
    update: {},
    create: {
      realName: "مدير المزاد",
      phone: "0500000000",
      passwordHash: await bcrypt.hash(adminPin, 12),
      alias: "الإدارة",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  const bidderNames = [
    "عبدالله",
    "محمد",
    "خالد",
    "سارة",
    "نورة",
    "فهد",
    "منيرة",
    "تركي",
    "هند",
    "ماجد",
  ];

  const bidders = [];
  for (let i = 1; i <= BIDDER_COUNT; i++) {
    const alias = `مزايد ${pad2(i)}`;
    const phone = `05${(10000000 + i).toString()}`;
    const pin = `1${pad2(i)}${pad2(i)}`;
    const user = await prisma.user.upsert({
      where: { phone },
      update: {},
      create: {
        realName: bidderNames[i - 1] ?? `وريث ${i}`,
        phone,
        passwordHash: await bcrypt.hash(pin, 12),
        alias,
        role: "BIDDER",
        status: "ACTIVE",
      },
    });
    bidders.push({ user, pin });
  }

  const existingItems = await prisma.item.count();
  if (existingItems === 0) {
    const now = Date.now();

    const items = [
      {
        title: "سوار ذهب",
        description: "سوار ذهب أصفر بتصميم كلاسيكي",
        weightGrams: 32.4,
        karat: "21",
        condition: "جيدة جدًا",
        category: "GOLD" as const,
        internalCode: "ITM-001",
        images: [
          placeholderImage("سوار ذهب 1", "#b7791f", "item-001-a.svg"),
          placeholderImage("سوار ذهب 2", "#92600f", "item-001-b.svg"),
        ],
        auction: {
          openingPrice: 5000,
          bidIncrement: 500,
          startAt: new Date(now - 60 * 60 * 1000),
          endAt: new Date(now + 2 * 60 * 60 * 1000),
          status: "LIVE" as const,
        },
      },
      {
        title: "خاتم ألماس",
        description: "خاتم ألماس فاخر بحجر مركزي",
        weightGrams: 8.1,
        karat: "18",
        condition: "ممتازة",
        category: "DIAMOND" as const,
        internalCode: "ITM-002",
        images: [placeholderImage("خاتم ألماس", "#0e7490", "item-002-a.svg")],
        auction: {
          openingPrice: 8000,
          bidIncrement: 1000,
          startAt: new Date(now + 24 * 60 * 60 * 1000),
          endAt: new Date(now + 48 * 60 * 60 * 1000),
          status: "UPCOMING" as const,
        },
      },
      {
        title: "ساعة يد كلاسيكية",
        description: "ساعة يد رجالية سويسرية الصنع",
        condition: "جيدة",
        category: "WATCHES" as const,
        internalCode: "ITM-003",
        images: [placeholderImage("ساعة يد", "#4c1d95", "item-003-a.svg")],
        auction: {
          openingPrice: 3000,
          bidIncrement: 250,
          startAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
          endAt: new Date(now - 24 * 60 * 60 * 1000),
          status: "ENDED" as const,
        },
      },
    ];

    for (const spec of items) {
      const item = await prisma.item.create({
        data: {
          title: spec.title,
          description: spec.description,
          weightGrams: spec.weightGrams,
          karat: spec.karat,
          condition: spec.condition,
          category: spec.category,
          internalCode: spec.internalCode,
          createdById: admin.id,
          images: {
            create: spec.images.map((url, idx) => ({ url, sortOrder: idx })),
          },
        },
      });

      const auction = await prisma.auction.create({
        data: {
          itemId: item.id,
          openingPrice: spec.auction.openingPrice,
          currentPrice: spec.auction.openingPrice,
          bidIncrement: spec.auction.bidIncrement,
          startAt: spec.auction.startAt,
          endAt: spec.auction.endAt,
          originalEndAt: spec.auction.endAt,
          softCloseEnabled: true,
          extensionMinutes: 2,
          status: spec.auction.status,
        },
      });

      if (spec.auction.status !== "UPCOMING") {
        let price = spec.auction.openingPrice;
        const bidCount = spec.auction.status === "ENDED" ? 3 : 2;
        for (let i = 0; i < bidCount; i++) {
          price += spec.auction.bidIncrement;
          const bidder = bidders[i % bidders.length].user;
          await prisma.bid.create({
            data: {
              auctionId: auction.id,
              userId: bidder.id,
              amount: price,
              createdAt: new Date(spec.auction.startAt.getTime() + (i + 1) * 60 * 1000),
            },
          });
        }
        const winner = bidders[(bidCount - 1) % bidders.length].user;
        await prisma.auction.update({
          where: { id: auction.id },
          data: {
            currentPrice: price,
            ...(spec.auction.status === "ENDED"
              ? { winnerUserId: winner.id, winningBid: price }
              : {}),
          },
        });
      }
    }
  }

  console.log("Seed complete.");
  console.log("Admin login -> phone: 0500000000, pin:", adminPin);
  for (const { user, pin } of bidders) {
    console.log(`Bidder login -> alias: ${user.alias}, phone: ${user.phone}, pin: ${pin}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
