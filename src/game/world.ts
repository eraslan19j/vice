import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  NX, NZ, PITCH, ROAD_W, BLOCK, HALF_W, HALF_D, SIDEWALK, CURB_H, ISLAND, WALL_INSET, G_STATIC,
  roadX, roadZ, blockCenter, mulberry32,
} from './config';
import {
  makeWindowTextures, makeRoadTexture, makeZebraTexture, makeAsphaltTexture, makeSidewalkTexture,
  makeSandTexture, makeGrassTexture, makeSignTexture,
} from './textures';
import { cbox, colorize, makePalmGeometries } from './models';

export type BlockType = 'beach' | 'downtown' | 'port' | 'heights' | 'bahia' | 'park' | 'lot';
export function blockType(bi: number, bj: number): BlockType {
  if ((bi === 3 && bj === 5) || (bi === 5 && bj === 1)) return 'park';
  if ((bi === 1 && bj === 2) || (bi === 5 && bj === 5)) return 'lot';
  if (bi === 6) return 'beach';
  if (bi <= 1) return 'port';
  if (bj <= 1) return 'heights';
  if (bj >= 5) return 'bahia';
  return 'downtown';
}
const CS = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; // NW, NE, SE, SW
export function cornerPos(bi: number, bj: number, c: number, inset = 2.5) {
  const b = blockCenter(bi, bj);
  const k = BLOCK / 2 - inset;
  return { x: b.x + CS[c][0] * k, z: b.z + CS[c][1] * k };
}
export interface Corner { bi: number; bj: number; c: number }
export function cornerNeighbors(n: Corner): Corner[] {
  const out: Corner[] = [
    { bi: n.bi, bj: n.bj, c: (n.c + 1) % 4 },
    { bi: n.bi, bj: n.bj, c: (n.c + 3) % 4 },
  ];
  const [sx, sz] = CS[n.c];
  const xb = n.bi + sx;
  const zb = n.bj + sz;
  const flipX = [1, 0, 3, 2][n.c];
  const flipZ = [3, 2, 1, 0][n.c];
  if (xb >= 0 && xb <= NX - 2) out.push({ bi: xb, bj: n.bj, c: flipX });
  if (zb >= 0 && zb <= NZ - 2) out.push({ bi: n.bi, bj: zb, c: flipZ });
  return out;
}

