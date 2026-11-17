import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- helpers
export function colorize(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
export function cbox(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return colorize(g, color);
}

// ---------------------------------------------------------------- vehicles
export interface CarSpec {
  id: string;
  name: string;
  len: number;
  wid: number;
  maxSpeed: number;
  accel: number;
  grip: number;
  health: number;
  hull: number[][];
  cabin: number[][];
  roof: number[][] | null;
  cabinW: number;
  wheelR: number;
  colors: number[];
}
const PASTELS = [0xff5fa2, 0x29d3c8, 0xf5f0e6, 0xffc857, 0x7ec8ff, 0xb38cff, 0xff7847, 0x2a2a32, 0xd8323c, 0x49c16b];
const sedanShape = (h: number) => ({
  hull: [[-h, 0.3], [h, 0.3], [h, 0.72], [h - 0.2, 0.88], [-h + 0.1, 0.94], [-h, 0.8]],
  cabin: [[-h + 0.65, 0.92], [h - 1.3, 0.87], [h - 1.95, 1.4], [-h + 1.2, 1.42]],
  roof: [[-h + 1.15, 1.4], [h - 1.9, 1.38], [h - 1.98, 1.46], [-h + 1.22, 1.48]],
});
export const CAR_SPECS: Record<string, CarSpec> = {
  sedan: { id: 'sedan', name: 'Coral Sedan', len: 4.6, wid: 1.9, maxSpeed: 34, accel: 9, grip: 7, health: 100, ...sedanShape(2.3), cabinW: 0.86, wheelR: 0.34, colors: PASTELS },
  taxi: { id: 'taxi', name: 'Cabbie', len: 4.6, wid: 1.9, maxSpeed: 36, accel: 10, grip: 7, health: 110, ...sedanShape(2.3), cabinW: 0.86, wheelR: 0.34, colors: [0xffc21a] },
  police: { id: 'police', name: 'Patrol Cruiser', len: 4.7, wid: 1.92, maxSpeed: 46, accel: 13, grip: 8, health: 150, ...sedanShape(2.35), cabinW: 0.86, wheelR: 0.34, colors: [0xf2f2f2] },
  sport: {
    id: 'sport', name: 'Mirage Turbo', len: 4.4, wid: 1.96, maxSpeed: 54, accel: 16, grip: 8.5, health: 90,
    hull: [[-2.2, 0.26], [2.2, 0.26], [2.2, 0.5], [1.55, 0.7], [-2.0, 0.84], [-2.2, 0.78]],
    cabin: [[-1.35, 0.8], [0.75, 0.7], [-0.05, 1.12], [-0.85, 1.15]],
    roof: [[-0.9, 1.13], [-0.02, 1.1], [-0.08, 1.17], [-0.84, 1.2]],
    cabinW: 0.82, wheelR: 0.33, colors: [0xf5f0e6, 0xff2d78, 0x18c7d6, 0xffd400, 0xd8323c, 0x202028],
  },
  muscle: {
    id: 'muscle', name: 'Stingray 78', len: 4.8, wid: 1.95, maxSpeed: 45, accel: 13, grip: 6.5, health: 110,
    hull: [[-2.4, 0.32], [2.4, 0.32], [2.4, 0.74], [2.2, 0.9], [-2.3, 0.96], [-2.4, 0.84]],
    cabin: [[-1.7, 0.94], [0.55, 0.9], [-0.1, 1.36], [-1.1, 1.38]],
    roof: [[-1.15, 1.36], [-0.05, 1.34], [-0.12, 1.42], [-1.1, 1.44]],
    cabinW: 0.84, wheelR: 0.36, colors: [0xff7847, 0x2a2a32, 0x7a1fd1, 0x1b6fd6, 0xd8323c],
  },
  van: {
    id: 'van', name: 'Marlin Van', len: 5.0, wid: 2.1, maxSpeed: 29, accel: 7, grip: 6, health: 140,
    hull: [[-2.5, 0.35], [2.5, 0.35], [2.5, 1.0], [2.05, 1.18], [1.6, 1.98], [-2.5, 1.98]],
    cabin: [[0.7, 1.22], [2.06, 1.2], [1.68, 1.86], [0.7, 1.86]],
    roof: null, cabinW: 1.012, wheelR: 0.37, colors: [0xf5f0e6, 0x29d3c8, 0xffc857, 0x8a8f99, 0xff5fa2],
  },
};

function extrudeProfile(pts: number[][], width: number) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false });
  g.rotateY(-Math.PI / 2); // (l, y, w) -> (-w, y, l)
  g.translate(width / 2, 0, 0);
  return g;
}

