import { NextResponse } from "next/server";
import { db } from "@/db";
import { leaderboards } from "@/db/schema";
import { desc } from "drizzle-orm";

const DEFAULT_SCORES = [
  { playerName: "Trevor_Rampage", category: "total_score", score: 98450, details: "5 Stars survived for 14 min" },
  { playerName: "Michael_Vault", category: "total_score", score: 84200, details: "Pacific Standard clean escape" },
  { playerName: "Franklin_Drift", category: "total_score", score: 71900, details: "12,400m drift streak" },
  { playerName: "Niko_B", category: "total_score", score: 62500, details: "32 Cartel targets eliminated" },
  { playerName: "CJ_Grove", category: "total_score", score: 54000, details: "All gang turf defended" },
];

export async function GET() {
  try {
    const scores = await db.select().from(leaderboards).orderBy(desc(leaderboards.score)).limit(10);
    if (scores.length === 0) {
      await db.insert(leaderboards).values(DEFAULT_SCORES);
      return NextResponse.json({ success: true, scores: DEFAULT_SCORES });
    }
    return NextResponse.json({ success: true, scores });
  } catch (error) {
    console.error("Leaderboard fetch error:", error);
    return NextResponse.json({ success: true, scores: DEFAULT_SCORES });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const [entry] = await db.insert(leaderboards).values({
      playerName: body.playerName || "Player",
      category: body.category || "total_score",
      score: body.score || 0,
      details: body.details || "Grand Theft Auto record",
    }).returning();

    return NextResponse.json({ success: true, entry });
  } catch (error) {
    console.error("Leaderboard post error:", error);
    return NextResponse.json({ success: false, error: "Failed to record score" }, { status: 500 });
  }
}
