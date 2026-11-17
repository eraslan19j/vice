// Shared constants, city grid maths and small helpers.

export const NX = 8; // number of north-south roads
export const NZ = 8; // number of east-west roads
export const PITCH = 84; // distance between road centre lines
export const ROAD_W = 16; // curb to curb
export const BLOCK = PITCH - ROAD_W; // 68
export const HALF_W = ((NX - 1) * PITCH) / 2;
export const HALF_D = ((NZ - 1) * PITCH) / 2;
export const SIDEWALK = 5;
export const CURB_H = 0.16;
export const LANES = [1.75, 5.25];

export const roadX = (i: number) => i * PITCH - HALF_W;
export const roadZ = (j: number) => j * PITCH - HALF_D;
export const blockCenter = (bi: number, bj: number) => ({ x: roadX(bi) + PITCH / 2, z: roadZ(bj) + PITCH / 2 });

// Island extents (sand). The play area is slightly smaller (invisible walls).
export const ISLAND = {
  minX: -HALF_W - ROAD_W / 2 - 50,
  maxX: HALF_W + ROAD_W / 2 + 100,
  minZ: -HALF_D - ROAD_W / 2 - 50,
  maxZ: HALF_D + ROAD_W / 2 + 50,
};
export const WALL_INSET = 14;

// Rapier interaction groups: (membership << 16) | filter
export const G_STATIC = (0x0001 << 16) | 0xffff;
export const G_CAR = (0x0002 << 16) | (0x0001 | 0x0002 | 0x0008);
export const G_PLAYER = (0x0004 << 16) | 0x0000;
export const G_QUERY = (0x0008 << 16) | (0x0001 | 0x0002);
export const G_QUERY_STATIC = (0x0008 << 16) | 0x0001;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 1, b?: number) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
export function angleDiff(a: number, b: number) {
  // shortest signed difference a - b in [-PI, PI]
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** true if the point lies on asphalt inside the road grid */
export function isRoad(x: number, z: number) {
  const u = x + HALF_W;
  const v = z + HALF_D;
  const h = ROAD_W / 2;
  if (u < -h || u > 2 * HALF_W + h || v < -h || v > 2 * HALF_D + h) return false;
  const mu = ((u % PITCH) + PITCH) % PITCH;
  const mv = ((v % PITCH) + PITCH) % PITCH;
  return mu < h || mu > PITCH - h || mv < h || mv > PITCH - h;
}
export function insideGrid(x: number, z: number) {
  const h = ROAD_W / 2;
  return x > -HALF_W - h && x < HALF_W + h && z > -HALF_D - h && z < HALF_D + h;
}
/** visual ground height (sidewalk slabs are raised a little) */
export function groundHeight(x: number, z: number) {
  if (!insideGrid(x, z)) return 0;
  return isRoad(x, z) ? 0 : CURB_H;
}

export function zoneName(x: number, z: number) {
  if (x > roadX(6) - 8) return 'Flamingo Beach';
  if (x < roadX(2)) return 'Port Marlin';
  if (z < roadZ(2)) return 'Palm Heights';
  if (z > roadZ(5)) return 'Little Bahia';
  return 'Downtown';
}

// forward/right vectors for a yaw (local +Z is forward)
export const fwdX = (yaw: number) => Math.sin(yaw);
export const fwdZ = (yaw: number) => Math.cos(yaw);

export type Quality = 'low' | 'medium' | 'high';
export interface Settings {
  quality: Quality;
  music: number;
  sfx: number;
  sensitivity: number;
}
export const defaultSettings = (): Settings => {
  const coarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return { quality: coarse ? 'low' : 'high', music: 0.6, sfx: 0.8, sensitivity: 1 };
};
export const QUALITY = {
  low: { cars: 8, peds: 12, shadows: 0, bloom: false, dpr: 1.25 },
  medium: { cars: 11, peds: 18, shadows: 1024, bloom: false, dpr: 1.5 },
  high: { cars: 14, peds: 26, shadows: 2048, bloom: true, dpr: 2 },
};

export interface WeaponDef {
  id: string;
  name: string;
  dmg: number;
  cd: number;
  range: number;
  pellets: number;
  spread: number;
  clip: number;
}
export const WEAPONS: Record<string, WeaponDef> = {
  fist: { id: 'fist', name: 'Fist', dmg: 25, cd: 0.45, range: 1.7, pellets: 0, spread: 0, clip: 0 },
  pistol: { id: 'pistol', name: 'Pistol', dmg: 34, cd: 0.3, range: 60, pellets: 1, spread: 0.01, clip: 34 },
  smg: { id: 'smg', name: 'Micro SMG', dmg: 18, cd: 0.085, range: 55, pellets: 1, spread: 0.035, clip: 90 },
  shotgun: { id: 'shotgun', name: 'Shotgun', dmg: 16, cd: 0.85, range: 32, pellets: 7, spread: 0.09, clip: 16 },
};
export const WEAPON_ORDER = ['fist', 'pistol', 'smg', 'shotgun'];

export interface HudState {
  health: number;
  armor: number;
  money: number;
  wanted: number;
  wantedFlash: boolean;
  weapon: string;
  ammo: number;
  clock: string;
  zone: string;
  vehicle: string;
  inVehicle: boolean;
  canEnter: boolean;
  isTaxi: boolean;
  speed: number;
  subtitle: string;
  help: string;
  big: { kind: 'passed' | 'failed' | 'wasted' | 'busted'; text: string; sub: string } | null;
  timer: string;
  radio: string;
  radioTick: number;
  packages: number;
  missions: number;
}