let wheelGeo: THREE.BufferGeometry | null = null;
function getWheelGeo() {
  if (wheelGeo) return wheelGeo;
  const tire = new THREE.CylinderGeometry(1, 1, 0.26, 14);
  tire.rotateZ(Math.PI / 2);
  colorize(tire, 0x16161a);
  const hub = new THREE.CylinderGeometry(0.55, 0.55, 0.28, 10);
  hub.rotateZ(Math.PI / 2);
  colorize(hub, 0xc9ccd4);
  wheelGeo = mergeGeometries([tire, hub])!;
  return wheelGeo;
}
const wheelMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x0c1420, roughness: 0.15, metalness: 0.6 });
const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const wreckMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 1 });
const geoCache = new Map<string, { hull: THREE.BufferGeometry; cabin: THREE.BufferGeometry; roof: THREE.BufferGeometry | null; lights: THREE.BufferGeometry }>();

export interface CarRig {
  group: THREE.Group;
  chassis: THREE.Group;
  wheels: THREE.Mesh[];
  frontPivots: THREE.Group[];
  paint: THREE.MeshStandardMaterial;
  bodyMeshes: THREE.Mesh[];
  lightbar: { red: THREE.Mesh; blue: THREE.Mesh } | null;
  color: number;
}

export function buildCar(spec: CarSpec, color?: number): CarRig {
  let geos = geoCache.get(spec.id);
  const h = spec.len / 2;
  if (!geos) {
    const hw = spec.wid / 2;
    const lights = mergeGeometries([
      cbox(0.42, 0.14, 0.06, hw - 0.32, 0.62, h + 0.01, 0xfff3c4),
      cbox(0.42, 0.14, 0.06, -hw + 0.32, 0.62, h + 0.01, 0xfff3c4),
      cbox(0.46, 0.13, 0.06, hw - 0.32, 0.72, -h - 0.01, 0xff1a2a),
      cbox(0.46, 0.13, 0.06, -hw + 0.32, 0.72, -h - 0.01, 0xff1a2a),
    ])!;
    if (spec.id === 'sport') lights.translate(0, -0.2, 0);
    geos = {
      hull: extrudeProfile(spec.hull, spec.wid),
      cabin: extrudeProfile(spec.cabin, spec.wid * spec.cabinW),
      roof: spec.roof ? extrudeProfile(spec.roof, spec.wid * spec.cabinW) : null,
      lights,
    };
    geoCache.set(spec.id, geos);
  }
  const col = color ?? spec.colors[Math.floor(Math.random() * spec.colors.length)];
  const paint = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.25 });
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);
  const bodyMeshes: THREE.Mesh[] = [];
  const hull = new THREE.Mesh(geos.hull, paint);
  hull.castShadow = true;
  chassis.add(hull);
  bodyMeshes.push(hull);
  const cabin = new THREE.Mesh(geos.cabin, glassMat);
  cabin.castShadow = true;
  chassis.add(cabin);
  bodyMeshes.push(cabin);
  if (geos.roof) {
    const roof = new THREE.Mesh(geos.roof, paint);
    chassis.add(roof);
    bodyMeshes.push(roof);
  }
  chassis.add(new THREE.Mesh(geos.lights, lightMat));

  let lightbar: CarRig['lightbar'] = null;
  if (spec.id === 'police') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.wid + 0.02, 0.2, 1.9), new THREE.MeshStandardMaterial({ color: 0x15161c, roughness: 0.4 }));
    stripe.position.set(0, 0.62, -0.25);
    chassis.add(stripe);
    const mk = (c: number, x: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.26), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
      m.position.set(x, 1.55, -0.35);
      chassis.add(m);
      return m;
    };
    lightbar = { red: mk(0xff1030, -0.3), blue: mk(0x2060ff, 0.3) };
  }
  if (spec.id === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.26), new THREE.MeshBasicMaterial({ color: 0xfff1a0, toneMapped: false }));
    sign.position.set(0, 1.58, -0.3);
    chassis.add(sign);
    const checker = new THREE.Mesh(new THREE.BoxGeometry(spec.wid + 0.02, 0.1, 3.2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    checker.position.set(0, 0.7, -0.1);
    chassis.add(checker);
  }
  if (spec.id === 'sport') {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.92, 0.06, 0.38), paint);
    sp.position.set(0, 1.02, -h + 0.22);
    chassis.add(sp);
    bodyMeshes.push(sp);
    for (const sx of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.2), paint);
      st.position.set(sx * spec.wid * 0.36, 0.92, -h + 0.25);
      chassis.add(st);
      bodyMeshes.push(st);
    }
  }
  // wheels
  const wheels: THREE.Mesh[] = [];
  const frontPivots: THREE.Group[] = [];
  const wx = spec.wid / 2 - 0.12;
  const wz = h - 0.85;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * wx, spec.wheelR, sz * wz);
    const w = new THREE.Mesh(getWheelGeo(), wheelMat);
    w.scale.set(1, spec.wheelR, spec.wheelR);
    w.castShadow = true;
    pivot.add(w);
    group.add(pivot);
    wheels.push(w);
    if (sz > 0) frontPivots.push(pivot);
  }
  return { group, chassis, wheels, frontPivots, paint, bodyMeshes, lightbar, color: col };
}
export function wreckCar(rig: CarRig) {
  for (const m of rig.bodyMeshes) m.material = wreckMat;
  if (rig.lightbar) {
    rig.lightbar.red.visible = false;
    rig.lightbar.blue.visible = false;
  }
}

