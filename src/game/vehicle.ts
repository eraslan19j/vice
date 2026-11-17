import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { buildCar, CarRig, CarSpec, wreckCar } from './models';
import { NX, NZ, ROAD_W, G_CAR, roadX, roadZ, clamp, damp, angleDiff, groundHeight } from './config';

export type Driver = 'none' | 'player' | 'ai' | 'cop';
export interface AIState {
  mode: 'cruise' | 'pursuit';
  to: { i: number; j: number };
  dir: { dx: number; dz: number };
  lane: number;
  wps: { x: number; z: number }[];
  speed: number;
  stuck: number;
  reverseT: number;
  wait: number;
  ignoreT: number;
  direct: boolean;
  stuckCount: number;
}
export interface AIEnv {
  vehicles: Vehicle[];
  obstacles: { x: number; z: number }[];
  pursuit: { x: number; z: number; slow: boolean; vehicle: Vehicle | null } | null;
  los(v: Vehicle): boolean;
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const nodePos = (i: number, j: number) => ({ x: roadX(i), z: roadZ(j) });
export function lanePoint(i: number, j: number, dx: number, dz: number, lane: number, along: number) {
  // point `along` metres past node (i,j) travelling in dir, offset to the right-hand lane
  return { x: roadX(i) + dx * along - dz * lane, z: roadZ(j) + dz * along + dx * lane };
}

export class Vehicle {
  spec: CarSpec;
  rig: CarRig;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  x = 0;
  z = 0;
  yaw = 0;
  vx = 0;
  vz = 0;
  vf = 0;
  vr = 0;
  w = 0;
  health: number;
  fireT = -1;
  wreck = false;
  wreckT = 0;
  driver: Driver = 'none';
  ai: AIState | null = null;
  gas = 0;
  brk = 0;
  steer = 0;
  handbrake = false;
  siren = false;
  skid = 0;
  crashImpact = 0;
  parkedT = 0;
  remove = false;
  private preVx = 0;
  private preVz = 0;
  private visY = 0;
  private spin = 0;
  private acc = 0;
  private flash = 0;

