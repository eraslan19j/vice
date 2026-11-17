import { pgTable, text, serial, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

export const gameSaves = pgTable("game_saves", {
  id: serial("id").primaryKey(),
  playerName: text("player_name").notNull().default("Franklin"),
  cash: integer("cash").notNull().default(5000),
  health: integer("health").notNull().default(100),
  armor: integer("armor").notNull().default(50),
  wantedStars: integer("wanted_stars").notNull().default(0),
  currentWeapon: text("current_weapon").notNull().default("pistol"),
  weaponsUnlocked: jsonb("weapons_unlocked").$type<string[]>().notNull().default(["pistol", "smg"]),
  stats: jsonb("stats").$type<{
    kills: number;
    carsStolen: number;
    distanceDrivenKm: number;
    missionsCompleted: number;
    heistsCompleted: number;
  }>().notNull().default({
    kills: 0,
    carsStolen: 0,
    distanceDrivenKm: 0,
    missionsCompleted: 0,
    heistsCompleted: 0,
  }),
  posX: integer("pos_x").notNull().default(0),
  posY: integer("pos_y").notNull().default(2),
  posZ: integer("pos_z").notNull().default(0),
  savedAt: timestamp("saved_at").defaultNow().notNull(),
});

export const garageVehicles = pgTable("garage_vehicles", {
  id: serial("id").primaryKey(),
  vehicleModel: text("vehicle_model").notNull(),
  customName: text("custom_name").notNull(),
  primaryColor: text("primary_color").notNull().default("#e74c3c"),
  secondaryColor: text("secondary_color").notNull().default("#111111"),
  topSpeedUpgrade: integer("top_speed_upgrade").notNull().default(1),
  armorUpgrade: integer("armor_upgrade").notNull().default(1),
  isFavorite: boolean("is_favorite").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const leaderboards = pgTable("leaderboards", {
  id: serial("id").primaryKey(),
  playerName: text("player_name").notNull(),
  category: text("category").notNull(), // 'heist_time', 'stunt_points', 'total_score', 'wanted_survival'
  score: integer("score").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const gameMissions = pgTable("game_missions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  rewardCash: integer("reward_cash").notNull(),
  rewardRespect: integer("reward_respect").notNull(),
  difficulty: text("difficulty").notNull().default("Medium"),
  giver: text("giver").notNull().default("Lester"),
});