// ---------------------------------------------------------------- humans
const matCache = new Map<number, THREE.MeshLambertMaterial>();
function lam(color: number) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    matCache.set(color, m);
  }
  return m;
}
const HG = {
  torso: new THREE.BoxGeometry(0.44, 0.6, 0.25).translate(0, 1.18, 0),
  head: new THREE.BoxGeometry(0.25, 0.27, 0.25).translate(0, 1.63, 0),
  hair: new THREE.BoxGeometry(0.27, 0.11, 0.27).translate(0, 1.76, -0.01),
  cap: new THREE.BoxGeometry(0.28, 0.08, 0.36).translate(0, 1.79, 0.04),
  leg: new THREE.BoxGeometry(0.18, 0.9, 0.2).translate(0, -0.45, 0),
  sleeve: new THREE.BoxGeometry(0.14, 0.3, 0.15).translate(0, -0.13, 0),
  fore: new THREE.BoxGeometry(0.115, 0.36, 0.12).translate(0, -0.45, 0),
  gun: new THREE.BoxGeometry(0.06, 0.34, 0.13).translate(0, -0.74, 0.04),
  shoe: new THREE.BoxGeometry(0.19, 0.1, 0.3).translate(0, -0.86, 0.05),
};
export interface HumanRig {
  group: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  gun: THREE.Mesh;
}
export interface HumanLook {
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
  cop?: boolean;
}
const SKINS = [0xf1c9a5, 0xe0ac7e, 0xc68642, 0x8d5524, 0xffdbb5];
const SHIRTS = [0xff5fa2, 0x29d3c8, 0xffffff, 0xffc857, 0x7ec8ff, 0xb38cff, 0xff7847, 0xf04e4e, 0x49c16b, 0xfff07a, 0x222222];
const PANTS = [0x2d3a66, 0xf2ead8, 0x3b3b44, 0x8a6f4d, 0xe8e8f0, 0x1e6e8c];
const HAIRS = [0x1b1209, 0x3b2412, 0x6b4423, 0xd8b56a, 0x8a8a8a, 0x0a0a0a];
export function randomLook(): HumanLook {
  const p = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  return { shirt: p(SHIRTS), pants: p(PANTS), skin: p(SKINS), hair: p(HAIRS) };
}
export const COP_LOOK: HumanLook = { shirt: 0x2b4fa8, pants: 0x1a2038, skin: 0xe0ac7e, hair: 0x15182a, cop: true };
export const PLAYER_LOOK: HumanLook = { shirt: 0x1e9bf0, pants: 0x3a5488, skin: 0xe0ac7e, hair: 0x1b1209 };

