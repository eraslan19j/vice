import { NextResponse } from "next/server";
import { db } from "@/db";
import { gameMissions } from "@/db/schema";

const DEFAULT_MISSIONS = [
  {
    id: "heist_bank",
    title: "Pacific Standard Heist",
    description: "Infiltrate the Downtown Pacific Vault, blow open the safe, grab $25,000 cash, and lose the 3-star police pursuit to reach the safehouse dock.",
    rewardCash: 25000,
    rewardRespect: 500,
    difficulty: "Hard",
    giver: "Lester Crest",
  },
  {
    id: "gang_turf",
    title: "Vagos Turf Ambush",
    description: "Drive to the industrial container yard, eliminate the 5 armed cartel lookouts, and confiscate their weapons stash.",
    rewardCash: 12000,
    rewardRespect: 300,
    difficulty: "Medium",
    giver: "Franklin",
  },
  {
    id: "exotic_theft",
    title: "Gone in 60 Seconds",
    description: "Locate the rare gold-trimmed Supercar parked outside the beachfront penthouse and deliver it pristine to the export crane.",
    rewardCash: 18000,
    rewardRespect: 400,
    difficulty: "Medium",
    giver: "Devin Weston",
  },
  {
    id: "vip_taxi",
    title: "High Roller VIP Rush",
    description: "Pick up the Vinewood celebrity and speed through 5 city checkpoints within 90 seconds while avoiding crashing.",
    rewardCash: 8000,
    rewardRespect: 200,
    difficulty: "Easy",
    giver: "Downtown Cab Co.",
  },
];

export async function GET() {
  try {
    const list = await db.select().from(gameMissions);
    if (list.length === 0) {
      await db.insert(gameMissions).values(DEFAULT_MISSIONS);
      return NextResponse.json({ success: true, missions: DEFAULT_MISSIONS });
    }
    return NextResponse.json({ success: true, missions: list });
  } catch (error) {
    console.error("Missions fetch error:", error);
    return NextResponse.json({ success: true, missions: DEFAULT_MISSIONS });
  }
}
