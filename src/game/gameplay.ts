import * as THREE from 'three';
import type { Game } from './game';
import { buildPickup, PickupKind } from './models';
import type { Ped } from './ped';
import type { Vehicle } from './vehicle';
import { cornerPos } from './world';
import { NX, NZ, HALF_W, HALF_D, ROAD_W, WEAPONS, blockCenter, clamp, groundHeight, pick, roadX, roadZ, zoneName, PITCH } from './config';

interface Pickup {
  kind: PickupKind;
  x: number;
  z: number;
  group: THREE.Group;
  active: boolean;
  respawn: number;
  temp: boolean;
  life: number;
  amount: number;
  id: number;
}
interface Mission {
  type: 'courier' | 'race' | 'taxi';
  stage: number;
  timer: number;
  reward: number;
  pts: { x: number; z: number }[];
  idx: number;
  fares: number;
  earned: number;
  passenger: Ped | null;
  leg: number;
}
interface Marker { kind: 'courier' | 'race' | 'spray'; x: number; z: number; mesh: THREE.Group; color: string }

function makeMarker(radius: number, color: number, beam = true) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1.5, 28, 1, true), mat);
  ring.position.y = 0.75;
  g.add(ring);
  if (beam) {
    const bm = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, 70, 10, 1, true), mat.clone());
    (bm.material as THREE.MeshBasicMaterial).opacity = 0.16;
    bm.position.y = 35;
    g.add(bm);
  }
  return g;
}
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export class Gameplay {
  packages = new Set<number>();
  passed = 0;
  mission: Mission | null = null;
  private g: Game;
  private pickups: Pickup[] = [];
  private markers: Marker[] = [];
  private target: THREE.Group;
  private targetOn = false;
  private cooldown = 2;
  private sprayCd = 0;
  private bigT = 0;
  private t = 0;
  private hintCd = 0;

  constructor(g: Game) {
    this.g = g;
    const st = g.world.start;
    const add = (kind: PickupKind, p: { x: number; z: number }, id = -1) => this.addPickup(kind, p.x, p.z, false, 0, id);
    add('pistol', { x: st.x + 5, z: st.z + 8 });
    for (const [bi, bj, c] of [[6, 2, 2], [3, 3, 0], [1, 4, 1], [4, 5, 1], [5, 0, 3]]) add('health', cornerPos(bi, bj, c, 3.8));
    for (const [bi, bj, c] of [[4, 2, 2], [0, 1, 2], [6, 5, 0]]) add('armor', cornerPos(bi, bj, c, 3.8));
    for (const [bi, bj, c] of [[5, 3, 3], [2, 5, 1]]) add('pistol', cornerPos(bi, bj, c, 3.8));
    for (const [bi, bj, c] of [[3, 2, 1], [0, 5, 1]]) add('smg', cornerPos(bi, bj, c, 3.8));
    for (const [bi, bj, c] of [[1, 0, 2], [4, 6, 0]]) add('shotgun', cornerPos(bi, bj, c, 3.8));
    const pk = (bi: number, bj: number, ox: number, oz: number) => {
      const b = blockCenter(bi, bj);
      return { x: b.x + ox, z: b.z + oz };
    };
    const E = HALF_W + ROAD_W / 2, S = HALF_D + ROAD_W / 2;
    const spots = [
      { x: E + 62, z: -160 }, { x: E + 70, z: 250 }, { x: -100, z: -S - 26 }, { x: 60, z: S + 26 }, { x: -E - 26, z: 40 },
      pk(3, 5, 15, -18), pk(5, 1, -16, 14), pk(1, 2, 0, 25), pk(3, 0, -8, 7), { x: -E - 22, z: -S - 22 },
    ];
    spots.forEach((s, i) => add('package', s, i));

    const mk = (kind: Marker['kind'], x: number, z: number, color: number, css: string, r = 1.8) => {
      const mesh = makeMarker(r, color, false);
      mesh.position.set(x, groundHeight(x, z), z);
      g.scene.add(mesh);
      this.markers.push({ kind, x, z, mesh, color: css });
    };
    const c = cornerPos(6, 3, 1, 4);
    mk('courier', c.x, c.z, 0xff4fa3, '#ff4fa3');
    mk('race', E + 3.6, 40, 0xffd23f, '#ffd23f', 2.4);
    mk('spray', g.world.spray.x, g.world.spray.z, 0x40ff80, '#40ff80', 2.6);
    this.target = makeMarker(1, 0xffe14a, true);
    this.target.visible = false;
    g.scene.add(this.target);
  }

  // ------------------------------------------------------------ pickups
  private addPickup(kind: PickupKind, x: number, z: number, temp: boolean, amount: number, id: number) {
    const { mesh, glow } = buildPickup(kind);
    const group = new THREE.Group();
    mesh.position.y = 0.9;
    mesh.scale.setScalar(kind === 'package' ? 1.3 : 1.5);
    group.add(mesh);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.72, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    ring.position.y = 0.05;
    group.add(ring);
    group.position.set(x, groundHeight(x, z), z);
    this.g.scene.add(group);
    const p: Pickup = { kind, x, z, group, active: true, respawn: 0, temp, life: 40, amount, id };
    this.pickups.push(p);
    return p;
  }
  dropCash(x: number, z: number, amount: number) {
    this.addPickup('cash', x + (Math.random() - 0.5), z + (Math.random() - 0.5), true, amount, -1);
  }
  private collect(pk: Pickup) {
    const g = this.g, p = g.player;
    switch (pk.kind) {
      case 'health':
        if (p.health >= 100) return false;
        p.health = 100;
        g.audio.pickup();
        break;
      case 'armor':
        if (p.armor >= 100) return false;
        p.armor = 100;
        g.audio.pickup();
        break;
      case 'cash':
        p.money += pk.amount;
        g.audio.cash();
        break;
      case 'package': {
        this.packages.add(pk.id);
        p.money += 100;
        g.audio.cash();
        const n = this.packages.size;
        if (n >= 10) {
          p.money += 5000;
          g.say('All [10 hidden packages] found! $5000 bonus.', 6);
        } else g.say(`Hidden package [${n} of 10]. $100 bonus.`, 4);
        break;
      }
      default: {
        const w = WEAPONS[pk.kind];
        p.ammo[w.id] = (p.ammo[w.id] || 0) + w.clip;
        if (p.weapon === 'fist') p.weapon = w.id;
        g.hint(`${w.name} +${w.clip}`, 2.5);
        g.audio.pickup();
      }
    }
    return true;
  }

  // ------------------------------------------------------------ lifecycle
  reset() {
    this.endMission();
    this.packages.clear();
    this.passed = 0;
    this.cooldown = 2;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      if (pk.temp) {
        this.g.scene.remove(pk.group);
        this.pickups.splice(i, 1);
      } else {
        pk.active = true;
        pk.group.visible = true;
      }
    }
  }
  serialize() {
    return { packages: [...this.packages], passed: this.passed };
  }
  load(d: any) {
    if (!d) return;
    this.passed = d.passed || 0;
    for (const id of d.packages || []) this.packages.add(id);
    for (const pk of this.pickups)
      if (pk.kind === 'package' && this.packages.has(pk.id)) {
        pk.active = false;
        pk.group.visible = false;
      }
  }
  timerText() {
    const m = this.mission;
    if (!m) return '';
    const t = Math.max(0, Math.ceil(m.timer));
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }
  blips() {
    const out: { x: number; z: number; color: string; size: number; square: boolean }[] = [];
    if (!this.mission) for (const m of this.markers) out.push({ x: m.x, z: m.z, color: m.color, size: 4, square: true });
    if (this.targetOn) out.push({ x: this.target.position.x, z: this.target.position.z, color: '#ffe14a', size: 5, square: false });
    return out;
  }
  private setTarget(p: { x: number; z: number } | null, r = 2) {
    this.targetOn = !!p;
    this.target.visible = !!p;
    if (p) {
      this.target.position.set(p.x, groundHeight(p.x, p.z), p.z);
      this.target.scale.set(r, 1, r);
    }
  }
  private randomCorner(from: { x: number; z: number }, min: number, max: number) {
    let best = cornerPos(0, 0, 0);
    for (let i = 0; i < 60; i++) {
      const c = cornerPos(Math.floor(Math.random() * (NX - 1)), Math.floor(Math.random() * (NZ - 1)), Math.floor(Math.random() * 4));
      best = c;
      const d = dist(c, from);
      if (d >= min && d <= max) return c;
    }
    return best;
  }

  // ------------------------------------------------------------ missions
  private startCourier() {
    const g = this.g, p = g.player;
    const a = this.randomCorner(p, 200, 420);
    const b = this.randomCorner(a, 220, 480);
    const d1 = dist(p, a), d2 = dist(a, b);
    this.mission = { type: 'courier', stage: 0, timer: d1 / 8 + 32, reward: 350 + Math.round(((d1 + d2) * 0.5) / 10) * 10, pts: [a, b], idx: 0, fares: 0, earned: 0, passenger: null, leg: d2 / 8 + 22 };
    this.setTarget(a, 2.2);
    g.say(`SPECIAL DELIVERY: pick up the [package] in ${zoneName(a.x, a.z)} before the clock runs out.`, 6);
    g.audio.pickup();
  }
  private startRace() {
    const g = this.g, p = g.player;
    let i = clamp(Math.round((p.x + HALF_W) / PITCH), 0, NX - 1), j = clamp(Math.round((p.z + HALF_D) / PITCH), 0, NZ - 1);
    const pts: { x: number; z: number }[] = [];
    let pi = -1, pj = -1;
    for (let k = 0; k < 9; k++) {
      for (let tries = 0; tries < 30; tries++) {
        const horiz = Math.random() < 0.5;
        const n = pick([-3, -2, -1, 1, 2, 3]);
        const ni = horiz ? i + n : i, nj = horiz ? j : j + n;
        if (ni < 0 || nj < 0 || ni > NX - 1 || nj > NZ - 1 || (ni === pi && nj === pj)) continue;
        pi = i; pj = j; i = ni; j = nj;
        break;
      }
      pts.push({ x: roadX(i), z: roadZ(j) });
    }
    this.mission = { type: 'race', stage: 0, timer: dist(p, pts[0]) / 11 + 12, reward: 800, pts, idx: 0, fares: 0, earned: 0, passenger: null, leg: 0 };
    this.setTarget(pts[0], 7);
    g.say('SUNSET SPRINT: hit all [9 checkpoints] before time runs out!', 5);
    g.audio.pickup();
  }
  private nextFare(first: boolean) {
    const g = this.g, p = g.player, m = this.mission!;
    const a = this.randomCorner(p, 80, 260);
    m.stage = 0;
    m.pts = [a];
    m.idx = 0;
    m.timer = dist(p, a) / 7 + 28;
    m.passenger = g.addPed(a.x, a.z);
    m.passenger.state = 'wait';
    this.setTarget(a, 5);
    g.say(first ? 'TAXI SHIFT: pick up the [fare] and stop next to them.' : 'Another [fare] is waiting. Go pick them up.', 5);
  }
  toggleTaxi() {
    const g = this.g, v = g.player.vehicle;
    if (this.mission) {
      if (this.mission.type === 'taxi') this.endTaxi();
      return;
    }
    if (!v || v.spec.id !== 'taxi') return;
    this.mission = { type: 'taxi', stage: 0, timer: 60, reward: 0, pts: [], idx: 0, fares: 0, earned: 0, passenger: null, leg: 0 };
    this.nextFare(true);
  }
  private endTaxi() {
    const m = this.mission;
    if (!m) return;
    this.g.say(`Taxi shift over: [${m.fares} fares], $${m.earned} earned.`, 5);
    this.endMission();
  }
  private endMission() {
    const m = this.mission;
    if (m && m.passenger) m.passenger.remove = true;
    this.mission = null;
    this.setTarget(null);
    this.cooldown = 4;
  }
  failMission(reason: string) {
    const m = this.mission;
    if (!m) return;
    if (m.type === 'taxi' && m.fares > 0 && reason) this.g.say(`Taxi shift over: [${m.fares} fares], $${m.earned} earned.`, 5);
    if (reason) {
      this.g.big = { kind: 'failed', text: 'MISSION FAILED', sub: reason };
      this.bigT = 4;
      this.g.audio.failed();
    }
    this.endMission();
  }
  private pass(reward: number) {
    const g = this.g;
    g.player.money += reward;
    this.passed++;
    g.big = { kind: 'passed', text: 'MISSION PASSED!', sub: `$${reward}` };
    this.bigT = 4.5;
    g.audio.passed();
    this.endMission();
    g.save();
  }
  onEnterVehicle(v: Vehicle) {
    if (v.spec.id === 'taxi' && !this.mission) this.g.hint(this.g.input.touchMode ? 'Tap TAXI to start picking up fares.' : 'Press T to start picking up taxi fares.', 5);
    else if (v.spec.id === 'police') this.g.hint('You stole a police cruiser. Bold move.', 3);
  }
  onLeaveVehicle() {
    if (this.mission && this.mission.type === 'taxi') this.endTaxi();
  }

  update(dt: number) {
    const g = this.g, p = g.player;
    this.t += dt;
    this.cooldown -= dt;
    this.sprayCd -= dt;
    this.hintCd -= dt;
    if (this.bigT > 0 && (this.bigT -= dt) <= 0 && g.big && (g.big.kind === 'passed' || g.big.kind === 'failed')) g.big = null;

    // pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      if (!pk.active) {
        if (pk.kind !== 'package' && (pk.respawn -= dt) <= 0) {
          pk.active = true;
          pk.group.visible = true;
        }
        continue;
      }
      const m = pk.group.children[0];
      m.rotation.y = this.t * 2 + i;
      m.position.y = 0.9 + Math.sin(this.t * 3 + i) * 0.08;
      let gone = false;
      if (!p.vehicle && !p.dead && Math.abs(pk.x - p.x) < 1.5 && Math.abs(pk.z - p.z) < 1.5 && this.collect(pk)) gone = true;
      if (pk.temp && (pk.life -= dt) <= 0) gone = true;
      if (gone) {
        if (pk.temp) {
          g.scene.remove(pk.group);
          this.pickups.splice(i, 1);
        } else {
          pk.active = false;
          pk.group.visible = false;
          pk.respawn = 60;
        }
      }
    }
    // markers
    const pulse = 1 + Math.sin(this.t * 4) * 0.06;
    for (const mk of this.markers) {
      mk.mesh.visible = !this.mission;
      mk.mesh.scale.set(pulse, 1, pulse);
    }
    this.target.rotation.y = this.t;
    if (p.dead) return;

    const m = this.mission;
    if (!m) {
      for (const mk of this.markers) {
        const d = dist(mk, p);
        if (mk.kind === 'spray') {
          if (p.vehicle && d < 4 && Math.abs(p.vehicle.vf) < 3 && this.sprayCd <= 0) {
            this.sprayCd = 8;
            if (p.money >= 100) {
              p.money -= 100;
              p.vehicle.rig.paint.color.setHex(pick([0xff5fa2, 0x29d3c8, 0xffc857, 0x7ec8ff, 0xb38cff, 0xff7847, 0xf5f0e6, 0x49c16b]));
              p.vehicle.health = p.vehicle.spec.health;
              g.clearWanted();
              g.audio.cash();
              g.say("SPRAY 'N' GO: fresh paint, full repair, [no heat]. That's $100.", 5);
            } else g.hint('A respray costs $100.', 3);
          }
        } else if (d < 2.8 && this.cooldown <= 0) {
          if (mk.kind === 'courier') this.startCourier();
          else if (p.vehicle) this.startRace();
          else if (this.hintCd <= 0) {
            this.hintCd = 4;
            g.hint('Come back with a set of wheels to race.', 3);
          }
        }
      }
      return;
    }
    // active mission
    m.timer -= dt;
    if (m.timer <= 0) {
      this.failMission(m.type === 'taxi' ? 'The fare got tired of waiting.' : 'You ran out of time.');
      return;
    }
    const tgt = m.pts[m.idx];
    const d = dist(tgt, p);
    if (m.type === 'courier') {
      if (d < 4.5) {
        if (m.idx === 0) {
          m.idx = 1;
          m.timer += m.leg;
          this.setTarget(m.pts[1], 2.2);
          g.audio.pickup();
          g.say(`Got it. Now deliver the package to the [drop-off] in ${zoneName(m.pts[1].x, m.pts[1].z)}.`, 6);
        } else this.pass(m.reward + Math.floor(m.timer) * 2);
      }
    } else if (m.type === 'race') {
      if (!p.vehicle) {
        this.failMission('You left your vehicle.');
        return;
      }
      if (d < 10) {
        m.idx++;
        g.audio.pickup();
        if (m.idx >= m.pts.length) this.pass(m.reward + Math.floor(m.timer) * 10);
        else {
          m.timer += dist(m.pts[m.idx], p) / 13 + 2.5;
          this.setTarget(m.pts[m.idx], 7);
          g.say(`Checkpoint [${m.idx} / ${m.pts.length}]`, 2);
        }
      }
    } else {
      const v = p.vehicle;
      if (!v || v.spec.id !== 'taxi') {
        this.endTaxi();
        return;
      }
      if (d < 11 && Math.abs(v.vf) < 2.5) {
        if (m.stage === 0) {
          if (m.passenger) m.passenger.remove = true;
          m.passenger = null;
          const b = this.randomCorner(tgt, 170, 430);
          m.stage = 1;
          m.pts = [b];
          m.leg = dist(tgt, b);
          m.timer = m.leg / 7.5 + 22;
          this.setTarget(b, 5);
          g.audio.pickup();
          g.say(`"Take me to [${zoneName(b.x, b.z)}], and step on it!"`, 5);
        } else {
          const fare = 20 + Math.round((m.leg * 0.3) / 5) * 5 + Math.floor(m.timer * 0.5);
          p.money += fare;
          m.earned += fare;
          m.fares++;
          g.audio.cash();
          g.hint(`Fare paid: $${fare}`, 3);
          this.nextFare(false);
        }
      }
    }
  }
}
