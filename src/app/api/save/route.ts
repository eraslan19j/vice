import { NextResponse } from "next/server";
import { db } from "@/db";
import { gameSaves } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  try {
    const saves = await db.select().from(gameSaves).orderBy(desc(gameSaves.id)).limit(1);
    if (saves.length > 0) {
      return NextResponse.json({ success: true, save: saves[0] });
    }
    // Return default save
    const [newSave] = await db.insert(gameSaves).values({
      playerName: "Tommy 'V' Vance",
      cash: 12500,
      health: 100,
      armor: 50,
      wantedStars: 0,
      currentWeapon: "pistol",
      weaponsUnlocked: ["fist", "pistol", "smg", "shotgun", "rpg"],
      stats: {
        kills: 12,
        carsStolen: 4,
        distanceDrivenKm: 8.5,
        missionsCompleted: 1,
        heistsCompleted: 0,
      },
      posX: 0,
      posY: 2,
      posZ: 0,
    }).returning();

    return NextResponse.json({ success: true, save: newSave });
  } catch (error) {
    console.error("Failed to load save:", error);
    return NextResponse.json({
      success: false,
      fallback: {
        playerName: "Player 1",
        cash: 10000,
        health: 100,
        armor: 50,
        wantedStars: 0,
        currentWeapon: "pistol",
        weaponsUnlocked: ["fist", "pistol", "smg", "shotgun"],
        stats: { kills: 0, carsStolen: 0, distanceDrivenKm: 0, missionsCompleted: 0, heistsCompleted: 0 }
      }
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, cash, health, armor, wantedStars, currentWeapon, weaponsUnlocked, stats, posX, posY, posZ } = body;

    if (id) {
      const [updated] = await db.update(gameSaves).set({
        cash: cash ?? 5000,
        health: health ?? 100,
        armor: armor ?? 0,
        wantedStars: wantedStars ?? 0,
        currentWeapon: currentWeapon ?? "pistol",
        weaponsUnlocked: weaponsUnlocked ?? ["fist", "pistol"],
        stats: stats ?? { kills: 0, carsStolen: 0, distanceDrivenKm: 0, missionsCompleted: 0, heistsCompleted: 0 },
        posX: Math.round(posX ?? 0),
        posY: Math.round(posY ?? 2),
        posZ: Math.round(posZ ?? 0),
        savedAt: new Date(),
      }).where(eq(gameSaves.id, id)).returning();
      return NextResponse.json({ success: true, save: updated });
    }

    const [created] = await db.insert(gameSaves).values({
      playerName: body.playerName || "Player",
      cash: cash ?? 5000,
      health: health ?? 100,
      armor: armor ?? 0,
      wantedStars: wantedStars ?? 0,
      currentWeapon: currentWeapon ?? "pistol",
      weaponsUnlocked: weaponsUnlocked ?? ["fist", "pistol"],
      stats: stats ?? { kills: 0, carsStolen: 0, distanceDrivenKm: 0, missionsCompleted: 0, heistsCompleted: 0 },
      posX: Math.round(posX ?? 0),
      posY: Math.round(posY ?? 2),
      posZ: Math.round(posZ ?? 0),
    }).returning();

    return NextResponse.json({ success: true, save: created });
  } catch (error) {
    console.error("Save error:", error);
    return NextResponse.json({ success: false, error: "Failed to save game" }, { status: 500 });
  }
}
