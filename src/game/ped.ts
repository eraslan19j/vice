import * as THREE from 'three';
import { animateHuman, buildHuman, HumanLook, HumanRig } from './models';
import { Corner, cornerNeighbors, cornerPos } from './world';
import { NX, NZ, PITCH, HALF_W, HALF_D, clamp, damp, angleDiff, groundHeight, blockCenter } from './config';

export interface PedCtx {
  px: number;
  pz: number;
  playerOnFoot: boolean;
  playerSlow: boolean;
  playerDead: boolean;
  stars: number;
  blocked(x: number, z: number, dx: number, dz: number, dist: number): boolean;
  copShoot(p: Ped): void;
  copBust(p: Ped, dt: number): void;
}
export function nearestCorner(x: number, z: number): Corner {
  const bi = clamp(Math.floor((x + HALF_W) / PITCH), 0, NX - 2);
  const bj = clamp(Math.floor((z + HALF_D) / PITCH), 0, NZ - 2);
  const b = blockCenter(bi, bj);
  const sx = x > b.x, sz = z > b.z;
  return { bi, bj, c: sz ? (sx ? 2 : 3) : sx ? 1 : 0 };
}

export type PedState = 'walk' | 'flee' | 'air' | 'down' | 'dead' | 'cop' | 'wait';
export class Ped {
  rig: HumanRig;
  x: number;
  z: number;
  y = 0;
  yaw = 0;
  phase = Math.random() * 6;
  state: PedState = 'walk';
  cop = false;
  health = 60;
  walkSpeed = 1.2 + Math.random() * 0.6;
  from: Corner;
  to: Corner;
  tx = 0;
  tz = 0;
  fleeT = 0;
  threatX = 0;
  threatZ = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  timer = 0;
  shootCd = 1 + Math.random();
  aimT = 0;
  side = Math.random() < 0.5 ? 1 : -1;
  remove = false;
  cash = 10 + Math.floor(Math.random() * 60);
  private tilt = 0;
  private visY = 0;

  constructor(scene: THREE.Scene, look: HumanLook, x: number, z: number) {
    this.rig = buildHuman(look);
    this.cop = !!look.cop;
    if (this.cop) {
      this.state = 'cop';
      this.health = 90;
      this.rig.gun.visible = true;
    }
    this.x = x;
    this.z = z;
    this.from = this.to = nearestCorner(x, z);
    this.setTarget(this.to);
    this.visY = groundHeight(x, z);
    scene.add(this.rig.group);
    this.apply(0, 0, 'move');
  }
  setTarget(c: Corner) {
    const p = cornerPos(c.bi, c.bj, c.c);
    this.tx = p.x + (Math.random() - 0.5) * 1.6;
    this.tz = p.z + (Math.random() - 0.5) * 1.6;
  }
  get alive() {
    return this.state !== 'dead' && this.health > 0;
  }
  get standing() {
    return this.state === 'walk' || this.state === 'flee' || this.state === 'cop' || this.state === 'wait';
  }

  scare(x: number, z: number, t = 9) {
    if (this.cop || !this.standing || this.state === 'wait') return;
    this.threatX = x;
    this.threatZ = z;
    if (this.state !== 'flee') {
      const a = cornerPos(this.to.bi, this.to.bj, this.to.c), b = cornerPos(this.from.bi, this.from.bj, this.from.c);
      if (Math.hypot(b.x - x, b.z - z) > Math.hypot(a.x - x, a.z - z)) {
        const tmp = this.to;
        this.to = this.from;
        this.from = tmp;
        this.setTarget(this.to);
      }
    }
    this.state = 'flee';
    this.fleeT = t;
  }

  /** returns true if this killed the ped */
  hurt(dmg: number, ix: number, iz: number, up: number) {
    if (this.state === 'dead') return false;
    const wasAlive = this.health > 0;
    this.health -= dmg;
    if (this.health <= 0 || up > 0) {
      this.state = 'air';
      this.vx = ix;
      this.vz = iz;
      this.vy = Math.max(up, 1.5);
      this.y = Math.max(this.y, 0.05);
    } else if (!this.cop) {
      this.scare(this.x - ix, this.z - iz);
    }
    return wasAlive && this.health <= 0;
  }

