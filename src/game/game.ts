import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  NX, NZ, PITCH, ROAD_W, BLOCK, HALF_W, HALF_D, ISLAND, LANES, G_PLAYER, G_QUERY, G_QUERY_STATIC, QUALITY, WEAPONS, WEAPON_ORDER,
  clamp, damp, angleDiff, rand, pick, groundHeight, zoneName, roadX, roadZ, blockCenter, Settings, HudState,
} from './config';
import { buildWorld, WorldData, blockType, cornerPos } from './world';
import { Environment } from './sky';
import { Effects } from './effects';
import { Input } from './input';
import { AudioSys } from './audio';
import { Vehicle, AIEnv, lanePoint } from './vehicle';
import { Ped, PedCtx, nearestCorner } from './ped';
import { animateHuman, buildHuman, CAR_SPECS, COP_LOOK, HumanRig, PLAYER_LOOK, randomLook } from './models';
import { Gameplay } from './gameplay';

export interface GameCallbacks {
  onHud: (h: HudState) => void;
  onPause: () => void;
}
interface Player {
  rig: HumanRig;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  ctrl: RAPIER.KinematicCharacterController;
  x: number; y: number; z: number; yaw: number; velY: number; grounded: boolean; visY: number;
  vehicle: Vehicle | null;
  health: number; armor: number; money: number;
  ammo: Record<string, number>; weapon: string;
  attackCd: number; punchT: number; aimT: number; phase: number; speed: number;
  knockT: number; kvx: number; kvz: number;
  dead: boolean; deadT: number; deadKind: 'wasted' | 'busted'; tilt: number; bustT: number;
}
const SAVE_KEY = 'coral-city-save-v1';
const UNITS = [0, 1, 2, 2, 3, 4, 5];

