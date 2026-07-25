import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { placeBid, BidError } from "@/lib/bidding";
import { bidSchema } from "@/lib/validation";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!user.acceptedRulesAt) {
    return NextResponse.json(
      { error: "يجب الموافقة على قواعد المزاد أولًا", code: "RULES_REQUIRED" },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = bidSchema.safeParse({ auctionId: id, amount: body?.amount });
  if (!parsed.success) {
    return NextResponse.json({ error: "قيمة المزايدة غير صحيحة" }, { status: 400 });
  }

  try {
    const outcome = await placeBid(user.id, id, parsed.data.amount);
    return NextResponse.json({
      ok: true,
      currentPrice: outcome.auction.currentPrice,
      endAt: outcome.auction.endAt.toISOString(),
      extended: outcome.extended,
    });
  } catch (err) {
    if (err instanceof BidError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}