  update(dt: number, ctx: PedCtx) {
    let speed = 0;
    let pose: 'move' | 'aim' | 'down' = 'move';
    const st = this.state;
    if (st === 'walk' || st === 'flee') {
      const dx = this.tx - this.x, dz = this.tz - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.7) {
        const opts = cornerNeighbors(this.to);
        let next = opts[0];
        if (st === 'flee') {
          let best = -1;
          for (const o of opts) {
            const p = cornerPos(o.bi, o.bj, o.c);
            const dd = Math.hypot(p.x - this.threatX, p.z - this.threatZ);
            if (dd > best) { best = dd; next = o; }
          }
        } else {
          const f = this.from;
          const cands = opts.filter((o) => !(o.bi === f.bi && o.bj === f.bj && o.c === f.c));
          next = cands[Math.floor(Math.random() * cands.length)] || opts[0];
        }
        this.from = this.to;
        this.to = next;
        this.setTarget(next);
      } else {
        speed = st === 'flee' ? 4.8 : this.walkSpeed;
        this.x += (dx / d) * speed * dt;
        this.z += (dz / d) * speed * dt;
        this.yaw += angleDiff(Math.atan2(dx, dz), this.yaw) * Math.min(1, dt * 8);
      }
      if (st === 'flee') {
        this.fleeT -= dt;
        if (this.fleeT <= 0) this.state = 'walk';
      }
    } else if (st === 'cop') {
      const dx = ctx.px - this.x, dz = ctx.pz - this.z;
      const d = Math.hypot(dx, dz) || 1;
      const nx = dx / d, nz = dz / d;
      this.aimT -= dt;
      if (ctx.stars > 0 && !ctx.playerDead) {
        const armed = ctx.stars >= 2;
        const want = armed ? (ctx.playerOnFoot ? 8 : 5) : 1.1;
        if (d > want) {
          let mx = nx, mz = nz;
          if (ctx.blocked(this.x, this.z, mx, mz, 1.5)) {
            const a = 1.25 * this.side;
            const c = Math.cos(a), s = Math.sin(a);
            mx = nx * c - nz * s;
            mz = nx * s + nz * c;
            if (ctx.blocked(this.x, this.z, mx, mz, 1.5)) {
              this.side *= -1;
              mx = mz = 0;
            }
          }
          speed = mx || mz ? 5.3 : 0;
          this.x += mx * speed * dt;
          this.z += mz * speed * dt;
        }
        this.yaw += angleDiff(Math.atan2(dx, dz), this.yaw) * Math.min(1, dt * 10);
        if (armed && d < 28) {
          this.shootCd -= dt;
          if (this.shootCd <= 0) {
            this.shootCd = 1.4 - ctx.stars * 0.13 + Math.random() * 0.5;
            if (!ctx.blocked(this.x, this.z, nx, nz, d - 0.5)) {
              this.aimT = 0.5;
              ctx.copShoot(this);
            }
          }
        }
        if (d < 1.9 && (ctx.playerOnFoot || ctx.playerSlow)) ctx.copBust(this, dt);
      }
      if (this.aimT > 0) pose = 'aim';
    } else if (st === 'air') {
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      this.y += this.vy * dt;
      this.vy -= 18 * dt;
      this.vx *= 1 - dt;
      this.vz *= 1 - dt;
      pose = 'down';
      if (this.y <= 0 && this.vy < 0) {
        this.y = 0;
        if (this.health <= 0) {
          this.state = 'dead';
          this.timer = 14;
        } else {
          this.state = 'down';
          this.timer = 2;
        }
      }
    } else if (st === 'down') {
      pose = 'down';
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.cop) this.state = 'cop';
        else {
          this.from = this.to = nearestCorner(this.x, this.z);
          this.setTarget(this.to);
          this.state = 'flee';
          this.fleeT = 8;
        }
      }
    } else if (st === 'dead') {
      pose = 'down';
      this.timer -= dt;
      if (this.timer < 3) this.y -= dt * 0.12;
      if (this.timer <= 0) this.remove = true;
    }
    this.apply(dt, speed, pose);
  }

  private apply(dt: number, speed: number, pose: 'move' | 'aim' | 'down') {
    const lying = pose === 'down';
    this.tilt = dt > 0 ? damp(this.tilt, lying ? -Math.PI / 2 : 0, lying ? 9 : 6, dt) : this.tilt;
    this.phase += dt * Math.min(16, speed * 4.2);
    this.visY = dt > 0 ? damp(this.visY, groundHeight(this.x, this.z), 12, dt) : this.visY;
    const g = this.rig.group;
    g.position.set(this.x, this.visY + this.y + (lying ? 0.14 * Math.min(1, -this.tilt) : 0), this.z);
    g.rotation.y = this.yaw;
    g.rotation.x = this.tilt;
    animateHuman(this.rig, this.phase, speed, pose);
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.rig.group);
  }
}