class Batch {
  pos: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  quad(cx: number, cz: number, sx: number, sz: number, y: number, alongX: boolean, uRep: number, vRep: number) {
    const b = this.pos.length / 3;
    const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    this.pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    if (alongX) this.uv.push(0, 0, 0, vRep, uRep, vRep, uRep, 0);
    else this.uv.push(0, 0, uRep, 0, uRep, vRep, 0, vRep);
    this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const n = new Float32Array(this.pos.length);
    for (let i = 1; i < n.length; i += 3) n[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    g.setIndex(this.idx);
    return g;
  }
}

export interface ParkSpot { x: number; z: number; yaw: number; kind?: string }
export interface WorldData {
  buildingMats: THREE.MeshStandardMaterial[];
  bulbMat: THREE.MeshBasicMaterial;
  ocean: THREE.Mesh;
  oceanMat: THREE.MeshStandardMaterial;
  parked: ParkSpot[];
  start: { x: number; z: number; yaw: number };
  hospital: { x: number; z: number };
  police: { x: number; z: number };
  spray: { x: number; z: number };
  beacons: THREE.Mesh[];
}

const SIGNS: [string, string, boolean][] = [
  ['Flamingo', '#ff4fa3', true], ['CLUB TROPIC', '#27e0d6', false], ['Pink Pelican', '#ff7ac8', true],
  ['SUNSET MOTEL', '#ffb347', false], ['Neon Palms', '#7dff8a', true], ['ARCADE', '#b58cff', false],
  ['PIZZA', '#ff5a4a', false], ['Ocean Breeze', '#5ad1ff', true], ['HOTEL CORAL', '#ff8fb8', false],
  ['BAR', '#ffe14a', false], ['Mambo Room', '#ff4fa3', true], ['DINER', '#27e0d6', false],
];
const PAL = {
  beach: [0xffb3c7, 0xa8ecd8, 0xfff0b8, 0xb8dcff, 0xffd0a8, 0xe3c8ff, 0xffffff, 0xff9eb5, 0x9be7e0],
  downtown: [0xbfe3ff, 0x9fd8d0, 0xffc9a8, 0xd8c8ff, 0xffffff, 0xa8c0d8, 0xffb8d0],
  port: [0xcfc8b8, 0xb8b8b8, 0xc79a7a, 0x9aa7b0, 0xe6dcc8],
  heights: [0xffffff, 0xffe8d6, 0xfff5c8, 0xd8f0ff, 0xffd8e0],
  bahia: [0xffa64d, 0xff7a90, 0x5fd4c8, 0xffe066, 0x8fb8ff, 0xf2f2f2, 0xd99aff],
};
const ACCENT = [0xff4fa3, 0x27e0d6, 0xffffff, 0xffc857, 0x7ec8ff, 0xff7847];

export function buildWorld(scene: THREE.Scene, pw: RAPIER.World, R: typeof RAPIER, shadows: boolean): WorldData {
  const r = mulberry32(1986);
  const pickc = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const root = new THREE.Group();
  scene.add(root);

  const fixed = (hx: number, hy: number, hz: number, x: number, y: number, z: number) =>
    pw.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setCollisionGroups(G_STATIC));

  // ground + boundary walls
  fixed(3000, 1, 3000, 0, -1, 0);
  const wx0 = ISLAND.minX + WALL_INSET, wx1 = ISLAND.maxX - WALL_INSET, wz0 = ISLAND.minZ + WALL_INSET, wz1 = ISLAND.maxZ - WALL_INSET;
  fixed(2, 20, 600, wx0 - 2, 20, 0);
  fixed(2, 20, 600, wx1 + 2, 20, 0);
  fixed(600, 20, 2, 0, 20, wz0 - 2);
  fixed(600, 20, 2, 0, 20, wz1 + 2);