export class Game {
  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.3, 3600);
  composer: EffectComposer | null = null;
  pw!: RAPIER.World;
  world!: WorldData;
  env!: Environment;
  fx!: Effects;
  input: Input;
  audio = new AudioSys();
  play!: Gameplay;
  player!: Player;
  vehicles: Vehicle[] = [];
  peds: Ped[] = [];
  mode: 'menu' | 'play' | 'pause' = 'menu';
  settings: Settings;
  tod = 18.4;
  minimap: HTMLCanvasElement | null = null;
  ready = false;

  // wanted
  heat = 0;
  stars = 0;
  evadeT = 0;
  private dispatchCd = 0;

  // camera
  camYaw = -Math.PI / 2;
  camPitch = 0.22;
  private camDist = 5;
  private followYaw = 0;
  private carLook = 0;
  private revT = 0;
  private menuAng = 0.5;
  shake = 0;

  // hud text
  private subtitle = '';
  private subT = 0;
  private help = '';
  private helpT = 0;
  big: HudState['big'] = null;
  private radioTick = 0;
  private hudT = 0;
  private mapT = 0;
  private spawnT = 0;
  private fxT = 0;
  private aimT = 0;
  private aimTarget: Ped | null = null;
  private targetCone!: THREE.Mesh;
  private headlight!: THREE.SpotLight;

  private canvas: HTMLCanvasElement;
  private cb: GameCallbacks;
  private raf = 0;
  private last = 0;
  private ray!: RAPIER.Ray;
  private colVeh = new Map<number, Vehicle>();
  private losCache = new Map<Vehicle, { t: number; v: boolean }>();
  private obstacles: { x: number; z: number }[] = [];
  private pedCtx!: PedCtx;
  private aiEnv!: AIEnv;
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private focus = new THREE.Vector3();
  private disposed = false;
  private onResize = () => this.resize();

  constructor(canvas: HTMLCanvasElement, settings: Settings, cb: GameCallbacks) {
    this.canvas = canvas;
    this.settings = settings;
    this.cb = cb;
    this.input = new Input(canvas);
    this.input.onUnlock = () => {
      if (this.mode === 'play') this.cb.onPause();
    };
  }

  // ================================================================ setup
  async init() {
    await RAPIER.init();
    if (this.disposed) return;
    const q = QUALITY[this.settings.quality];
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = q.shadows > 0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.pw = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    this.world = buildWorld(this.scene, this.pw, RAPIER, true);
    this.env = new Environment(this.scene, q.shadows || 1024);
    this.fx = new Effects(this.scene);

    // player
    const rig = buildHuman(PLAYER_LOOK);
    this.scene.add(rig.group);
    const st = this.world.start;
    const body = this.pw.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(st.x, 0.92, st.z));
    const collider = this.pw.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.35).setCollisionGroups(G_PLAYER), body);
    const ctrl = this.pw.createCharacterController(0.02);
    ctrl.setSlideEnabled(true);
    this.player = {
      rig, body, collider, ctrl, x: st.x, y: 0, z: st.z, yaw: st.yaw, velY: 0, grounded: true, visY: 0, vehicle: null,
      health: 100, armor: 0, money: 0, ammo: { pistol: 0, smg: 0, shotgun: 0 }, weapon: 'fist',
      attackCd: 0, punchT: 0, aimT: 0, phase: 0, speed: 0, knockT: 0, kvx: 0, kvz: 0,
      dead: false, deadT: 0, deadKind: 'wasted', tilt: 0, bustT: 0,
    };

    this.targetCone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0x40ff60, toneMapped: false }));
    this.targetCone.visible = false;
    this.scene.add(this.targetCone);
    this.headlight = new THREE.SpotLight(0xfff0cc, 0, 60, 0.5, 0.6, 1.2);
    this.scene.add(this.headlight, this.headlight.target);

    // parked cars
    const kinds = ['sedan', 'muscle', 'van', 'sedan', 'sport', 'taxi', 'muscle', 'sedan'];
    this.world.parked.forEach((s, i) => {
      if (!s.kind && i % 3 === 1) return;
      this.addVehicle(s.kind || kinds[i % kinds.length], s.x, s.z, s.yaw, s.kind === 'sport' ? 0xf5f0e6 : undefined);
    });

    this.play = new Gameplay(this);
    this.setupCtx();
    this.pw.step();
    this.applySettings(this.settings);
    window.addEventListener('resize', this.onResize);
    this.resize();
    this.camYaw = st.yaw;
    for (let i = 0, n = 0; i < 60 && n < q.cars; i++) if (this.spawnTraffic(true)) n++;
    for (let i = 0, n = 0; i < 60 && n < q.peds; i++) if (this.spawnPed(true)) n++;
    this.ready = true;
  }

  private setupCtx() {
    const g = this;
    this.pedCtx = {
      get px() { return g.player.x; },
      get pz() { return g.player.z; },
      get playerOnFoot() { return !g.player.vehicle; },
      get playerSlow() { return !g.player.vehicle || Math.abs(g.player.vehicle.vf) < 2.5; },
      get playerDead() { return g.player.dead || g.mode === 'menu'; },
      get stars() { return g.stars; },
      blocked: (x, z, dx, dz, dist) => !!this.castRay(x, 1, z, dx, 0, dz, dist, G_QUERY),
      copShoot: (p) => this.copShoot(p),
      copBust: (_p, dt) => {
        this.player.bustT += dt * 2;
        if (this.player.bustT > 0.8 && !this.player.dead) this.die('busted');
      },
    };
    this.aiEnv = {
      vehicles: this.vehicles,
      obstacles: this.obstacles,
      pursuit: null,
      los: (v) => {
        const now = performance.now();
        let c = this.losCache.get(v);
        if (!c) this.losCache.set(v, (c = { t: 0, v: false }));
        if (now - c.t > 300) {
          c.t = now;
          const p = this.player;
          const dx = p.x - v.x, dz = p.z - v.z, d = Math.hypot(dx, dz) || 1;
          c.v = !this.castRay(v.x, 1.2, v.z, dx / d, 0, dz / d, d, G_QUERY_STATIC);
        }
        return c.v;
      },
    };
  }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
      this.last = now;
      if (this.mode === 'pause') return;
      this.update(dt);
      this.render();
    };
    this.raf = requestAnimationFrame(loop);
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.audio.suspend();
    if (this.renderer) this.renderer.dispose();
  }
  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
  resize() {
    if (!this.renderer) return;
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    this.renderer.setSize(w, h, false);
    if (this.composer) this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.mode === 'pause' && this.ready) this.render();
  }
  applySettings(s: Settings) {
    this.settings = s;
    const q = QUALITY[s.quality];
    this.input.sensitivity = s.sensitivity;
    this.audio.setVolumes(s.sfx, s.music);
    if (!this.renderer) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    const sh = q.shadows > 0;
    if (this.renderer.shadowMap.enabled !== sh || this.env.sun.castShadow !== sh) {
      this.renderer.shadowMap.enabled = sh;
      this.env.sun.castShadow = sh;
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
        else if (m) m.needsUpdate = true;
      });
    }
    if (sh && this.env.sun.shadow.mapSize.x !== q.shadows) {
      this.env.sun.shadow.mapSize.set(q.shadows, q.shadows);
      if (this.env.sun.shadow.map) {
        this.env.sun.shadow.map.dispose();
        (this.env.sun.shadow as any).map = null;
      }
    }
    if (q.bloom && !this.composer) {
      const w = window.innerWidth, h = window.innerHeight;
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
      const c = new EffectComposer(this.renderer, rt);
      c.addPass(new RenderPass(this.scene, this.camera));
      c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.7, 1.0));
      c.addPass(new OutputPass());
      this.composer = c;
    } else if (!q.bloom && this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    this.resize();
  }

  // ================================================================ helpers
  castRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, groups: number, exclude?: RAPIER.RigidBody) {
    const r = this.ray;
    r.origin.x = ox; r.origin.y = oy; r.origin.z = oz;
    r.dir.x = dx; r.dir.y = dy; r.dir.z = dz;
    const hit = this.pw.castRay(r, max, true, undefined, groups, undefined, exclude);
    if (!hit) return null;
    const dist = ((hit as any).timeOfImpact ?? (hit as any).toi) as number;
    return { dist, veh: this.colVeh.get(hit.collider.handle) || null };
  }
  say(text: string, secs = 5) {
    this.subtitle = text;
    this.subT = secs;
  }
  hint(text: string, secs = 4) {
    this.help = text;
    this.helpT = secs;
  }
  distToPlayer(x: number, z: number) {
    return Math.hypot(x - this.player.x, z - this.player.z);
  }
  addVehicle(kind: string, x: number, z: number, yaw: number, color?: number) {
    const v = new Vehicle(RAPIER, this.pw, this.scene, CAR_SPECS[kind], x, z, yaw, color);
    this.vehicles.push(v);
    this.colVeh.set(v.collider.handle, v);
    return v;
  }
  private removeVehicle(v: Vehicle) {
    this.colVeh.delete(v.collider.handle);
    this.losCache.delete(v);
    v.dispose(this.scene, this.pw);
  }
  addPed(x: number, z: number, cop = false) {
    const p = new Ped(this.scene, cop ? COP_LOOK : randomLook(), x, z);
    this.peds.push(p);
    return p;
  }
  addHeat(a: number) {
    if (this.mode !== 'play') return;
    this.heat = Math.min(6.99, this.heat + a);
    if (Math.floor(this.heat) > this.stars) {
      this.stars = Math.floor(this.heat);
      this.audio.blip();
    }
    if (this.stars > 0) this.evadeT = 0;
  }
  clearWanted() {
    this.heat = 0;
    this.stars = 0;
    this.evadeT = 0;
    for (const v of this.vehicles)
      if (v.driver === 'cop' && v.ai) {
        v.ai.mode = 'cruise';
        v.ai.speed = 11;
        v.ai.direct = true;
        v.siren = false;
      }
    for (const p of this.peds)
      if (p.cop && p.state === 'cop') {
        p.from = p.to = nearestCorner(p.x, p.z);
        p.setTarget(p.to);
        p.state = 'walk';
      }
  }
  placePlayer(x: number, z: number, yaw: number) {
    const p = this.player;
    if (p.vehicle) this.leaveVehicle(true);
    p.body.setTranslation({ x, y: 0.92, z }, true);
    p.x = x; p.y = 0; p.z = z; p.yaw = yaw; p.velY = 0;
    p.visY = groundHeight(x, z);
    this.camYaw = yaw;
  }

  // ================================================================ game state
  setMode(m: 'menu' | 'play' | 'pause') {
    const prev = this.mode;
    this.mode = m;
    this.input.enabled = m === 'play';
    if (m === 'play') {
      this.audio.init();
      this.audio.resume();
      this.last = performance.now();
      if (prev !== 'play') this.input.reset();
    } else if (m === 'pause') {
      this.audio.silenceLoops();
      this.audio.suspend();
      this.input.exitLock();
    } else {
      this.audio.silenceLoops();
      this.audio.radioOn(false);
      this.input.exitLock();
      this.audio.resume();
    }
  }
  hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }
  newGame() {
    const p = this.player;
    const st = this.world.start;
    this.placePlayer(st.x, st.z, st.yaw);
    Object.assign(p, { health: 100, armor: 0, money: 0, weapon: 'fist', dead: false, knockT: 0, tilt: 0, bustT: 0 });
    p.ammo = { pistol: 0, smg: 0, shotgun: 0 };
    p.rig.group.visible = true;
    this.tod = 18.4;
    this.clearWanted();
    this.big = null;
    this.play.reset();
    this.say('Welcome to [Coral City]. Grab a ride and go make some money.', 7);
    this.hint(this.input.touchMode ? 'Walk up to a car and tap DRIVE to get in. Drag the right side of the screen to look around.' : 'Walk up to a car and press F to drive it. Click to capture the mouse.', 8);
  }
  save() {
    const p = this.player;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: p.money, health: Math.max(10, Math.round(p.health)), armor: Math.round(p.armor), ammo: p.ammo, weapon: p.weapon,
        x: p.x, z: p.z, tod: this.tod, play: this.play.serialize(),
      }));
      return true;
    } catch {
      return false;
    }
  }
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      this.newGame();
      const p = this.player;
      p.money = d.money || 0;
      p.health = d.health || 100;
      p.armor = d.armor || 0;
      p.ammo = { pistol: 0, smg: 0, shotgun: 0, ...(d.ammo || {}) };
      p.weapon = WEAPONS[d.weapon] ? d.weapon : 'fist';
      this.tod = typeof d.tod === 'number' ? d.tod : 18.4;
      if (typeof d.x === 'number') this.placePlayer(d.x, d.z, 0);
      this.play.load(d.play);
      this.say('Game loaded. Welcome back to [Coral City].', 5);
      return true;
    } catch {
      return false;
    }
  }

  // ================================================================ main update
  private update(dt: number) {
    const inp = this.input;
    inp.poll(dt);
    const playing = this.mode === 'play';
    if (playing && inp.consume('pause')) {
      this.cb.onPause();
      return;
    }
    this.tod = (this.tod + dt / 60) % 24;
    const p = this.player;

    if (playing) this.controlPlayer(dt);

    // AI driving
    this.obstacles.length = 0;
    for (const pd of this.peds) if (pd.standing) this.obstacles.push(pd);
    if (!p.vehicle && playing) this.obstacles.push(p);
    this.aiEnv.pursuit = this.stars > 0 && playing && !p.dead
      ? { x: p.x, z: p.z, slow: !p.vehicle || Math.abs(p.vehicle.vf) < 4, vehicle: p.vehicle }
      : null;
    for (const v of this.vehicles) {
      if (v.ai && v.driver !== 'player' && v.driver !== 'none') v.driveAI(dt, this.aiEnv);
      v.applyControls(dt);
    }
    this.pw.timestep = dt;
    this.pw.step();
    this.updateVehicles(dt);
    this.updatePlayerVisual(dt);
    for (const pd of this.peds) pd.update(dt, this.pedCtx);
    this.collideCarsWithPeople(dt);
    for (let i = this.peds.length - 1; i >= 0; i--)
      if (this.peds[i].remove) {
        if (this.aimTarget === this.peds[i]) this.aimTarget = null;
        this.peds[i].dispose(this.scene);
        this.peds.splice(i, 1);
      }
    if (playing) {
      this.play.update(dt);
      this.updateWanted(dt);
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.4;
      this.spawner();
    }
    this.fx.update(dt);
    this.updateCamera(dt);
    this.focus.set(p.x, 0, p.z);
    if (!playing) this.focus.set(HALF_W - 10, 0, 12);
    this.env.update(this.tod, this.focus, this.camera.position, this.world);
    const blink = Math.floor(performance.now() / 600) % 2 === 0;
    for (const b of this.world.beacons) b.visible = blink;
    this.updateAudio();

    if (this.subT > 0 && (this.subT -= dt) <= 0) this.subtitle = '';
    if (this.helpT > 0 && (this.helpT -= dt) <= 0) this.help = '';
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.hudT -= dt;
    if (this.hudT <= 0 && playing) {
      this.hudT = 0.1;
      this.emitHud();
    }
    this.mapT -= dt;
    if (this.mapT <= 0 && playing) {
      this.mapT = 0.05;
      this.drawMinimap();
    }
  }

  // ================================================================ player
  private controlPlayer(dt: number) {
    const p = this.player, inp = this.input;
    p.attackCd -= dt;
    p.punchT = Math.max(0, p.punchT - dt);
    p.aimT = Math.max(0, p.aimT - dt);
    p.bustT = Math.max(0, p.bustT - dt);
    if (p.dead) {
      p.deadT -= dt;
      if (p.vehicle) { p.vehicle.gas = 0; p.vehicle.brk = 0; p.vehicle.handbrake = true; }
      if (p.deadT <= 0) this.respawn();
      return;
    }
    const v = p.vehicle;
    if (v) {
      v.gas = inp.throttle;
      v.brk = inp.brake;
      v.steer = damp(v.steer, inp.moveX, inp.touchMode ? 14 : 8, dt);
      v.handbrake = inp.handbrake;
      this.audio.setHorn(inp.horn);
      if (inp.horn) for (const pd of this.peds) if (pd.state === 'walk' && Math.hypot(pd.x - v.x, pd.z - v.z) < 9) pd.scare(v.x, v.z, 3);
      if (inp.consume('radio')) {
        this.audio.nextStation();
        this.radioTick++;
      }
      if (inp.consume('enter')) {
        if (Math.abs(v.vf) > 14) this.hint('Slow down before bailing out!', 2);
        else this.leaveVehicle(false);
      }
      if (inp.consume('mission')) this.play.toggleTaxi();
      inp.consume('jump'); inp.consume('nextWeapon'); inp.consume('prevWeapon');
      p.x = v.x; p.z = v.z; p.y = 0;
      return;
    }
    // ---- on foot
    let mvx = 0, mvz = 0, speed = 0;
    if (p.knockT > 0) {
      p.knockT -= dt;
      mvx = p.kvx * dt;
      mvz = p.kvz * dt;
      p.kvx *= 1 - Math.min(1, dt * 2.5);
      p.kvz *= 1 - Math.min(1, dt * 2.5);
    } else {
      const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
      let dx = fx * inp.moveY - fz * inp.moveX;
      let dz = fz * inp.moveY + fx * inp.moveX;
      const len = Math.hypot(dx, dz);
      if (len > 0.05) {
        dx /= len;
        dz /= len;
        speed = (inp.sprint ? 6.6 : 3.6) * Math.min(1, len);
        if (p.aimT <= 0) p.yaw += angleDiff(Math.atan2(dx, dz), p.yaw) * Math.min(1, dt * 12);
        mvx = dx * speed * dt;
        mvz = dz * speed * dt;
      }
      if ((inp.consume('jump') || inp.jump) && p.grounded) p.velY = 6.6;
      if (inp.consume('nextWeapon')) this.cycleWeapon(1);
      if (inp.consume('prevWeapon')) this.cycleWeapon(-1);
      if (inp.consume('enter')) this.tryEnterVehicle();
      inp.consume('radio'); inp.consume('mission');
      this.updateAim(dt);
      if (inp.fire && p.attackCd <= 0) this.attack();
    }
    p.speed = speed;
    p.velY -= 20 * dt;
    p.ctrl.computeColliderMovement(p.collider, { x: mvx, y: p.velY * dt, z: mvz }, undefined, G_QUERY);
    const m = p.ctrl.computedMovement();
    p.grounded = p.ctrl.computedGrounded();
    if (p.grounded && p.velY < 0) p.velY = 0;
    const t = p.body.translation();
    const nx = t.x + m.x, ny = Math.max(0.9, t.y + m.y), nz = t.z + m.z;
    p.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    p.x = nx; p.y = ny - 0.92; p.z = nz;
    if (p.y < 0) p.y = 0;
  }

  private updatePlayerVisual(dt: number) {
    const p = this.player;
    const g = p.rig.group;
    if (p.vehicle) {
      p.x = p.vehicle.x;
      p.z = p.vehicle.z;
      g.visible = false;
      return;
    }
    g.visible = true;
    const down = p.knockT > 0 || (p.dead && p.deadKind === 'wasted');
    p.tilt = damp(p.tilt, down ? -Math.PI / 2 : 0, 8, dt);
    p.visY = damp(p.visY, groundHeight(p.x, p.z), 12, dt);
    p.phase += dt * Math.min(17, p.speed * 3.4);
    g.position.set(p.x, p.y + p.visY + (down ? 0.14 : 0), p.z);
    g.rotation.y = p.yaw;
    g.rotation.x = p.tilt;
    const armed = p.weapon !== 'fist';
    p.rig.gun.visible = armed;
    if (down) animateHuman(p.rig, p.phase, 0, 'down');
    else if (p.punchT > 0) animateHuman(p.rig, p.phase, p.speed, 'punch', 1 - p.punchT / 0.3);
    else if (armed && p.aimT > 0) animateHuman(p.rig, p.phase, p.speed, 'aim');
    else animateHuman(p.rig, p.phase, p.grounded ? p.speed : 4, 'move');
  }

  cycleWeapon(dir: number) {
    const p = this.player;
    let i = WEAPON_ORDER.indexOf(p.weapon);
    for (let k = 0; k < WEAPON_ORDER.length; k++) {
      i = (i + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length;
      const id = WEAPON_ORDER[i];
      if (id === 'fist' || p.ammo[id] > 0) {
        p.weapon = id;
        break;
      }
    }
    this.audio.blip();
  }

  nearestVehicle(maxDist: number) {
    const p = this.player;
    let best: Vehicle | null = null, bd = maxDist;
    for (const v of this.vehicles) {
      if (v.wreck || v.fireT > 0) continue;
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  private tryEnterVehicle() {
    const p = this.player;
    const v = this.nearestVehicle(4.4);
    if (!v) return;
    if (v.driver === 'ai' || v.driver === 'cop') {
      // carjack: throw the driver out
      const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw);
      const d = this.addPed(v.x + lx * (v.spec.wid / 2 + 0.8), v.z + lz * (v.spec.wid / 2 + 0.8), v.driver === 'cop');
      d.yaw = v.yaw;
      if (!d.cop) d.scare(v.x, v.z, 12);
      this.addHeat(v.driver === 'cop' ? 1.2 : 0.45);
    }
    v.driver = 'player';
    v.ai = null;
    v.siren = false;
    p.vehicle = v;
    p.collider.setEnabled(false);
    p.knockT = 0;
    this.followYaw = v.yaw;
    this.carLook = 0;
    this.camPitch = 0.24;
    this.audio.radioOn(true);
    this.radioTick++;
    this.play.onEnterVehicle(v);
  }
  leaveVehicle(silent: boolean) {
    const p = this.player;
    const v = p.vehicle;
    if (!v) return;
    const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw);
    const side = v.spec.wid / 2 + 0.85;
    let ex = v.x + lx * side, ez = v.z + lz * side;
    if (this.castRay(v.x, 0.9, v.z, lx, 0, lz, side + 0.5, G_QUERY, v.body)) {
      ex = v.x - lx * side;
      ez = v.z - lz * side;
      if (this.castRay(v.x, 0.9, v.z, -lx, 0, -lz, side + 0.5, G_QUERY, v.body)) {
        const bx = -Math.sin(v.yaw), bz = -Math.cos(v.yaw);
        ex = v.x + bx * (v.spec.len / 2 + 0.9);
        ez = v.z + bz * (v.spec.len / 2 + 0.9);
      }
    }
    v.driver = 'none';
    v.gas = v.brk = 0;
    v.parkedT = 0;
    p.vehicle = null;
    p.collider.setEnabled(true);
    p.body.setTranslation({ x: ex, y: 0.92, z: ez }, true);
    p.x = ex; p.z = ez; p.y = 0; p.velY = 0;
    p.yaw = v.yaw;
    p.visY = groundHeight(ex, ez);
    this.camYaw = this.followYaw + this.carLook;
    this.audio.radioOn(false);
    this.audio.setHorn(false);
    if (!silent) this.play.onLeaveVehicle();
  }

  // ================================================================ combat
  private updateAim(dt: number) {
    const p = this.player;
    this.aimT -= dt;
    const w = WEAPONS[p.weapon];
    if (w.id === 'fist') {
      this.aimTarget = null;
      this.targetCone.visible = false;
      return;
    }
    if (this.aimT <= 0) {
      this.aimT = 0.12;
      const free = this.input.pointerLocked;
      const base = free ? this.camYaw : p.aimT > 0 || p.speed < 0.5 ? p.yaw : p.yaw;
      const cone = free ? 0.3 : 0.75;
      let best: Ped | null = null, bs = 1e9;
      for (const pd of this.peds) {
        if (!pd.standing || pd.state === 'wait') continue;
        const dx = pd.x - p.x, dz = pd.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > w.range * 0.75 || d < 0.5) continue;
        const a = Math.abs(angleDiff(Math.atan2(dx, dz), base));
        if (a > cone) continue;
        const hostile = pd.cop && this.stars > 0;
        const score = a * 30 + d - (hostile ? 25 : 0);
        if (score < bs && !this.castRay(p.x, 1.3, p.z, dx / d, 0, dz / d, d, G_QUERY_STATIC)) {
          bs = score;
          best = pd;
        }
      }
      this.aimTarget = best;
    }
    const t = this.aimTarget;
    if (t && t.standing) {
      this.targetCone.visible = true;
      this.targetCone.position.set(t.x, 2.35 + groundHeight(t.x, t.z), t.z);
      this.targetCone.rotation.y += dt * 4;
      const k = clamp(t.health / 60, 0, 1);
      (this.targetCone.material as THREE.MeshBasicMaterial).color.setRGB(1 - k, k, 0.15);
    } else {
      this.aimTarget = null;
      this.targetCone.visible = false;
    }
  }

  private attack() {
    const p = this.player;
    let w = WEAPONS[p.weapon];
    if (w.id !== 'fist' && p.ammo[w.id] <= 0) {
      p.weapon = 'fist';
      w = WEAPONS.fist;
    }
    p.attackCd = w.cd;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    if (w.id === 'fist') {
      p.punchT = 0.3;
      let hit = false;
      for (const pd of this.peds) {
        if (!pd.standing) continue;
        const dx = pd.x - p.x, dz = pd.z - p.z, d = Math.hypot(dx, dz);
        if (d > 1.9 || (dx * fx + dz * fz) / (d || 1) < 0.25) continue;
        hit = true;
        const killed = pd.hurt(w.dmg, fx * 3.5, fz * 3.5, pd.health - w.dmg <= 20 ? 2.5 : 0);
        this.fx.blood(pd.x, 1.4, pd.z);
        this.onPedHit(pd, killed);
      }
      for (const v of this.vehicles) {
        const dx = v.x - p.x, dz = v.z - p.z, d = Math.hypot(dx, dz);
        if (d < 3 && (dx * fx + dz * fz) / (d || 1) > 0.5) { hit = true; v.health -= 2; }
      }
      if (hit) this.audio.punch();
      return;
    }
    // firearms
    const t = this.aimTarget;
    const ox = p.x + fx * 0.5, oy = p.y + p.visY + 1.38, oz = p.z + fz * 0.5;
    let yaw = this.input.pointerLocked ? this.camYaw : p.yaw;
    let pitch = 0;
    if (t) {
      const dx = t.x - ox, dz = t.z - oz;
      yaw = Math.atan2(dx, dz);
      pitch = Math.atan2(groundHeight(t.x, t.z) + 1.05 - oy, Math.hypot(dx, dz));
    }
    p.yaw = yaw;
    p.aimT = 0.6;
    const o = this.v1.set(p.x + Math.sin(yaw) * 0.6, oy, p.z + Math.cos(yaw) * 0.6);
    for (let i = 0; i < w.pellets; i++) {
      const a = yaw + (Math.random() - 0.5) * 2 * w.spread;
      const pt = pitch + (Math.random() - 0.5) * w.spread;
      const dx = Math.sin(a) * Math.cos(pt), dy = Math.sin(pt), dz = Math.cos(a) * Math.cos(pt);
      const hit = this.castRay(o.x, o.y, o.z, dx, dy, dz, w.range, G_QUERY);
      let dist = hit ? hit.dist : w.range;
      let hitPed: Ped | null = null;
      for (const pd of this.peds) {
        if (pd.state === 'dead') continue;
        const cx = pd.x - o.x, cy = groundHeight(pd.x, pd.z) + pd.y + (pd.standing ? 1.0 : 0.3) - o.y, cz = pd.z - o.z;
        const tt = cx * dx + cy * dy + cz * dz;
        if (tt < 0 || tt > dist) continue;
        const perp2 = cx * cx + cy * cy + cz * cz - tt * tt;
        if (perp2 < 0.36) { dist = tt; hitPed = pd; }
      }
      const e = this.v2.set(o.x + dx * dist, o.y + dy * dist, o.z + dz * dist);
      this.fx.tracer(o, e);
      if (hitPed) {
        const killed = hitPed.hurt(w.dmg, dx * 2, dz * 2, 0);
        this.fx.blood(e.x, e.y, e.z);
        this.onPedHit(hitPed, killed);
      } else if (hit) {
        this.fx.spark(e.x, e.y, e.z);
        if (hit.veh && !hit.veh.wreck) {
          const v = hit.veh;
          v.health -= w.dmg * 0.55;
          if (v.driver === 'cop') this.addHeat(0.5);
          else if (v.driver === 'ai' && v.ai) v.ai.speed = 19;
        }
      }
    }
    this.fx.flash(o.x, o.y, o.z);
    this.audio.shot(w.id);
    this.shake = Math.max(this.shake, 0.12);
    p.ammo[w.id]--;
    if (p.ammo[w.id] <= 0) {
      p.weapon = 'fist';
      this.hint('Out of ammo.', 2);
    }
    let copNear = false;
    for (const pd of this.peds) {
      const d = Math.hypot(pd.x - p.x, pd.z - p.z);
      if (d < 45) pd.scare(p.x, p.z);
      if (pd.cop && d < 70) copNear = true;
    }
    this.addHeat(copNear || this.stars > 0 ? 0.25 : 0.06);
  }

  private onPedHit(pd: Ped, killed: boolean) {
    const p = this.player;
    this.addHeat(pd.cop ? (killed ? 1.5 : 1) : killed ? 0.7 : 0.35);
    if (pd.cop && pd.state === 'walk') pd.state = 'cop';
    if (killed && !pd.cop) this.play.dropCash(pd.x, pd.z, pd.cash);
    for (const o of this.peds) if (o !== pd && Math.hypot(o.x - p.x, o.z - p.z) < 16) o.scare(p.x, p.z);
  }

  private copShoot(c: Ped) {
    const p = this.player;
    const tx = p.x, tz = p.z, ty = p.vehicle ? 1.0 : p.y + 1.2;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    const o = this.v1.set(c.x + fx * 0.6, 1.4, c.z + fz * 0.6);
    const d = Math.hypot(tx - c.x, tz - c.z);
    let chance = 0.3 + this.stars * 0.05;
    if (!p.vehicle && p.speed > 5) chance *= 0.55;
    if (p.vehicle) chance = 0.7;
    const hit = Math.random() < chance;
    const miss = hit ? 0 : 1.2;
    const e = this.v2.set(tx + (Math.random() - 0.5) * miss * 2, ty + (Math.random() - 0.3) * miss, tz + (Math.random() - 0.5) * miss * 2);
    this.fx.tracer(o, e);
    this.fx.flash(o.x, o.y, o.z);
    this.audio.shot('pistol', clamp(1 - d / 60, 0.15, 0.8));
    if (!hit) return;
    if (p.vehicle) {
      p.vehicle.health -= 5 + this.stars;
      this.fx.spark(e.x, e.y, e.z);
      if (Math.random() < 0.25) this.damagePlayer(3);
    } else this.damagePlayer(6 + this.stars);
  }

  damagePlayer(d: number) {
    const p = this.player;
    if (p.dead || this.mode !== 'play') return;
    const a = Math.min(p.armor, d);
    p.armor -= a;
    p.health -= d - a;
    this.shake = Math.max(this.shake, 0.3);
    if (p.health <= 0) this.die('wasted');
  }
  die(kind: 'wasted' | 'busted') {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.deadKind = kind;
    p.deadT = 4.6;
    p.health = Math.max(0, p.health);
    this.big = { kind, text: kind === 'wasted' ? 'WASTED' : 'BUSTED', sub: '' };
    this.play.failMission('');
    this.audio.failed();
    this.audio.setHorn(false);
  }
  private respawn() {
    const p = this.player;
    const where = p.deadKind === 'wasted' ? this.world.hospital : this.world.police;
    for (const pd of this.peds) if (pd.cop) pd.remove = true;
    this.clearWanted();
    this.placePlayer(where.x, where.z, Math.PI);
    p.dead = false;
    p.health = 100;
    p.armor = 0;
    p.tilt = 0;
    p.knockT = 0;
    p.bustT = 0;
    const fee = Math.min(p.money, p.deadKind === 'wasted' ? 100 : 150);
    p.money -= fee;
    p.ammo = { pistol: 0, smg: 0, shotgun: 0 };
    p.weapon = 'fist';
    this.tod = (this.tod + 6) % 24;
    this.big = null;
    this.say(p.deadKind === 'wasted' ? `The hospital patched you up${fee ? ` for $${fee}` : ''}. Your weapons are gone.` : `You made bail${fee ? ` for $${fee}` : ''}. The cops kept your weapons.`, 6);
  }

  // ================================================================ vehicles
  private updateVehicles(dt: number) {
    const p = this.player;
    this.fxT -= dt;
    const emit = this.fxT <= 0;
    if (emit) this.fxT = 0.06;
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      v.postStep(dt);
      const dist = Math.hypot(v.x - p.x, v.z - p.z);
      if (v.crashImpact > 0 && dist < 60) {
        const mine = v === p.vehicle;
        this.audio.crash((v.crashImpact / 18) * (mine ? 1 : clamp(1 - dist / 60, 0, 0.6)));
        if (mine) {
          this.shake = Math.max(this.shake, Math.min(0.8, v.crashImpact / 18));
          if (v.crashImpact > 11) this.damagePlayer((v.crashImpact - 11) * 1.4);
        } else if (v.driver === 'cop' && p.vehicle && dist < 7 && v.crashImpact > 5) this.addHeat(0.5);
        if (v.rig.lightbar || mine) this.fx.spark(v.x, 0.8, v.z);
      }
      if (!v.wreck && v.health <= 0 && v.fireT < 0) {
        v.fireT = 3.4;
        if (v.driver === 'ai' || v.driver === 'cop') {
          const d = this.addPed(v.x + Math.cos(v.yaw) * 1.8, v.z - Math.sin(v.yaw) * 1.8, v.driver === 'cop');
          if (!d.cop) d.scare(v.x, v.z, 12);
          v.driver = 'none';
          v.ai = null;
        }
        if (v === p.vehicle) this.hint('The car is on fire - get out!', 3);
      }
      if (v.fireT > 0) {
        v.fireT -= dt;
        if (emit) {
          this.fx.fire(v.x + Math.sin(v.yaw) * 1.2, 1.1, v.z + Math.cos(v.yaw) * 1.2);
          if (Math.random() < 0.4) this.fx.smoke(v.x, 1.6, v.z);
        }
        if (v.fireT <= 0) this.explode(v);
      } else if (v.wreck) {
        v.wreckT += dt;
        if (emit && v.wreckT < 8 && Math.random() < 0.3) this.fx.smoke(v.x, 1.2, v.z);
        if ((v.wreckT > 30 && dist > 70) || v.wreckT > 100) v.remove = true;
      } else if (emit && v.health < v.spec.health * 0.35 && Math.random() < 0.35 && dist < 80) {
        this.fx.smoke(v.x + Math.sin(v.yaw) * 1.6, 1, v.z + Math.cos(v.yaw) * 1.6, v.health < v.spec.health * 0.15);
      }
      if (emit && v.skid > 0.5 && dist < 60 && Math.random() < 0.5) this.fx.smoke(v.x - Math.sin(v.yaw) * 1.6, 0.3, v.z - Math.cos(v.yaw) * 1.6, false);
      // cops leave their car to make the arrest
      if (v.driver === 'cop' && v.ai && v.ai.mode === 'pursuit' && this.stars > 0 && !p.dead) {
        const slow = !p.vehicle || Math.abs(p.vehicle.vf) < 4;
        if ((dist < 14 && Math.abs(v.vf) < 3 && slow) || (v.ai.stuckCount > 3 && dist < 45)) {
          v.driver = 'none';
          v.ai = null;
          v.siren = true;
          const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw), s = v.spec.wid / 2 + 0.8;
          this.addPed(v.x + lx * s, v.z + lz * s, true);
          if (this.stars > 1) this.addPed(v.x - lx * s, v.z - lz * s, true);
        }
      }
      if (v.driver === 'none' && !v.wreck) v.parkedT += dt;
      // despawn
      if (v !== p.vehicle) {
        const temp = v.driver === 'ai' || v.driver === 'cop' || (v.driver === 'none' && (v as any).temp);
        if (temp && (dist > 200 || (v.ai && v.ai.stuckCount > 5 && dist > 60) || (v.driver === 'none' && v.parkedT > 25 && dist > 90))) v.remove = true;
      }
      if (v.remove && v !== p.vehicle) {
        this.removeVehicle(v);
        this.vehicles.splice(i, 1);
      }
    }
    // headlights for the player's car at night
    const v = p.vehicle;
    if (v && this.env.night > 0.4) {
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      this.headlight.intensity = 70 * this.env.night;
      this.headlight.position.set(v.x + fx * 1.6, 1.1, v.z + fz * 1.6);
      this.headlight.target.position.set(v.x + fx * 20, 0, v.z + fz * 20);
    } else this.headlight.intensity = 0;
  }

  explode(v: Vehicle) {
    const p = this.player;
    this.fx.explosion(v.x, 0.5, v.z);
    const dist = Math.hypot(v.x - p.x, v.z - p.z);
    if (dist < 150) this.audio.explosion();
    this.shake = Math.max(this.shake, clamp(1.2 - dist / 40, 0, 1));
    const wasCop = !!v.rig.lightbar;
    v.fireT = -1;
    v.makeWreck();
    const R = 10;
    for (const pd of this.peds) {
      const dx = pd.x - v.x, dz = pd.z - v.z, d = Math.hypot(dx, dz);
      if (d < R) pd.hurt(200 * (1 - d / R), (dx / (d || 1)) * 8, (dz / (d || 1)) * 8, 6);
      else if (d < 50) pd.scare(v.x, v.z);
    }
    for (const o of this.vehicles) {
      if (o === v || o.wreck) continue;
      const dx = o.x - v.x, dz = o.z - v.z, d = Math.hypot(dx, dz);
      if (d < R) {
        o.health -= 80 * (1 - d / R);
        const lv = o.body.linvel();
        o.body.setLinvel({ x: lv.x + (dx / (d || 1)) * 7, y: 0, z: lv.z + (dz / (d || 1)) * 7 }, true);
      }
    }
    if (this.mode === 'play') {
      if (p.vehicle === v) {
        p.health = 0;
        this.leaveVehicle(true);
        p.knockT = 3;
        this.die('wasted');
      } else if (!p.vehicle && dist < R) {
        p.knockT = 1.8;
        p.kvx = ((p.x - v.x) / (dist || 1)) * 8;
        p.kvz = ((p.z - v.z) / (dist || 1)) * 8;
        this.damagePlayer(95 * (1 - dist / R));
      }
      if (dist < 120) this.addHeat(wasCop ? 1.5 : 1);
    }
  }

  private collideCarsWithPeople(dt: number) {
    const p = this.player;
    for (const v of this.vehicles) {
      const sp = v.speed;
      if (sp < 1) continue;
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      const hl = v.spec.len / 2 + 0.3, hw = v.spec.wid / 2 + 0.3;
      for (const pd of this.peds) {
        if (!pd.standing) continue;
        const rx = pd.x - v.x, rz = pd.z - v.z;
        if (Math.abs(rx) > 4 || Math.abs(rz) > 4) continue;
        const f = rx * fx + rz * fz, l = -rx * fz + rz * fx;
        if (Math.abs(f) > hl || Math.abs(l) > hw) continue;
        if (sp > 4) {
          const killed = pd.hurt(sp * 5, v.vx * 0.9, v.vz * 0.9, 2.5 + sp * 0.18);
          this.fx.blood(pd.x, 1, pd.z);
          if (this.distToPlayer(pd.x, pd.z) < 50) this.audio.punch();
          if (v === p.vehicle) this.onPedHit(pd, killed);
          v.health -= 1.5;
        } else {
          const s = l >= 0 ? 1 : -1;
          pd.x += -fz * s * dt * 3;
          pd.z += fx * s * dt * 3;
        }
      }
      if (!p.vehicle && !p.dead && p.knockT <= 0 && sp > 4.5 && this.mode === 'play') {
        const rx = p.x - v.x, rz = p.z - v.z;
        const f = rx * fx + rz * fz, l = -rx * fz + rz * fx;
        if (Math.abs(f) < hl && Math.abs(l) < hw && p.y < 1.2) {
          p.knockT = 1.5;
          p.kvx = v.vx * 0.7;
          p.kvz = v.vz * 0.7;
          this.audio.punch();
          this.damagePlayer(sp * 2.2);
        }
      }
    }
  }

  // ================================================================ wanted + spawning
  private updateWanted(dt: number) {
    const p = this.player;
    if (this.stars === 0) {
      this.heat = Math.max(0, this.heat - dt * 0.012);
      return;
    }
    let near = false, units = 0, foot = 0;
    for (const pd of this.peds) {
      if (!pd.cop || !pd.alive) continue;
      const d = this.distToPlayer(pd.x, pd.z);
      if (pd.state === 'walk' && d < 45) pd.state = 'cop';
      if (pd.state === 'cop') {
        foot++;
        if (d < 60) near = true;
        if (d > 110) pd.remove = true;
      }
    }
    for (const v of this.vehicles) {
      if (v.driver !== 'cop' || !v.ai) continue;
      const d = this.distToPlayer(v.x, v.z);
      if (v.ai.mode === 'cruise' && d < 150) {
        v.ai.mode = 'pursuit';
        v.ai.speed = 25;
        v.siren = true;
      }
      if (v.ai.mode === 'pursuit') {
        units++;
        if (d < 75) near = true;
      }
    }
    units += Math.ceil(foot / 2);
    if (near) this.evadeT = 0;
    else this.evadeT += dt;
    if (this.evadeT > 10 + this.stars * 5) {
      this.clearWanted();
      this.hint('You lost the cops.', 3);
      return;
    }
    this.dispatchCd -= dt;
    if (units < UNITS[this.stars] && this.dispatchCd <= 0 && !p.dead) {
      this.dispatchCd = 5.5 - this.stars * 0.6;
      this.spawnTraffic(false, true);
    }
  }

  private inView(x: number, z: number) {
    const c = this.camera.position;
    const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz) || 1;
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    return (dx * fx + dz * fz) / d > 0.5;
  }

  private spawnTraffic(initial: boolean, police = false) {
    const p = this.player;
    const ci = clamp(Math.round((p.x + HALF_W) / PITCH), 0, NX - 1), cj = clamp(Math.round((p.z + HALF_D) / PITCH), 0, NZ - 1);
    for (let tries = 0; tries < 8; tries++) {
      const i = clamp(ci + Math.floor(rand(-3, 4)), 0, NX - 1), j = clamp(cj + Math.floor(rand(-3, 4)), 0, NZ - 1);
      const [dx, dz] = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      const ni = i + dx, nj = j + dz;
      if (ni < 0 || nj < 0 || ni > NX - 1 || nj > NZ - 1) continue;
      const lane = pick(LANES);
      const pos = lanePoint(i, j, dx, dz, lane, rand(18, PITCH - 18));
      const d = this.distToPlayer(pos.x, pos.z);
      if (d > 175 || d < (initial ? 25 : 60)) continue;
      if (!initial && d < 125 && this.inView(pos.x, pos.z)) continue;
      let clear = true;
      for (const o of this.vehicles) if (Math.abs(o.x - pos.x) + Math.abs(o.z - pos.z) < 12) { clear = false; break; }
      if (!clear) continue;
      const r = Math.random();
      const kind = police ? 'police' : r < 0.34 ? 'sedan' : r < 0.5 ? 'taxi' : r < 0.64 ? 'van' : r < 0.8 ? 'muscle' : r < 0.93 ? 'sport' : 'police';
      const v = this.addVehicle(kind, pos.x, pos.z, Math.atan2(dx, dz));
      v.driver = kind === 'police' ? 'cop' : 'ai';
      v.startAI(police ? 'pursuit' : 'cruise', ni, nj, dx, dz, lane);
      v.siren = police;
      v.body.setLinvel({ x: dx * 8, y: 0, z: dz * 8 }, true);
      (v as any).temp = true;
      return v;
    }
    return null;
  }

  private spawnPed(initial: boolean) {
    const p = this.player;
    const pb = nearestCorner(p.x, p.z);
    for (let tries = 0; tries < 6; tries++) {
      const bi = clamp(pb.bi + Math.floor(rand(-1, 2)), 0, NX - 2), bj = clamp(pb.bj + Math.floor(rand(-1, 2)), 0, NZ - 2);
      const c = Math.floor(rand(4));
      const a = cornerPos(bi, bj, c), b = cornerPos(bi, bj, (c + 1) % 4);
      const t = Math.random();
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const d = this.distToPlayer(x, z);
      if (d > 125 || d < (initial ? 8 : 35)) continue;
      if (!initial && d < 70 && this.inView(x, z)) continue;
      const cop = Math.random() < 0.05;
      const pd = this.addPed(x, z, cop);
      if (cop) pd.state = 'walk';
      const fwd = Math.random() < 0.5;
      pd.from = { bi, bj, c: fwd ? c : (c + 1) % 4 };
      pd.to = { bi, bj, c: fwd ? (c + 1) % 4 : c };
      pd.setTarget(pd.to);
      pd.yaw = Math.atan2(pd.tx - x, pd.tz - z);
      return true;
    }
    return false;
  }

  private spawner() {
    const q = QUALITY[this.settings.quality];
    let cars = 0, civ = 0;
    for (const v of this.vehicles) if (v.ai && (v.driver === 'ai' || v.driver === 'cop')) cars++;
    for (const pd of this.peds) {
      if (!pd.cop || pd.state === 'walk') civ++;
      const d = this.distToPlayer(pd.x, pd.z);
      if (d > 135 && pd.state !== 'wait') pd.remove = true;
    }
    if (cars < q.cars) this.spawnTraffic(false);
    if (civ < q.peds) this.spawnPed(false);
  }

  // ================================================================ camera / audio
  private updateCamera(dt: number) {
    const p = this.player, inp = this.input, cam = this.camera;
    if (this.mode === 'menu') {
      // slow pendulum sweep over the beach, looking west at the skyline
      this.menuAng += dt * 0.06;
      const a = Math.sin(this.menuAng) * 1.05, cx = HALF_W + 6, cz = 12;
      cam.position.set(cx + Math.cos(a) * 34, 6.5 + Math.cos(this.menuAng * 0.8) * 2.5, cz + Math.sin(a) * 34);
      cam.lookAt(cx - 30, 9, cz);
      this.camYaw = Math.atan2(cx - cam.position.x, cz - cam.position.z);
      return;
    }
    const lx = inp.lookDX, ly = inp.lookDY;
    inp.lookDX = inp.lookDY = 0;
    const idle = performance.now() - inp.lastLook > 1400;
    let tx: number, ty: number, tz: number, dist: number, fov = 60;
    const v = p.vehicle;
    if (v) {
      this.revT = v.vf < -3 ? this.revT + dt : 0;
      const desired = v.yaw + (this.revT > 0.7 ? Math.PI : 0);
      this.followYaw += angleDiff(desired, this.followYaw) * Math.min(1, dt * (2.6 + v.speed * 0.08));
      this.carLook -= lx;
      this.camPitch = clamp(this.camPitch + ly, 0.04, 1.0);
      if (idle) {
        this.carLook = damp(angleDiff(this.carLook, 0), 0, 3, dt);
        this.camPitch = damp(this.camPitch, 0.24, 2, dt);
      }
      this.camYaw = this.followYaw + this.carLook;
      tx = v.x; ty = 1.55; tz = v.z;
      dist = 7.4 + v.speed * 0.06;
      fov = 60 + Math.min(16, v.speed * 0.3);
    } else {
      this.camYaw -= lx;
      this.camPitch = clamp(this.camPitch + ly, -0.3, 1.15);
      if (idle && !inp.pointerLocked && p.speed > 1 && p.aimT <= 0) {
        const d = angleDiff(p.yaw, this.camYaw);
        if (Math.abs(d) < 2.3) this.camYaw += d * Math.min(1, dt * 1.3);
      }
      tx = p.x; ty = p.y + p.visY + 1.55; tz = p.z;
      dist = 5.2;
    }
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const dx = -Math.sin(this.camYaw) * cp, dy = sp, dz = -Math.cos(this.camYaw) * cp;
    const hit = this.castRay(tx, ty, tz, dx, dy, dz, dist, G_QUERY_STATIC);
    const want = hit ? Math.max(0.9, hit.dist - 0.35) : dist;
    this.camDist = want < this.camDist ? want : damp(this.camDist, want, 5, dt);
    const s = this.shake * 0.25;
    cam.position.set(
      tx + dx * this.camDist + (Math.random() - 0.5) * s,
      Math.max(0.35, ty + dy * this.camDist + (Math.random() - 0.5) * s),
      tz + dz * this.camDist + (Math.random() - 0.5) * s,
    );
    cam.lookAt(tx, ty + 0.3, tz);
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov = damp(cam.fov, fov, 4, dt);
      cam.updateProjectionMatrix();
    }
  }

  private updateAudio() {
    const a = this.audio, p = this.player;
    if (!a.ctx) return;
    if (this.mode !== 'play') {
      a.setEngine(false, 0, 0);
      a.setSkid(0);
      a.setSiren(0);
      return;
    }
    const v = p.vehicle;
    if (v) {
      const k = Math.abs(v.vf) / v.spec.maxSpeed;
      const gear = (k * 4) % 1;
      a.setEngine(true, 0.12 + gear * 0.45 + k * 0.4, v.gas);
      a.setSkid(v.skid);
    } else {
      a.setEngine(false, 0, 0);
      a.setSkid(0);
    }
    let best = 1e9;
    for (const o of this.vehicles) if (o.siren && !o.wreck) best = Math.min(best, this.distToPlayer(o.x, o.z));
    a.setSiren(clamp(1 - best / 110, 0, 1));
    a.update();
  }

  // ================================================================ HUD
  private emitHud() {
    const p = this.player;
    const h = Math.floor(this.tod), m = Math.floor((this.tod - h) * 60);
    const v = p.vehicle;
    const near = !v && !p.dead ? this.nearestVehicle(4.4) : null;
    this.cb.onHud({
      health: Math.max(0, Math.ceil(p.health)), armor: Math.ceil(p.armor), money: p.money,
      wanted: this.stars, wantedFlash: this.stars > 0 && this.evadeT > 2.5,
      weapon: p.weapon, ammo: p.weapon === 'fist' ? -1 : p.ammo[p.weapon],
      clock: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      zone: zoneName(p.x, p.z), vehicle: v ? v.spec.name : '', inVehicle: !!v, canEnter: !!near, isTaxi: !!v && v.spec.id === 'taxi',
      speed: v ? Math.round(Math.abs(v.vf) * 2.6) : 0,
      subtitle: this.subtitle, help: this.help, big: this.big, timer: this.play.timerText(),
      radio: v ? this.audio.stationName : '', radioTick: this.radioTick,
      packages: this.play.packages.size, missions: this.play.passed,
    });
  }

  private drawMinimap() {
    const c = this.minimap;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    const S = c.width, R = S / 2, sc = S / 230;
    const p = this.player;
    const yaw = this.camYaw;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const a = -cs * sc, cc = sn * sc, b = -sn * sc, d = -cs * sc;
    const e = R - (a * p.x + cc * p.z), f = R - (b * p.x + d * p.z);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(R, R, R - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#1d6f8f';
    g.fillRect(0, 0, S, S);
    g.setTransform(a, b, cc, d, e, f);
    g.fillStyle = '#d9c48c';
    g.fillRect(ISLAND.minX, ISLAND.minZ, ISLAND.maxX - ISLAND.minX, ISLAND.maxZ - ISLAND.minZ);
    g.fillStyle = '#4a4a55';
    g.fillRect(-HALF_W - ROAD_W / 2, -HALF_D - ROAD_W / 2, 2 * HALF_W + ROAD_W + 7, 2 * HALF_D + ROAD_W);
    const pbi = Math.floor((p.x + HALF_W) / PITCH), pbj = Math.floor((p.z + HALF_D) / PITCH);
    for (let bi = Math.max(0, pbi - 2); bi <= Math.min(NX - 2, pbi + 2); bi++)
      for (let bj = Math.max(0, pbj - 2); bj <= Math.min(NZ - 2, pbj + 2); bj++) {
        const t = blockType(bi, bj);
        const bc = blockCenter(bi, bj);
        g.fillStyle = t === 'park' ? '#5fae5a' : t === 'lot' ? '#6a6a72' : t === 'beach' ? '#e2a8b8' : t === 'downtown' ? '#9aa8b8' : '#b9ab9c';
        g.fillRect(bc.x - BLOCK / 2, bc.z - BLOCK / 2, BLOCK, BLOCK);
      }
    g.setTransform(1, 0, 0, 1, 0, 0);
    const blip = (x: number, z: number, color: string, size: number, square = false, clampEdge = true) => {
      let mx = a * x + cc * z + e - R, my = b * x + d * z + f - R;
      const len = Math.hypot(mx, my);
      if (len > R - 7) {
        if (!clampEdge) return;
        mx *= (R - 7) / len;
        my *= (R - 7) / len;
      }
      g.fillStyle = color;
      g.strokeStyle = '#000';
      g.lineWidth = 1.5;
      g.beginPath();
      if (square) g.rect(R + mx - size, R + my - size, size * 2, size * 2);
      else g.arc(R + mx, R + my, size, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    };
    const flash = Math.floor(performance.now() / 250) % 2 === 0;
    for (const v of this.vehicles) if (v.siren && !v.wreck) blip(v.x, v.z, flash ? '#ff3050' : '#3070ff', 3.5, false, false);
    for (const pd of this.peds) if (pd.cop && pd.state === 'cop') blip(pd.x, pd.z, flash ? '#3070ff' : '#ff3050', 2.5, false, false);
    for (const bl of this.play.blips()) blip(bl.x, bl.z, bl.color, bl.size, bl.square);
    // north marker
    {
      const nx = -sn, ny = -cs; // world -z in map space
      const mx = (a * 0 + cc * -1) / sc, my = (b * 0 + d * -1) / sc;
      void nx; void ny;
      g.fillStyle = '#fff';
      g.strokeStyle = '#000';
      g.font = `bold ${Math.round(S * 0.1)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.strokeText('N', R + mx * (R - 12), R + my * (R - 12));
      g.fillText('N', R + mx * (R - 12), R + my * (R - 12));
    }
    // player arrow
    g.translate(R, R);
    g.rotate(-(p.vehicle ? p.vehicle.yaw - yaw : p.yaw - yaw));
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 6);
    g.lineTo(0, 3);
    g.lineTo(-5, 6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.strokeStyle = '#111';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(R, R, R - 2, 0, Math.PI * 2);
    g.stroke();
    void roadX; void roadZ;
  }
}