export function buildHuman(look: HumanLook): HumanRig {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const add = (geo: THREE.BufferGeometry, color: number, parent: THREE.Object3D = group) => {
    const m = new THREE.Mesh(geo, lam(color));
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  add(HG.torso, look.shirt);
  add(HG.head, look.skin);
  add(look.cop ? HG.cap : HG.hair, look.hair);
  const limb = (x: number, y: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    group.add(g);
    return g;
  };
  const armL = limb(0.29, 1.44);
  const armR = limb(-0.29, 1.44);
  const legL = limb(0.11, 0.9);
  const legR = limb(-0.11, 0.9);
  for (const a of [armL, armR]) {
    add(HG.sleeve, look.shirt, a);
    add(HG.fore, look.skin, a);
  }
  for (const l of [legL, legR]) {
    add(HG.leg, look.pants, l);
    add(HG.shoe, 0x1a1a1a, l);
  }
  const gun = add(HG.gun, 0x18181c, armR);
  gun.visible = false;
  return { group, armL, armR, legL, legR, gun };
}

/** Procedural limb animation. speed in m/s, phase accumulates outside. */
export function animateHuman(rig: HumanRig, phase: number, speed: number, pose: 'move' | 'aim' | 'punch' | 'down', t = 0) {
  const amp = Math.min(1, speed / 4.5) * 0.95;
  const s = Math.sin(phase) * amp;
  rig.legL.rotation.x = s;
  rig.legR.rotation.x = -s;
  rig.armL.rotation.x = -s * 0.8;
  rig.armR.rotation.x = s * 0.8;
  rig.armL.rotation.z = 0.06;
  rig.armR.rotation.z = -0.06;
  if (pose === 'aim') {
    rig.armR.rotation.x = -Math.PI / 2 + 0.05;
    rig.armL.rotation.x = -s * 0.3;
  } else if (pose === 'punch') {
    const k = Math.sin(Math.min(1, t) * Math.PI);
    rig.armR.rotation.x = -1.7 * k;
    rig.armL.rotation.x = -0.6;
  } else if (pose === 'down') {
    rig.legL.rotation.x = 0.1;
    rig.legR.rotation.x = -0.1;
    rig.armL.rotation.x = -0.4;
    rig.armR.rotation.x = 0.3;
    rig.armL.rotation.z = 0.9;
    rig.armR.rotation.z = -0.9;
  }
}

// ---------------------------------------------------------------- props
export function makePalmGeometries() {
  // trunk: gently curved stack of segments
  const segs: THREE.BufferGeometry[] = [];
  const H = 8;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const r0 = 0.24 - t0 * 0.09;
    const g = new THREE.CylinderGeometry(r0 - 0.02, r0, H / n + 0.05, 6);
    const bend = Math.sin(t0 * 1.4) * 0.9;
    g.translate(bend, (i + 0.5) * (H / n), 0);
    segs.push(colorize(g, i % 2 ? 0x8a6a48 : 0x7a5c3c));
  }
  const trunk = mergeGeometries(segs)!;
  const topX = Math.sin(1.4) * 0.9;
  // fronds
  const fronds: THREE.BufferGeometry[] = [];
  const count = 9;
  for (let i = 0; i < count; i++) {
    const g = new THREE.PlaneGeometry(0.9, 3.6, 1, 5);
    g.rotateX(-Math.PI / 2); // lie flat, length along z
    g.translate(0, 0, 1.8);
    const pos = g.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const z = pos.getZ(v);
      const k = z / 3.6;
      pos.setY(v, 0.5 * k - 1.9 * k * k + (i % 2) * 0.25);
      pos.setX(v, pos.getX(v) * (1 - k * 0.85));
    }
    g.rotateY((i / count) * Math.PI * 2 + (i % 2) * 0.2);
    g.translate(topX, H, 0);
    g.computeVertexNormals();
    fronds.push(colorize(g, i % 3 === 0 ? 0x2f9e44 : i % 3 === 1 ? 0x37b24d : 0x2b8a3e));
  }
  const nut = new THREE.SphereGeometry(0.32, 6, 5);
  nut.translate(topX, H - 0.1, 0);
  fronds.push(colorize(nut, 0x5c4326));
  return { trunk, leaves: mergeGeometries(fronds)! };
}

export type PickupKind = 'health' | 'armor' | 'pistol' | 'smg' | 'shotgun' | 'cash' | 'package';
export function buildPickup(kind: PickupKind) {
  const g = new THREE.Group();
  const basic = (c: number) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  const std = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, emissive: c, emissiveIntensity: 0.25 });
  let glow = 0xff5fa2;
  if (kind === 'health') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.18), basic(0xff2d55)));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), basic(0xff2d55)));
    glow = 0xff2d55;
  } else if (kind === 'armor') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.2, 0.5, 6), std(0x3aa0ff));
    m.scale.z = 0.4;
    g.add(m);
    glow = 0x3aa0ff;
  } else if (kind === 'cash') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.22), basic(0x3ddc68)));
    glow = 0x3ddc68;
  } else if (kind === 'package') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.6, 6), std(0x26d07c));
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), std(0xffd23f));
    h.position.y = 0.42;
    g.add(b, h);
    glow = 0x26d07c;
  } else {
    const len = kind === 'pistol' ? 0.34 : kind === 'smg' ? 0.5 : 0.85;
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(len, 0.09, 0.07), std(0x2a2a30));
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.07), std(0x4a3524));
    grip.position.set(-len / 2 + 0.08, -0.13, 0);
    g.add(barrel, grip);
    if (kind === 'smg') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.06), std(0x2a2a30));
      mag.position.set(0.05, -0.15, 0);
      g.add(mag);
    }
    glow = 0xff5fa2;
  }
  return { mesh: g, glow };
}