  // ---------------------------------------------------------- terrain
  const shape = new THREE.Shape();
  const rr = 46;
  const { minX, maxX } = ISLAND;
  const y0 = -ISLAND.maxZ, y1 = -ISLAND.minZ;
  shape.moveTo(minX + rr, y0);
  shape.lineTo(maxX - rr, y0);
  shape.quadraticCurveTo(maxX, y0, maxX, y0 + rr);
  shape.lineTo(maxX, y1 - rr);
  shape.quadraticCurveTo(maxX, y1, maxX - rr, y1);
  shape.lineTo(minX + rr, y1);
  shape.quadraticCurveTo(minX, y1, minX, y1 - rr);
  shape.lineTo(minX, y0 + rr);
  shape.quadraticCurveTo(minX, y0, minX + rr, y0);
  const sandGeo = new THREE.ShapeGeometry(shape, 8);
  {
    const uv = sandGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 6, uv.getY(i) / 6);
  }
  sandGeo.rotateX(-Math.PI / 2);
  const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ map: makeSandTexture(), roughness: 1 }));
  sand.position.y = -0.05;
  sand.receiveShadow = true;
  root.add(sand);

  const oceanMat = new THREE.MeshStandardMaterial({ color: 0x1fb7c9, roughness: 0.22, metalness: 0.15 });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), oceanMat);
  ocean.position.y = -0.5;
  root.add(ocean);

  // ---------------------------------------------------------- roads
  const road = new Batch(), zebra = new Batch(), asphalt = new Batch();
  const seg = PITCH - ROAD_W;
  for (let i = 0; i < NX; i++)
    for (let j = 0; j < NZ; j++) {
      const x = roadX(i), z = roadZ(j);
      asphalt.quad(x, z, ROAD_W, ROAD_W, 0, false, 2, 2);
      if (j < NZ - 1) {
        const zc = z + PITCH / 2;
        zebra.quad(x, z + ROAD_W / 2 + 2, ROAD_W, 4, 0, false, 1, 1);
        zebra.quad(x, z + PITCH - ROAD_W / 2 - 2, ROAD_W, 4, 0, false, 1, 1);
        road.quad(x, zc, ROAD_W, seg - 8, 0, false, 1, (seg - 8) / 8);
      }
      if (i < NX - 1) {
        const xc = x + PITCH / 2;
        zebra.quad(x + ROAD_W / 2 + 2, z, 4, ROAD_W, 0, true, 1, 1);
        zebra.quad(x + PITCH - ROAD_W / 2 - 2, z, 4, ROAD_W, 0, true, 1, 1);
        road.quad(xc, z, seg - 8, ROAD_W, 0, true, 1, (seg - 8) / 8);
      }
    }
  // beach-side parking strip
  asphalt.quad(HALF_W + ROAD_W / 2 + 3.5, 0, 7, 2 * HALF_D + ROAD_W, 0, false, 1, 80);
  const mkGround = (b: Batch, map: THREE.Texture) => {
    const m = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ map, roughness: 0.95 }));
    m.receiveShadow = true;
    root.add(m);
  };
  const asphaltTex = makeAsphaltTexture();
  mkGround(road, makeRoadTexture());
  mkGround(zebra, makeZebraTexture());
  mkGround(asphalt, asphaltTex);

  // ---------------------------------------------------------- blocks
  const slabGeos: Record<string, THREE.BufferGeometry[]> = { walk: [], grass: [], lot: [] };
  const lawn = new Batch();
  const bGeos: THREE.BufferGeometry[][] = [[], [], []];
  const props: THREE.BufferGeometry[] = [];
  const palms: { x: number; z: number }[] = [];
  const lamps: { x: number; z: number }[] = [];
  const signs: { x: number; y: number; z: number; rot: number; w: number; idx: number; text?: string }[] = [];
  const beaconPos: THREE.Vector3[] = [];
  const parked: ParkSpot[] = [];
  let signCounter = 0;

  const buildingBox = (style: number, w: number, h: number, d: number, x: number, yBase: number, z: number, color: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const nu = Math.max(1, Math.round(w / 3.2)) / 8;
    const nd = Math.max(1, Math.round(d / 3.2)) / 8;
    const nv = Math.max(1, Math.round(h / 3.3)) / 8;
    const ou = Math.floor(r() * 8) / 8, ov = Math.floor(r() * 8) / 8;
    for (let f = 0; f < 6; f++)
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        if (f === 2 || f === 3) uv.setXY(i, 0.002, 0.002);
        else uv.setXY(i, uv.getX(i) * (f < 2 ? nd : nu) + ou, uv.getY(i) * nv + ov);
      }
    g.translate(x, yBase + h / 2, z);
    bGeos[style].push(colorize(g, color));
  };

  for (let bi = 0; bi < NX - 1; bi++)
    for (let bj = 0; bj < NZ - 1; bj++) {
      const type = blockType(bi, bj);
      const { x: cx, z: cz } = blockCenter(bi, bj);
      const slab = new THREE.BoxGeometry(BLOCK, CURB_H, BLOCK);
      {
        const uv = slab.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 17, uv.getY(i) * 17);
      }
      slab.translate(cx, CURB_H / 2, cz);
      slabGeos[type === 'park' ? 'grass' : type === 'lot' ? 'lot' : 'walk'].push(slab);

      // street lamps on the corners
      for (const [sx, sz] of CS) lamps.push({ x: cx + sx * (BLOCK / 2 - 1), z: cz + sz * (BLOCK / 2 - 1) });
      // sidewalk palms
      const palmOff = type === 'downtown' || type === 'port' ? [0] : [-17, 17];
      if (type !== 'lot')
        for (const o of palmOff)
          for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (type === 'port' && r() < 0.5) continue;
            const e = BLOCK / 2 - 1.4;
            palms.push({ x: cx + (sx ? sx * e : o), z: cz + (sz ? sz * e : o) });
          }

      if (type === 'park') {
        for (let k = 0; k < 14; k++) palms.push({ x: cx + (r() - 0.5) * 50, z: cz + (r() - 0.5) * 50 });
        // little fountain plaza
        props.push(cbox(9, 0.5, 9, cx, CURB_H + 0.25, cz, 0xe8ddd2));
        props.push(cbox(6.5, 0.2, 6.5, cx, CURB_H + 0.55, cz, 0x49c7e8));
        fixed(4.5, 0.6, 4.5, cx, 0.6, cz);
        continue;
      }
      if (type === 'lot') {
        for (let k = 0; k < 5; k++) {
          parked.push({ x: cx - 20 + k * 10, z: cz - 14, yaw: 0 });
          parked.push({ x: cx - 20 + k * 10, z: cz + 14, yaw: Math.PI });
        }
        props.push(cbox(4, 3, 4, cx, CURB_H + 1.5, cz, 0xf2ead8));
        props.push(cbox(5, 0.3, 5, cx, CURB_H + 3.1, cz, 0xff4fa3));
        fixed(2, 2, 2, cx, 2, cz);
        continue;
      }

      const inner = BLOCK - 2 * SIDEWALK;
      let nx = 2, nz = 2, gap = 4, hMin = 8, hMax = 20;
      let styles = [0];
      if (type === 'beach') { nx = 2; nz = 3; hMin = 10; hMax = 24; styles = [2, 2, 0]; }
      else if (type === 'downtown') { nx = 1 + Math.floor(r() * 2); nz = 1 + Math.floor(r() * 2); hMin = 38; hMax = 105; styles = [1, 1, 1, 2]; gap = 6; }
      else if (type === 'port') { nx = 1 + Math.floor(r() * 2); nz = 1 + Math.floor(r() * 2); hMin = 7; hMax = 13; }
      else if (type === 'heights') { nx = 3; nz = 3; hMin = 5; hMax = 9; gap = 8; lawn.quad(cx, cz, inner, inner, CURB_H + 0.02, false, 12, 12); }
      else { nx = 2 + Math.floor(r() * 2); nz = 2 + Math.floor(r() * 2); hMin = 8; hMax = 28; styles = [0, 2]; }
      const cw = inner / nx, cd = inner / nz;
      const special = bi === 4 && bj === 5 ? 'HOSPITAL' : bi === 2 && bj === 1 ? 'POLICE' : bi === 1 && bj === 5 ? "SPRAY 'N' GO" : '';
      let specialDone = false;
      for (let ix = 0; ix < nx; ix++)
        for (let iz = 0; iz < nz; iz++) {
          if (type === 'heights' && ix === 1 && iz === 1) {
            for (let k = 0; k < 3; k++) palms.push({ x: cx + (r() - 0.5) * 12, z: cz + (r() - 0.5) * 12 });
            props.push(cbox(8, 0.12, 5, cx, CURB_H + 0.08, cz, 0x39c5ea)); // pool
            continue;
          }
          const w = cw - gap - r() * 3, d = cd - gap - r() * 3;
          const bx = cx - inner / 2 + (ix + 0.5) * cw, bz = cz - inner / 2 + (iz + 0.5) * cd;
          let h = hMin + r() * (hMax - hMin);
          if (type === 'downtown' && nx * nz === 1) h = 80 + r() * 55;
          const style = pickc(styles);
          const color = pickc(PAL[type]);
          const accent = pickc(ACCENT);
          let top = h;
          if (type === 'downtown' && h > 55 && r() < 0.65) {
            const h1 = h * (0.55 + r() * 0.2);
            buildingBox(style, w, h1, d, bx, CURB_H, bz, color);
            buildingBox(style, w * 0.68, h - h1, d * 0.68, bx, CURB_H + h1, bz, color);
            props.push(cbox(w + 0.5, 0.5, d + 0.5, bx, CURB_H + h1, bz, 0xf3f3f3));
            props.push(cbox(w * 0.68 + 0.4, 0.5, d * 0.68 + 0.4, bx, CURB_H + h, bz, accent));
            props.push(cbox(0.25, 12, 0.25, bx, CURB_H + h + 6, bz, 0x999999));
            beaconPos.push(new THREE.Vector3(bx, CURB_H + h + 12.2, bz));
            top = h + 12;
          } else {
            buildingBox(style, w, h, d, bx, CURB_H, bz, color);
            props.push(cbox(w + 0.6, 0.55, d + 0.6, bx, CURB_H + h, bz, type === 'port' ? 0x8c8c8c : accent));
            props.push(cbox(w * 0.3, 1.2, d * 0.25, bx + w * 0.15, CURB_H + h + 0.8, bz - d * 0.2, 0xb9b9b9));
            if (type === 'beach' || type === 'bahia') props.push(cbox(w + 1.8, 0.22, d + 1.8, bx, CURB_H + 3.5, bz, accent));
          }
          void top;
          fixed(w / 2, h / 2 + 1, d / 2, bx, h / 2, bz);

          // neon signs
          const faces: number[] = [];
          if (ix === nx - 1) faces.push(0);
          if (ix === 0) faces.push(1);
          if (iz === 0) faces.push(2);
          if (iz === nz - 1) faces.push(3);
          const isSpecial = special && !specialDone && faces.includes(special.startsWith('SPRAY') ? 0 : faces[0]) && iz === Math.floor(nz / 2) % nz;
          const prob = type === 'beach' ? 0.9 : type === 'bahia' ? 0.5 : type === 'downtown' ? 0.35 : type === 'port' ? 0.12 : 0;
          if (faces.length && (isSpecial || r() < prob)) {
            let face = type === 'beach' && faces.includes(0) ? 0 : pickc(faces);
            if (isSpecial && special.startsWith('SPRAY')) face = 0;
            const fw = face < 2 ? d : w;
            const sw = Math.min(fw * 0.78, 13);
            const sy = Math.min(h - sw / 8 - 0.9, 6.2 + r() * 2);
            const off = 0.25;
            const s = { x: bx, y: CURB_H + sy, z: bz, rot: 0, w: sw, idx: signCounter++ % SIGNS.length, text: isSpecial ? special : undefined };
            if (face === 0) { s.x = bx + w / 2 + off; s.rot = Math.PI / 2; }
            else if (face === 1) { s.x = bx - w / 2 - off; s.rot = -Math.PI / 2; }
            else if (face === 2) { s.z = bz - d / 2 - off; s.rot = Math.PI; }
            else { s.z = bz + d / 2 + off; }
            signs.push(s);
            if (isSpecial) specialDone = true;
          }
        }
    }

  // slabs
  const slabMat = (map: THREE.Texture) => new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
  const grassTex = makeGrassTexture();
  for (const [key, map] of [['walk', makeSidewalkTexture()], ['grass', grassTex], ['lot', asphaltTex]] as [string, THREE.Texture][]) {
    if (!slabGeos[key].length) continue;
    const m = new THREE.Mesh(mergeGeometries(slabGeos[key])!, slabMat(map));
    m.receiveShadow = true;
    root.add(m);
  }
  {
    const m = new THREE.Mesh(lawn.build(), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.receiveShadow = true;
    root.add(m);
  }

  // buildings
  const buildingMats: THREE.MeshStandardMaterial[] = [];
  for (let s = 0; s < 3; s++) {
    if (!bGeos[s].length) continue;
    const t = makeWindowTextures(s);
    const mat = new THREE.MeshStandardMaterial({
      map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0,
      vertexColors: true, roughness: s === 1 ? 0.35 : 0.85, metalness: s === 1 ? 0.25 : 0,
    });
    buildingMats.push(mat);
    const m = new THREE.Mesh(mergeGeometries(bGeos[s])!, mat);
    m.castShadow = shadows;
    m.receiveShadow = true;
    root.add(m);
  }

  // beach furniture
  const umb: { x: number; z: number; c: number }[] = [];
  const bx0 = HALF_W + ROAD_W / 2 + 20, bx1 = ISLAND.maxX - WALL_INSET - 8;
  for (let k = 0; k < 34; k++) {
    const x = bx0 + r() * (bx1 - bx0), z = (r() - 0.5) * 2 * (HALF_D - 10);
    if (Math.abs(z - 10) < 12 && x < bx0 + 14) continue;
    umb.push({ x, z, c: pickc([0xff4fa3, 0x27e0d6, 0xffd23f, 0xffffff, 0xff7847]) });
    props.push(cbox(0.8, 0.12, 2, x + 1.4, 0.08, z + 0.3, pickc([0xff7ac8, 0x5ad1ff, 0xfff07a, 0xffffff])));
  }
  for (let k = 0; k < 46; k++) palms.push({ x: bx0 - 4 + r() * (bx1 - bx0), z: (r() - 0.5) * 2 * (HALF_D + 20) });
  // palms around the remaining shoreline
  for (let k = 0; k < 60; k++) {
    const side = Math.floor(r() * 3);
    const t = (r() - 0.5) * 2;
    if (side === 0) palms.push({ x: -HALF_W - ROAD_W / 2 - 6 - r() * 22, z: t * (HALF_D + 20) });
    else if (side === 1) palms.push({ x: t * (HALF_W + 10), z: -HALF_D - ROAD_W / 2 - 6 - r() * 22 });
    else palms.push({ x: t * (HALF_W + 10), z: HALF_D + ROAD_W / 2 + 6 + r() * 22 });
  }
  // lifeguard towers
  for (const z of [-170, -40, 110, 230]) {
    const x = bx1 - 22;
    props.push(cbox(3, 2.4, 3, x, 3.4, z, pickc([0xff7ac8, 0x5ad1ff, 0xfff07a])));
    props.push(cbox(3.8, 0.25, 3.8, x, 4.75, z, 0xffffff));
    for (const [sx, sz] of CS) props.push(cbox(0.2, 2.2, 0.2, x + sx * 1.3, 1.1, z + sz * 1.3, 0xffffff));
    fixed(1.6, 2.5, 1.6, x, 2.5, z);
  }

  // merged coloured props
  {
    const m = new THREE.Mesh(mergeGeometries(props)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    m.castShadow = shadows;
    m.receiveShadow = true;
    root.add(m);
  }

  // palms (instanced)
  {
    const pg = makePalmGeometries();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const trunks = new THREE.InstancedMesh(pg.trunk, mat, palms.length);
    const leaves = new THREE.InstancedMesh(pg.leaves, mat, palms.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    palms.forEach((pl, i) => {
      const sc = 0.8 + r() * 0.5;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r() * Math.PI * 2);
      const inGrid = Math.abs(pl.x) < HALF_W + ROAD_W / 2 && Math.abs(pl.z) < HALF_D + ROAD_W / 2;
      p.set(pl.x, inGrid ? CURB_H : -0.05, pl.z);
      s.set(sc, sc, sc);
      m4.compose(p, q, s);
      trunks.setMatrixAt(i, m4);
      leaves.setMatrixAt(i, m4);
      pw.createCollider(R.ColliderDesc.cylinder(3, 0.32).setTranslation(pl.x, 3, pl.z).setCollisionGroups(G_STATIC));
    });
    trunks.castShadow = leaves.castShadow = shadows;
    trunks.frustumCulled = leaves.frustumCulled = false;
    root.add(trunks, leaves);
  }
  // lamps
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x777777, toneMapped: false });
  {
    const pole = new THREE.CylinderGeometry(0.07, 0.11, 6.4, 6).translate(0, 3.2, 0);
    const poles = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ color: 0x3a3f4a }), lamps.length);
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 8, 6).translate(0, 6.6, 0), bulbMat, lamps.length);
    const m4 = new THREE.Matrix4();
    lamps.forEach((l, i) => {
      m4.makeTranslation(l.x, CURB_H, l.z);
      poles.setMatrixAt(i, m4);
      bulbs.setMatrixAt(i, m4);
    });
    poles.frustumCulled = bulbs.frustumCulled = false;
    root.add(poles, bulbs);
  }
  // umbrellas
  {
    const cone = new THREE.ConeGeometry(1.7, 0.7, 8).translate(0, 2.4, 0);
    const tops = new THREE.InstancedMesh(cone, new THREE.MeshLambertMaterial({ color: 0xffffff }), umb.length);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5).translate(0, 1.2, 0), new THREE.MeshLambertMaterial({ color: 0xeeeeee }), umb.length);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    umb.forEach((u, i) => {
      m4.makeTranslation(u.x, -0.05, u.z);
      tops.setMatrixAt(i, m4);
      poles.setMatrixAt(i, m4);
      tops.setColorAt(i, c.set(u.c));
    });
    tops.castShadow = shadows;
    tops.frustumCulled = poles.frustumCulled = false;
    root.add(tops, poles);
  }
  // neon signs
  {
    const cache = new Map<string, THREE.MeshBasicMaterial>();
    const plane = new THREE.PlaneGeometry(1, 0.25);
    for (const s of signs) {
      const def = SIGNS[s.idx];
      const text = s.text ?? def[0];
      let mat = cache.get(text);
      if (!mat) {
        const color = s.text ? (text === 'HOSPITAL' ? '#ff5a5a' : text === 'POLICE' ? '#5aa2ff' : '#ffe14a') : def[1];
        mat = new THREE.MeshBasicMaterial({ map: makeSignTexture(text, color, s.text ? false : def[2]), transparent: true, toneMapped: false, depthWrite: false });
        cache.set(text, mat);
      }
      const m = new THREE.Mesh(plane, mat);
      m.position.set(s.x, s.y, s.z);
      m.rotation.y = s.rot;
      m.scale.set(s.w, s.w, 1);
      root.add(m);
    }
  }
  // tower beacons
  const beacons: THREE.Mesh[] = [];
  {
    const geo = new THREE.SphereGeometry(0.6, 6, 5);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2040, toneMapped: false });
    for (const p of beaconPos) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(p);
      root.add(m);
      beacons.push(m);
    }
  }

  // beach parking
  const px = HALF_W + ROAD_W / 2 + 3.6;
  for (const z of [-200, -196, -120, -60, -56, 2, 6, 14, 70, 74, 150, 220, 224]) parked.push({ x: px, z, yaw: Math.PI / 2 });
  parked[parked.length - 6].kind = 'sport'; // z = 6, next to the start
  // a few more around town (inside lots handled above)
  const hosp = cornerPos(4, 5, 2);
  const pol = cornerPos(2, 1, 2);
  const sprayB = blockCenter(1, 5);
  return {
    buildingMats, bulbMat, ocean, oceanMat, parked, beacons,
    start: { x: HALF_W + ROAD_W / 2 + 10, z: 10, yaw: -Math.PI / 2 },
    hospital: hosp,
    police: pol,
    spray: { x: sprayB.x + BLOCK / 2 + 3, z: sprayB.z },
  };
}
