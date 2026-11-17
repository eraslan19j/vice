import { NextResponse } from "next/server";
import { db } from "@/db";
import { garageVehicles } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    const vehicles = await db.select().from(garageVehicles).orderBy(desc(garageVehicles.id));
    if (vehicles.length === 0) {
      // Seed starter vehicles
      const starter = await db.insert(garageVehicles).values([
        {
          vehicleModel: "supercar",
          customName: "Pegassi Torero GT",
          primaryColor: "#e63946",
          secondaryColor: "#1d3557",
          topSpeedUpgrade: 2,
          armorUpgrade: 1,
          isFavorite: true,
        },
        {
          vehicleModel: "muscle",
          customName: "Vapid Dominator GTX",
          primaryColor: "#f4a261",
          secondaryColor: "#264653",
          topSpeedUpgrade: 1,
          armorUpgrade: 2,
          isFavorite: false,
        },
        {
          vehicleModel: "police",
          customName: "Vapid Police Cruiser",
          primaryColor: "#000000",
          secondaryColor: "#ffffff",
          topSpeedUpgrade: 3,
          armorUpgrade: 3,
          isFavorite: false,
        }
      ]).returning();
      return NextResponse.json({ success: true, vehicles: starter });
    }
    return NextResponse.json({ success: true, vehicles });
  } catch (error) {
    console.error("Garage error:", error);
    return NextResponse.json({
      success: false,
      vehicles: [
        {
          id: 1,
          vehicleModel: "supercar",
          customName: "Pegassi Torero GT (Offline)",
          primaryColor: "#e63946",
          secondaryColor: "#1d3557",
          topSpeedUpgrade: 2,
          armorUpgrade: 1,
          isFavorite: true,
        }
      ]
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const [vehicle] = await db.insert(garageVehicles).values({
      vehicleModel: body.vehicleModel || "supercar",
      customName: body.customName || "Custom Ride",
      primaryColor: body.primaryColor || "#e63946",
      secondaryColor: body.secondaryColor || "#111111",
      topSpeedUpgrade: body.topSpeedUpgrade || 1,
      armorUpgrade: body.armorUpgrade || 1,
      isFavorite: body.isFavorite ?? false,
    }).returning();

    return NextResponse.json({ success: true, vehicle });
  } catch (error) {
    console.error("Garage save error:", error);
    return NextResponse.json({ success: false, error: "Failed to store vehicle" }, { status: 500 });
  }
}