  constructor(R: typeof RAPIER, pw: RAPIER.World, scene: THREE.Scene, spec: CarSpec, x: number, z: number, yaw: number, color?: number) {
    this.spec = spec;
    this.health = spec.health;
    this.rig = buildCar(spec, color);
    scene.add(this.rig.group);
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(x, 0.82, z)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .enabledRotations(false, true, false)
      .enabledTranslations(true, false, true)
      .setAngularDamping(1.5)
      .setCanSleep(false);
    this.body = pw.createRigidBody(desc);
    this.collider = pw.createCollider(
      R.ColliderDesc.cuboid(spec.wid / 2, 0.7, spec.len / 2).setMass(1200).setFriction(0.15).setRestitution(0.15).setCollisionGroups(G_CAR),
      this.body,
    );
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.visY = groundHeight(x, z);
    this.sync(0);
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  applyControls(dt: number) {
    const b = this.body;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    const v = b.linvel();
    let vf = v.x * fx + v.z * fz;
    let vr = v.x * rx + v.z * rz;
    let gas = this.gas, brk = this.brk, steer = this.steer, hb = this.handbrake;
    if (this.wreck || this.driver === 'none') {
      gas = 0; brk = 0; steer = 0; hb = true;
    }
    const s = this.spec;
    const input = gas - brk;
    let acc = 0;
    if (input > 0) {
      if (vf < -0.5) acc = 24 * input;
      else acc = s.accel * input * Math.max(0, 1 - Math.pow(Math.max(vf, 0) / s.maxSpeed, 2));
    } else if (input < 0) {
      if (vf > 0.5) acc = 26 * input;
      else acc = s.accel * 0.7 * input * Math.max(0, 1 - Math.abs(vf) / (s.maxSpeed * 0.32));
    }
    const dmgK = this.health < s.health * 0.3 ? 0.7 : 1;
    vf += acc * dmgK * dt;
    vf -= vf * (0.1 + (input === 0 ? 0.5 : 0)) * dt;
    if (hb) {
      const d = 15 * dt;
      vf = Math.abs(vf) <= d ? 0 : vf - Math.sign(vf) * d;
    }
    let grip = hb ? 1.3 : s.grip;
    if (Math.abs(vr) > 5) grip *= 0.5;
    vr *= Math.exp(-grip * dt);
    this.skid = clamp((Math.abs(vr) - 2.5) / 6, 0, 1);
    if (hb && Math.abs(vf) > 6 && this.driver !== 'none') this.skid = Math.max(this.skid, 0.6);
    const sf = clamp(Math.abs(vf) / 4, 0, 1) / (1 + Math.abs(vf) / 30);
    const targetW = -steer * 2.6 * sf * Math.sign(vf || 1) * (hb ? 1.4 : 1);
    const w = damp(b.angvel().y, targetW, hb && this.driver === 'none' ? 3 : 9, dt);
    this.preVx = fx * vf + rx * vr;
    this.preVz = fz * vf + rz * vr;
    b.setLinvel({ x: this.preVx, y: 0, z: this.preVz }, true);
    b.setAngvel({ x: 0, y: w, z: 0 }, true);
    this.acc = acc;
  }

  postStep(dt: number) {
    const b = this.body;
    const v = b.linvel();
    const impact = Math.hypot(v.x - this.preVx, v.z - this.preVz);
    this.crashImpact = 0;
    if (impact > 3.2) {
      this.crashImpact = impact;
      if (!this.wreck) this.health -= (impact - 3.2) * 2.6;
    }
    this.sync(dt);
  }

  sync(dt: number) {
    const b = this.body;
    const t = b.translation();
    const q = b.rotation();
    const v = b.linvel();
    this.x = t.x;
    this.z = t.z;
    this.yaw = 2 * Math.atan2(q.y, q.w);
    this.vx = v.x;
    this.vz = v.z;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.vf = v.x * fx + v.z * fz;
    this.vr = -v.x * fz + v.z * fx;
    this.w = b.angvel().y;
    const g = this.rig.group;
    this.visY = dt > 0 ? damp(this.visY, groundHeight(this.x, this.z), 14, dt) : this.visY;
    g.position.set(this.x, this.visY, this.z);
    g.rotation.y = this.yaw;
    if (dt > 0) {
      const ch = this.rig.chassis;
      ch.rotation.z = damp(ch.rotation.z, clamp(this.w * this.vf * 0.006, -0.09, 0.09), 8, dt);
      ch.rotation.x = damp(ch.rotation.x, clamp(-this.acc * 0.0035, -0.05, 0.05), 6, dt);
      this.spin += (this.vf * dt) / this.spec.wheelR;
      for (const wh of this.rig.wheels) wh.rotation.x = this.spin;
      const sv = damp(this.rig.frontPivots[0].rotation.y, -this.steer * 0.5, 12, dt);
      for (const p of this.rig.frontPivots) p.rotation.y = sv;
      if (this.rig.lightbar && !this.wreck) {
        this.flash += dt;
        const on = this.siren;
        const ph = Math.floor(this.flash * 7) % 2 === 0;
        this.rig.lightbar.red.visible = !on || ph;
        this.rig.lightbar.blue.visible = !on || !ph;
      }
    }
  }

  setPose(x: number, z: number, yaw: number) {
    this.body.setTranslation({ x, y: 0.82, z }, true);
    this.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.sync(0);
  }

  makeWreck() {
    this.wreck = true;
    this.driver = 'none';
    this.ai = null;
    this.siren = false;
    this.health = 0;
    wreckCar(this.rig);
  }

  startAI(mode: 'cruise' | 'pursuit', i: number, j: number, dx: number, dz: number, lane: number) {
    this.ai = {
      mode, to: { i, j }, dir: { dx, dz }, lane, speed: mode === 'pursuit' ? 25 : 10 + Math.random() * 3,
      wps: [lanePoint(i, j, dx, dz, lane, -(ROAD_W / 2 + 3))],
      stuck: 0, reverseT: 0, wait: 0, ignoreT: 0, direct: false, stuckCount: 0,
    };
  }

  private extendRoute(env: AIEnv) {
    const ai = this.ai!;
    const { i, j } = ai.to;
    const cands: { dx: number; dz: number; w: number }[] = [];
    for (const [dx, dz] of DIRS) {
      const ni = i + dx, nj = j + dz;
      if (ni < 0 || nj < 0 || ni > NX - 1 || nj > NZ - 1) continue;
      const rev = dx === -ai.dir.dx && dz === -ai.dir.dz && (ai.dir.dx !== 0 || ai.dir.dz !== 0);
      let w: number;
      if (ai.mode === 'pursuit' && env.pursuit) {
        const p = nodePos(ni, nj);
        w = -Math.hypot(p.x - env.pursuit.x, p.z - env.pursuit.z) - (rev ? 40 : 0);
      } else {
        if (rev) continue;
        w = dx === ai.dir.dx && dz === ai.dir.dz ? 3 : 1;
      }
      cands.push({ dx, dz, w });
    }
    if (!cands.length) cands.push({ dx: -ai.dir.dx, dz: -ai.dir.dz, w: 1 });
    let pickd = cands[0];
    if (ai.mode === 'pursuit' && env.pursuit) {
      for (const c of cands) if (c.w > pickd.w) pickd = c;
    } else {
      let tot = 0;
      for (const c of cands) tot += c.w;
      let rnd = Math.random() * tot;
      for (const c of cands) {
        rnd -= c.w;
        if (rnd <= 0) { pickd = c; break; }
      }
    }
    const off = ROAD_W / 2 + 3;
    ai.wps.push(lanePoint(i, j, pickd.dx, pickd.dz, ai.lane, off));
    ai.to = { i: i + pickd.dx, j: j + pickd.dz };
    ai.dir = { dx: pickd.dx, dz: pickd.dz };
    ai.wps.push(lanePoint(ai.to.i, ai.to.j, pickd.dx, pickd.dz, ai.lane, -off));
  }

  driveAI(dt: number, env: AIEnv) {
    const ai = this.ai;
    if (!ai) return;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let tx: number, tz: number;
    let ts = ai.speed;
    let direct = false;
    const pur = ai.mode === 'pursuit' ? env.pursuit : null;
    if (pur) {
      const d = Math.hypot(pur.x - this.x, pur.z - this.z);
      if (d < 55 && env.los(this)) {
        direct = true;
        if (d < 16) ts = 11;
        if (d < 9 && pur.slow) ts = 0;
      }
    }
    if (direct) {
      tx = pur!.x;
      tz = pur!.z;
      ai.direct = true;
    } else {
      if (ai.direct) {
        // lost sight: rejoin the road graph at the nearest intersection
        ai.direct = false;
        const i = clamp(Math.round((this.x - roadX(0)) / (roadX(1) - roadX(0))), 0, NX - 1);
        const j = clamp(Math.round((this.z - roadZ(0)) / (roadZ(1) - roadZ(0))), 0, NZ - 1);
        ai.to = { i, j };
        ai.dir = { dx: 0, dz: 0 };
        ai.wps = [nodePos(i, j)];
      }
      if (ai.wps.length < 2) this.extendRoute(env);
      let wp = ai.wps[0];
      if (Math.hypot(wp.x - this.x, wp.z - this.z) < 5) {
        ai.wps.shift();
        if (ai.wps.length < 2) this.extendRoute(env);
        wp = ai.wps[0];
      }
      tx = wp.x;
      tz = wp.z;
    }
    const diff = angleDiff(Math.atan2(tx - this.x, tz - this.z), this.yaw);
    let steer = clamp(-diff * 2.2, -1, 1);
    const ad = Math.abs(diff);
    if (ad > 1.2) ts = Math.min(ts, 4.5);
    else if (ad > 0.35) ts = Math.min(ts, ai.mode === 'pursuit' ? 11 : 6.5);

    // obstacle check in the corridor ahead
    let blocked = false;
    const look = 5 + Math.abs(this.vf) * 0.9;
    const test = (ox: number, oz: number, rad: number) => {
      const rx = ox - this.x, rz = oz - this.z;
      const f = rx * fx + rz * fz;
      if (f < 1.5 || f > look + rad) return;
      const l = -rx * fz + rz * fx;
      if (Math.abs(l) < 1.5 + rad * 0.3) blocked = true;
    };
    for (const o of env.vehicles) {
      if (o === this) continue;
      if (direct && pur && o === pur.vehicle) continue;
      if (Math.abs(o.x - this.x) + Math.abs(o.z - this.z) > 40) continue;
      test(o.x, o.z, 2.3);
    }
    if (!direct) for (const o of env.obstacles) test(o.x, o.z, 0.5);
    if (blocked && ai.ignoreT <= 0) {
      ts = 0;
      ai.wait += dt;
      if (ai.wait > (ai.mode === 'pursuit' ? 1.5 : 5)) {
        ai.ignoreT = 1.6;
        ai.wait = 0;
      }
    } else ai.wait = Math.max(0, ai.wait - dt);
    ai.ignoreT -= dt;

    let gas = 0, brk = 0, hb = false;
    if (ai.reverseT > 0) {
      ai.reverseT -= dt;
      brk = 0.8;
      steer = -steer;
    } else if (this.vf < ts - 0.7) gas = ai.mode === 'pursuit' ? 1 : 0.7;
    else if (this.vf > ts + 1.5) {
      if (this.vf > 0.8) brk = 0.8;
    }
    if (ts === 0 && Math.abs(this.vf) < 1) { hb = true; brk = 0; }
    if (ts > 0 && Math.abs(this.vf) < 0.7 && ai.reverseT <= 0) {
      ai.stuck += dt;
      if (ai.stuck > 1.8) {
        ai.reverseT = 1.3;
        ai.stuck = 0;
        ai.stuckCount++;
      }
    } else ai.stuck = Math.max(0, ai.stuck - dt * 0.5);
    this.gas = gas;
    this.brk = brk;
    this.steer = steer;
    this.handbrake = hb;
  }

  dispose(scene: THREE.Scene, pw: RAPIER.World) {
    scene.remove(this.rig.group);
    this.rig.paint.dispose();
    pw.removeRigidBody(this.body);
  }
}
