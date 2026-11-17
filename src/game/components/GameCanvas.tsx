"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { soundManager } from "../audio/soundManager";
import { CityBuilder, CityData } from "../models/cityBuilder";
import { VehicleBuilder, VehicleData, VehicleType } from "../models/vehicleBuilder";
import { CharacterBuilder, CharacterRig } from "../models/characterBuilder";
import { TrafficSystem } from "../systems/trafficSystem";
import { PedestrianSystem } from "../systems/pedestrianSystem";
import { PoliceSystem } from "../systems/policeSystem";
import { MissionSystem, ActiveMission } from "../systems/missionSystem";
import { createInputState, resetInput } from "../input/inputState";
import { HUD } from "./HUD";
import { PauseMenu } from "./PauseMenu";
import { MobileControls } from "./MobileControls";

type Quality = "low" | "medium" | "high" | "ultra";

const TAU = Math.PI * 2;
const SPAWN = { x: -50, y: 0.5, z: 6 };

const WEAPON_ORDER = ["fist", "pistol", "smg", "shotgun", "rpg"] as const;
type WeaponId = (typeof WEAPON_ORDER)[number];

const WEAPONS: Record<WeaponId, { clip: number; reserve: number; rate: number; dmg: number; range: number }> = {
  fist: { clip: 0, reserve: 0, rate: 0.45, dmg: 35, range: 2.5 },
  pistol: { clip: 15, reserve: 90, rate: 0.32, dmg: 45, range: 70 },
  smg: { clip: 30, reserve: 240, rate: 0.09, dmg: 25, range: 60 },
  shotgun: { clip: 8, reserve: 40, rate: 0.85, dmg: 80, range: 35 },
  rpg: { clip: 1, reserve: 6, rate: 1.6, dmg: 200, range: 90 },
};

// Quality ladder. Adaptive quality walks DOWN this list when the FPS is too low.
const LEVELS: { ratio: number; shadow: number; cap: number }[] = [
  { ratio: 1.5, shadow: 1024, cap: 0 }, // 0 ultra
  { ratio: 1.25, shadow: 1024, cap: 0 }, // 1 high
  { ratio: 1.0, shadow: 512, cap: 0 }, // 2 medium
  { ratio: 0.8, shadow: 0, cap: 0 }, // 3 low
  { ratio: 0.65, shadow: 0, cap: 30 }, // 4 very low (30 fps cap = steady pacing)
  { ratio: 0.5, shadow: 0, cap: 30 }, // 5 minimum
];
const LABEL_TO_LEVEL: Record<Quality, number> = { ultra: 0, high: 1, medium: 2, low: 3 };
const levelToLabel = (l: number): Quality => (l <= 0 ? "ultra" : l === 1 ? "high" : l === 2 ? "medium" : "low");

const ZONE_LABEL: Record<string, string> = {
  bank_vault: "Kasayı Soy +$25.000",
  ammunation: "Cephane + Yelek -$1.000",
  pay_n_spray: "Tamir + Aranmayı Sil -$500",
  dock_dropoff: "Teslim Et +$10.000",
};

const VEHICLE_NAMES: Record<VehicleType, string> = {
  supercar: "Pegassi Torero GT",
  police: "Police Interceptor",
  muscle: "Vapid Dominator GTX",
  suv: "Mammoth Patriot 4x4",
};

const INITIAL_HUD = {
  health: 100,
  armor: 50,
  cash: 15000,
  cashDelta: null as number | null,
  wantedStars: 0,
  isCoolingDown: false,
  currentWeapon: "pistol" as string,
  ammoText: "15 / 90",
  inVehicle: false,
  speed: 0,
  vehicleHealth: 300,
  vehicleMax: 300,
  vehicleName: "",
  radio: "Synthwave Vice 80s",
  hint: null as string | null,
  canInteract: false,
  toast: null as string | null,
  mission: null as ActiveMission | null,
  missionTimer: null as number | null,
  px: 0,
  pz: 0,
  heading: 0,
  police: [] as { x: number; z: number }[],
  policeKey: "",
  wasted: false,
  banner: null as { title: string; reward: number } | null,
};
type HudState = typeof INITIAL_HUD;

interface EngineApi {
  setMenuOpen: (open: boolean) => void;
  setQuality: (q: Quality) => void;
  setTime: (h: number) => void;
  spawnCar: (type: VehicleType, colorHex: string) => void;
  startMission: (id: string) => void;
  changeCamera: () => void;
  interact: () => void;
  getSaveData: () => Record<string, unknown>;
}

const angleDelta = (a: number, b: number) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

export const GameCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef(createInputState());
  const apiRef = useRef<EngineApi | null>(null);

  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPauseMenuOpen, setIsPauseMenuOpen] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState(16.5);
  const [graphicsQuality, setGraphicsQuality] = useState<Quality>("medium");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  // ------------------------------------------------------------------
  // ENGINE (created ONCE. The old code rebuilt the whole city whenever cash/weapon changed.)
  // ------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const input = inputRef.current;

    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
    const cores = navigator.hardwareConcurrency ?? 4;
    const strong = mem >= 6 && cores >= 8;
    let level = strong ? 1 : 2;
    let hzCap = 0; // ms, set when a >100Hz display is detected
    let capInterval = 0;

    // ---- renderer ----
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: strong,
      alpha: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    // ---- scene / camera ----
    const scene = new THREE.Scene();
    const bg = new THREE.Color(0x431407);
    scene.background = bg;
    const fog = new THREE.FogExp2(0x3b1812, 0.0045);
    scene.fog = fog;

    const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.4, 330);
    camera.position.set(0, 5, 10);
    let baseFov = 65;

    // exactly 3 lights in the whole game (hundreds of lights were the main cause of the lag)
    const hemiLight = new THREE.HemisphereLight(0xfbbf24, 0x451a03, 0.8);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xf97316, 1.4);
    const SHADOW_EXTENT = 70;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 420;
    dirLight.shadow.camera.left = -SHADOW_EXTENT;
    dirLight.shadow.camera.right = SHADOW_EXTENT;
    dirLight.shadow.camera.top = SHADOW_EXTENT;
    dirLight.shadow.camera.bottom = -SHADOW_EXTENT;
    dirLight.shadow.bias = -0.0008;
    dirLight.shadow.camera.updateProjectionMatrix();
    scene.add(dirLight, dirLight.target);
    const sunDir = new THREE.Vector3(0.5, 0.7, 0.4).normalize();

    const headlight = new THREE.SpotLight(0xfff2d6, 0, 70, Math.PI / 5, 0.6, 1.0);
    scene.add(headlight, headlight.target);

    // fake muzzle flash / explosion flash (no dynamic lights -> no shader recompiles)
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 0.9 })
    );
    flash.visible = false;
    scene.add(flash);
    let flashTimer = 0;

    // ---- world ----
    const city: CityData = CityBuilder.buildCity();
    scene.add(city.root);
    scene.add(city.oceanMesh);

    const drivable: VehicleData[] = [];
    const colorFor = (t: VehicleType) => (t === "supercar" ? 0xef4444 : t === "police" ? 0x0f172a : 0xf59e0b);
    city.carSpawns.forEach((sp) => {
      const v = VehicleBuilder.createVehicle(sp.type, colorFor(sp.type));
      v.mesh.position.set(sp.x, sp.y, sp.z);
      v.mesh.rotation.y = sp.rotY;
      scene.add(v.mesh);
      drivable.push(v);
    });
    const starter = VehicleBuilder.createVehicle("supercar", 0xe63946);
    starter.mesh.position.set(-44, 0.1, 12);
    scene.add(starter.mesh);
    drivable.push(starter);

    const player: CharacterRig = CharacterBuilder.createCharacter(false, 0);
    player.root.position.set(SPAWN.x, SPAWN.y, SPAWN.z);
    scene.add(player.root);

    const light = level >= 3;
    const traffic = new TrafficSystem(scene, light ? 4 : 6);
    const pedestrians = new PedestrianSystem(scene, light ? 6 : 9);
    const police = new PoliceSystem(scene);
    const missions = new MissionSystem(scene);
    soundManager.setRadioStation(1);

    // ---- game state (plain variables: no React re-render per frame) ----
    const st = { health: 100, armor: 50, cash: 15000 };
    let weapon: WeaponId = "pistol";
    const ammoStore: Record<WeaponId, { clip: number; reserve: number }> = {
      fist: { clip: 0, reserve: 0 },
      pistol: { clip: 15, reserve: 90 },
      smg: { clip: 30, reserve: 240 },
      shotgun: { clip: 8, reserve: 40 },
      rpg: { clip: 1, reserve: 6 },
    };
    let reloadTimer = 0;
    let fireCooldown = 0;
    let punchAnim = 0;
    let gunfireTimer = 0;
    let dmgCooldown = 0;

    let current: VehicleData | null = null;
    let cameraYaw = 0;
    let cameraPitch = 0.25;
    let cameraDistance = 5.5;
    let cameraMode = 0;
    let camYawOffset = 0;
    let lastLookAt = 0;
    const playerVel = new THREE.Vector3();
    let grounded = true;
    let radioIndex = 1;
    let radioName = "Synthwave Vice 80s";
    let hour = 16.5;
    let isNight = false;
    let wasted = false;
    let wastedTimer = 0;
    let beaconPhase = 0;
    let cashDelta: number | null = null;
    let cashDeltaUntil = 0;
    let toast: string | null = null;
    let toastUntil = 0;
    let banner: { title: string; reward: number } | null = null;
    let bannerUntil = 0;
    const zoneCooldown = new Map<string, number>();

    let menuOpen = false;
    let hidden = document.hidden;
    let portrait = window.innerHeight > window.innerWidth;
    let paused = false;
    const updatePaused = () => {
      paused = menuOpen || hidden || portrait;
      if (paused) resetInput(input);
    };

    // reusable temporaries: no per-frame allocation (GC pauses = micro stutter on phones)
    const UP = new THREE.Vector3(0, 1, 0);
    const tA = new THREE.Vector3();
    const tB = new THREE.Vector3();
    const tC = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const NDC = new THREE.Vector2(0, 0);

    const say = (text: string, ms = 2500) => {
      toast = text;
      toastUntil = performance.now() + ms;
    };
    const awardCash = (amount: number) => {
      st.cash += amount;
      cashDelta = amount;
      cashDeltaUntil = performance.now() + 2500;
      soundManager.playCashEarned();
    };
    const spendCash = (amount: number) => {
      st.cash = Math.max(0, st.cash - amount);
      cashDelta = -amount;
      cashDeltaUntil = performance.now() + 2500;
    };

    // ---- renderer sizing / quality ----
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let ratio = 1;
    const resize = () => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      renderer.setPixelRatio(ratio);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const applyLevel = (lv: number) => {
      level = Math.max(0, Math.min(LEVELS.length - 1, lv));
      const L = LEVELS[level];
      ratio = Math.min(dpr, L.ratio);
      resize();
      const on = L.shadow > 0;
      if (on && dirLight.shadow.mapSize.x !== L.shadow) {
        dirLight.shadow.mapSize.set(L.shadow, L.shadow);
        if (dirLight.shadow.map) {
          dirLight.shadow.map.dispose();
          dirLight.shadow.map = null;
        }
      }
      if (dirLight.castShadow !== on) dirLight.castShadow = on;
      capInterval = L.cap ? 1000 / L.cap : hzCap;
      setGraphicsQuality(levelToLabel(level));
    };

    // ---- lighting / time of day ----
    const applyTime = (h: number) => {
      hour = h;
      const angle = ((h - 6) / 24) * TAU;
      isNight = h < 6 || h > 19;
      const dusk = (h >= 17 && h <= 19) || (h >= 5 && h <= 7);

      if (isNight) sunDir.set(-0.3, 0.8, 0.3).normalize();
      else sunDir.set(Math.cos(angle) * 0.8, Math.max(0.3, Math.sin(angle)), 0.35).normalize();

      if (isNight) {
        dirLight.color.setHex(0x3b82f6);
        dirLight.intensity = 0.6;
        hemiLight.color.setHex(0x334155);
        hemiLight.groundColor.setHex(0x0a0f1d);
        hemiLight.intensity = 0.7;
        fog.color.setHex(0x090e17);
        fog.density = 0.0055;
        bg.setHex(0x090e17);
        city.windowMat.emissiveIntensity = 0.95;
        city.lampMat.color.setHex(0xfff3c4);
        city.glowPools.visible = true;
      } else if (dusk) {
        dirLight.color.setHex(0xf97316);
        dirLight.intensity = 1.5;
        hemiLight.color.setHex(0xfbbf24);
        hemiLight.groundColor.setHex(0x451a03);
        hemiLight.intensity = 0.85;
        fog.color.setHex(0x3b1812);
        fog.density = 0.0045;
        bg.setHex(0x3b1812);
        city.windowMat.emissiveIntensity = 0.5;
        city.lampMat.color.setHex(0xfff3c4);
        city.glowPools.visible = true;
      } else {
        dirLight.color.setHex(0xfff5e6);
        dirLight.intensity = 1.9;
        hemiLight.color.setHex(0xbae6fd);
        hemiLight.groundColor.setHex(0x334155);
        hemiLight.intensity = 0.9;
        fog.color.setHex(0x93c5fd);
        fog.density = 0.0042;
        bg.setHex(0x93c5fd);
        city.windowMat.emissiveIntensity = 0;
        city.lampMat.color.setHex(0xcfc7a6);
        city.glowPools.visible = false;
      }
      drivable.forEach((v) => VehicleBuilder.setHeadlights(v, isNight));
      traffic.cars.forEach((c) => VehicleBuilder.setHeadlights(c.vehicle, isNight));
      setTimeOfDay(h);
    };

    // ---- player / vehicle helpers ----
    const forwardOf = (rotY: number, out: THREE.Vector3) => out.set(Math.sin(rotY), 0, Math.cos(rotY));

    const switchWeapon = (w: WeaponId) => {
      weapon = w;
      reloadTimer = 0;
      CharacterBuilder.setWeapon(player, w);
    };
    const cycleWeapon = () => {
      const i = WEAPON_ORDER.indexOf(weapon);
      switchWeapon(WEAPON_ORDER[(i + 1) % WEAPON_ORDER.length]);
    };

    const damagePlayer = (amount: number) => {
      if (wasted || amount <= 0) return;
      if (st.armor > 0) {
        const a = Math.min(st.armor, amount);
        st.armor -= a;
        amount -= a;
      }
      st.health = Math.max(0, st.health - amount);
      if (st.health <= 0) {
        wasted = true;
        wastedTimer = 4;
        soundManager.playWasted();
        resetInput(input);
      }
    };

    const respawn = () => {
      if (current) {
        current.isEngineOn = false;
        current.currentSpeed = 0;
        soundManager.stopEngine();
        current = null;
      }
      player.root.visible = true;
      player.root.position.set(SPAWN.x, SPAWN.y, SPAWN.z);
      playerVel.set(0, 0, 0);
      st.health = 100;
      st.armor = 50;
      wasted = false;
      police.clearWanted();
    };

    const enterVehicle = (car: VehicleData) => {
      current = car;
      car.isEngineOn = true;
      soundManager.startEngine();
      player.root.visible = false;
      camYawOffset = 0;
      cameraPitch = 0.25;
      VehicleBuilder.setHeadlights(car, isNight);
    };

    const exitVehicle = () => {
      const car = current;
      if (!car) return;
      car.isEngineOn = false;
      car.currentSpeed = 0;
      VehicleBuilder.setBraking(car, false);
      soundManager.stopEngine();
      current = null;
      const ry = car.mesh.rotation.y;
      player.root.visible = cameraMode !== 2;
      // door side = car's left
      player.root.position.set(
        car.mesh.position.x + Math.cos(ry) * 2.4,
        0.5,
        car.mesh.position.z - Math.sin(ry) * 2.4
      );
      player.root.rotation.y = ry;
      cameraYaw = ry + Math.PI;
      playerVel.set(0, 0, 0);
    };

    // ---- context-sensitive interaction (one button for car / shops / robbery) ----
    type Near =
      | { kind: "none" }
      | { kind: "exit"; label: string }
      | { kind: "car"; car: VehicleData; label: string }
      | { kind: "zone"; zone: CityData["interactiveZones"][number]; label: string };

    const computeNearby = (pos: THREE.Vector3, now: number): Near => {
      for (const zone of city.interactiveZones) {
        if (pos.distanceTo(zone.position) >= zone.radius) continue;
        if (zone.type === "pay_n_spray" && !current) continue;
        if ((zoneCooldown.get(zone.id) ?? 0) > now) continue;
        if (zone.type === "mission_start") continue;
        return { kind: "zone", zone, label: ZONE_LABEL[zone.type] ?? zone.label };
      }
      if (current) return { kind: "exit", label: "Araçtan İn" };
      let best: VehicleData | null = null;
      let bestD = 4.2;
      for (const v of drivable) {
        const d = v.mesh.position.distanceTo(pos);
        if (d < bestD) {
          bestD = d;
          best = v;
        }
      }
      if (best) return { kind: "car", car: best, label: "Araca Bin" };
      return { kind: "none" };
    };

    const activateZone = (zone: CityData["interactiveZones"][number], now: number) => {
      zoneCooldown.set(zone.id, now + 20000); // stops accidental double taps / money farming
      if (zone.type === "bank_vault") {
        soundManager.playExplosion();
        awardCash(25000);
        police.setWantedStars(3);
        say("Kasa patlatıldı! +$25.000 — Polisten kaç!", 3500);
      } else if (zone.type === "ammunation") {
        if (st.cash >= 1000) {
          spendCash(1000);
          st.armor = 100;
          WEAPON_ORDER.forEach((w) => {
            if (w === "fist") return;
            ammoStore[w].clip = WEAPONS[w].clip;
            ammoStore[w].reserve = WEAPONS[w].reserve * 2;
          });
          soundManager.playCashEarned();
          say("Ammu-Nation: Yelek ve cephane yenilendi!");
        } else {
          zoneCooldown.set(zone.id, 0);
          say("Yetersiz bakiye! ($1.000 gerekli)");
        }
      } else if (zone.type === "pay_n_spray" && current) {
        if (st.cash >= 500) {
          spendCash(500);
          current.health = current.maxHealth;
          police.clearWanted();
          soundManager.playCashEarned();
          say("Araç tamir edildi, aranma seviyesi sıfırlandı!");
        } else {
          zoneCooldown.set(zone.id, 0);
          say("Yetersiz bakiye! ($500 gerekli)");
        }
      } else if (zone.type === "dock_dropoff") {
        awardCash(10000);
        say("Liman teslimatı tamamlandı! +$10.000");
      }
    };

    const interact = () => {
      if (wasted) return;
      const now = performance.now();
      const pos = current ? current.mesh.position : player.root.position;
      const n = computeNearby(pos, now);
      if (n.kind === "zone") activateZone(n.zone, now);
      else if (n.kind === "exit") exitVehicle();
      else if (n.kind === "car") enterVehicle(n.car);
    };

    // ---- shooting ----
    const startReload = () => {
      const slot = ammoStore[weapon];
      if (reloadTimer > 0 || slot.reserve <= 0 || slot.clip >= WEAPONS[weapon].clip) return;
      reloadTimer = 1.1;
    };

    const showFlash = (x: number, y: number, z: number, scale: number, ms: number) => {
      flash.position.set(x, y, z);
      flash.scale.setScalar(scale);
      flash.visible = true;
      flashTimer = ms / 1000;
    };

    const fireWeapon = () => {
      const def = WEAPONS[weapon];
      gunfireTimer = 2.5;

      if (weapon === "fist") {
        soundManager.playGunshot("fist");
        punchAnim = 0.3;
        const pPos = player.root.position;
        pedestrians.pedestrians.forEach((p, idx) => {
          if (p.isDead || p.rig.root.position.distanceTo(pPos) >= def.range) return;
          const res = pedestrians.damagePedestrian(idx, def.dmg);
          soundManager.playHitMarker();
          if (res.killed) {
            awardCash(res.cash);
            police.addWantedStars(1);
          }
        });
        return;
      }

      const slot = ammoStore[weapon];
      if (reloadTimer > 0) return;
      if (slot.clip <= 0) {
        startReload();
        return;
      }
      slot.clip--;
      soundManager.playGunshot(weapon);

      const fwd = forwardOf(player.root.rotation.y, tA);
      showFlash(
        player.root.position.x + fwd.x * 0.9,
        player.root.position.y + 1.35,
        player.root.position.z + fwd.z * 0.9,
        weapon === "rpg" ? 2 : 1,
        50
      );

      raycaster.setFromCamera(NDC, camera);
      const origin = raycaster.ray.origin;
      const dir = raycaster.ray.direction;

      let bestT = Infinity;
      let hitPed = -1;
      let hitCar: VehicleData | null = null;

      pedestrians.pedestrians.forEach((p, idx) => {
        if (p.isDead) return;
        tB.copy(p.rig.root.position);
        tB.y += 1;
        tC.subVectors(tB, origin);
        const t = tC.dot(dir);
        if (t <= 0 || t > def.range || t >= bestT) return;
        if (raycaster.ray.distanceToPoint(tB) < 1.5) {
          bestT = t;
          hitPed = idx;
          hitCar = null;
        }
      });
      for (const v of drivable) {
        tB.copy(v.mesh.position);
        tB.y += 0.8;
        tC.subVectors(tB, origin);
        const t = tC.dot(dir);
        if (t <= 0 || t > def.range || t >= bestT) continue;
        if (raycaster.ray.distanceToPoint(tB) < 2.4) {
          bestT = t;
          hitCar = v;
          hitPed = -1;
        }
      }

      if (hitPed >= 0) {
        const res = pedestrians.damagePedestrian(hitPed, def.dmg);
        soundManager.playHitMarker();
        if (res.killed) {
          awardCash(res.cash);
          police.addWantedStars(1);
        }
      } else if (hitCar) {
        const car: VehicleData = hitCar;
        car.health -= weapon === "rpg" ? 180 : def.dmg;
        soundManager.playHitMarker();
        if (car.health <= 0) {
          soundManager.playExplosion();
          showFlash(car.mesh.position.x, car.mesh.position.y + 1, car.mesh.position.z, 6, 150);
          scene.remove(car.mesh);
          const i = drivable.indexOf(car);
          if (i >= 0) drivable.splice(i, 1);
          police.addWantedStars(2);
        }
      }

      if (slot.clip <= 0) startReload();
    };

    // ---- events ----
    const onResize = () => {
      portrait = window.innerHeight > window.innerWidth;
      setIsPortrait(portrait);
      updatePaused();
      resize();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    const onVisibility = () => {
      hidden = document.hidden;
      if (hidden) soundManager.suspend();
      else soundManager.resume();
      updatePaused();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    const blockDefault = (e: Event) => e.preventDefault();
    container.addEventListener("contextmenu", blockDefault);
    container.addEventListener("touchmove", blockDefault, { passive: false });
    document.addEventListener("gesturestart", blockDefault as EventListener);

    // ---- initial setup ----
    applyLevel(level);
    applyTime(16.5);
    updatePaused();
    setIsPortrait(portrait);

    // ---- HUD sync (10 Hz, only when something changed) ----
    let lastHud: HudState = INITIAL_HUD;
    let lastSync = 0;
    const syncHud = (now: number, hint: string | null, canInteract: boolean) => {
      const pos = current ? current.mesh.position : player.root.position;
      const slot = ammoStore[weapon];
      const ammoText =
        weapon === "fist" ? "∞" : reloadTimer > 0 ? "ŞARJÖR..." : `${slot.clip} / ${slot.reserve}`;
      const m = missions.currentMission;
      const policeList = police.policeUnits.map((u) => ({
        x: Math.round(u.vehicle.mesh.position.x),
        z: Math.round(u.vehicle.mesh.position.z),
      }));
      const policeKey = policeList.map((p) => `${p.x},${p.z}`).join(";");
      const heading = current ? current.mesh.rotation.y : cameraYaw + Math.PI;

      const next: HudState = {
        health: Math.round(st.health),
        armor: Math.round(st.armor),
        cash: st.cash,
        cashDelta: now < cashDeltaUntil ? cashDelta : null,
        wantedStars: police.wantedStars,
        isCoolingDown: police.isCoolingDown,
        currentWeapon: weapon,
        ammoText,
        inVehicle: !!current,
        speed: current ? Math.round(Math.abs(current.currentSpeed) * 3.6) : 0,
        vehicleHealth: current ? Math.round(current.health) : 0,
        vehicleMax: current ? current.maxHealth : 300,
        vehicleName: current ? VEHICLE_NAMES[current.type] : "",
        radio: radioName,
        hint,
        canInteract,
        toast: now < toastUntil ? toast : null,
        mission: m,
        missionTimer: m && m.timerRemaining !== undefined ? Math.max(0, Math.ceil(m.timerRemaining)) : null,
        px: Math.round(pos.x),
        pz: Math.round(pos.z),
        heading: Math.round(heading * 20) / 20,
        police: policeKey === lastHud.policeKey ? lastHud.police : policeList,
        policeKey,
        wasted,
        banner: now < bannerUntil ? banner : null,
      };
      let changed = false;
      for (const k of Object.keys(next) as (keyof HudState)[]) {
        if (next[k] !== lastHud[k]) {
          changed = true;
          break;
        }
      }
      if (changed) {
        lastHud = next;
        setHud(next);
      }
    };

    // ---- main loop ----
    let raf = 0;
    let lastTime = performance.now();
    const startTime = lastTime;
    const hzSamples: number[] = [];
    let fpsFrames = 0;
    let fpsAcc = 0;
    let lastAdapt = 0;

    const loop = (time: number) => {
      raf = requestAnimationFrame(loop);
      if (paused) {
        lastTime = time;
        return;
      }
      const elapsed = time - lastTime;
      if (capInterval && elapsed < capInterval * 0.85) return;

      // detect 90/120 Hz screens and cap them at 60 (battery/heat) without hurting 60 Hz phones
      if (hzSamples.length < 90) {
        hzSamples.push(elapsed);
        if (hzSamples.length === 90) {
          const sorted = [...hzSamples].sort((a, b) => a - b);
          if (sorted[45] < 10.5) {
            hzCap = 1000 / 60;
            if (!LEVELS[level].cap) capInterval = hzCap;
          }
        }
      }
      lastTime = time;
      const delta = Math.min(elapsed / 1000, 0.05);
      const now = time;

      // adaptive quality
      fpsFrames++;
      fpsAcc += elapsed;
      if (fpsAcc >= 2000) {
        const fps = (fpsFrames * 1000) / fpsAcc;
        fpsFrames = 0;
        fpsAcc = 0;
        const threshold = LEVELS[level].cap ? 24 : 42;
        if (now - startTime > 5000 && now - lastAdapt > 4000 && fps < threshold && level < LEVELS.length - 1) {
          lastAdapt = now;
          applyLevel(level + 1);
        }
      }

      // ---------- input consumption ----------
      const lookSens = 0.0055;
      const lookX = input.lookDX;
      const lookY = input.lookDY;
      input.lookDX = 0;
      input.lookDY = 0;

      if (input.weaponQueued) {
        input.weaponQueued = false;
        if (!current) cycleWeapon();
      }
      if (input.interactQueued) {
        input.interactQueued = false;
        interact();
      }
      if (wasted) {
        wastedTimer -= delta;
        if (wastedTimer <= 0) respawn();
        input.moveX = input.moveY = 0;
      }

      // ---------- timers ----------
      if (fireCooldown > 0) fireCooldown -= delta;
      if (gunfireTimer > 0) gunfireTimer -= delta;
      if (dmgCooldown > 0) dmgCooldown -= delta;
      if (punchAnim > 0) punchAnim -= delta;
      if (flashTimer > 0) {
        flashTimer -= delta;
        if (flashTimer <= 0) flash.visible = false;
      }
      if (reloadTimer > 0) {
        reloadTimer -= delta;
        if (reloadTimer <= 0) {
          const slot = ammoStore[weapon];
          const take = Math.min(WEAPONS[weapon].clip - slot.clip, slot.reserve);
          slot.clip += take;
          slot.reserve -= take;
        }
      }

      city.oceanMesh.position.y = -0.6 + Math.sin(time * 0.0015) * 0.12;
      beaconPhase += delta;
      if (beaconPhase > 1) beaconPhase = 0;
      city.beaconMat.color.setHex(beaconPhase < 0.25 ? 0xff2222 : 0x330000);

      let focus: THREE.Vector3;

      if (current) {
        // ======================= DRIVING =======================
        const car = current;
        focus = car.mesh.position;

        if (input.hornQueued) {
          input.hornQueued = false;
          soundManager.playHorn();
        }
        if (input.lightsQueued) {
          input.lightsQueued = false;
          VehicleBuilder.setHeadlights(car, !car.isHeadlightsOn);
        }
        if (input.radioQueued) {
          input.radioQueued = false;
          radioIndex = (radioIndex + 1) % 4;
          radioName = soundManager.setRadioStation(radioIndex);
        }

        const speedNorm = Math.min(1, Math.abs(car.currentSpeed) / car.topSpeed);
        const steerIn = Math.abs(input.moveX) > 0.08 ? input.moveX : 0;
        const maxSteer = 0.45 * (1 - 0.5 * speedNorm);
        car.steerAngle = THREE.MathUtils.lerp(car.steerAngle, -steerIn * maxSteer, 1 - Math.exp(-delta * 9));
        car.frontLeftSteer.rotation.y = car.steerAngle;
        car.frontRightSteer.rotation.y = car.steerAngle;

        if (input.gas) {
          const boost = car.currentSpeed < 0 ? 2 : 1;
          car.currentSpeed = Math.min(car.topSpeed, car.currentSpeed + car.acceleration * boost * delta);
        } else if (input.brake) {
          if (car.currentSpeed > 0.5) car.currentSpeed = Math.max(0, car.currentSpeed - 42 * delta);
          else car.currentSpeed = Math.max(-14, car.currentSpeed - car.acceleration * 0.7 * delta);
        } else {
          car.currentSpeed = THREE.MathUtils.lerp(car.currentSpeed, 0, 1 - Math.exp(-delta * 1.5));
        }

        if (input.handbrake) {
          car.currentSpeed = THREE.MathUtils.lerp(car.currentSpeed, 0, 1 - Math.exp(-delta * 3.5));
          if (Math.abs(car.currentSpeed) > 8) soundManager.playTireScreech(Math.abs(car.currentSpeed) / 20);
        }

        if (Math.abs(car.currentSpeed) > 0.5) {
          const dirSign = car.currentSpeed > 0 ? 1 : -1;
          const turnScale = Math.min(1, Math.abs(car.currentSpeed) / 7);
          car.mesh.rotation.y += car.steerAngle * car.turnSpeed * turnScale * delta * dirSign;
        }

        forwardOf(car.mesh.rotation.y, tA);
        car.mesh.position.addScaledVector(tA, car.currentSpeed * delta);

        car.bodyMesh.rotation.z = THREE.MathUtils.lerp(
          car.bodyMesh.rotation.z,
          -car.steerAngle * (car.currentSpeed / car.topSpeed) * 0.15,
          0.1
        );

        const spin = (car.currentSpeed * delta) / 0.38;
        car.frontLeftWheel.rotation.x += spin;
        car.frontRightWheel.rotation.x += spin;
        car.rearLeftWheel.rotation.x += spin;
        car.rearRightWheel.rotation.x += spin;

        VehicleBuilder.setBraking(car, input.brake || input.handbrake);
        soundManager.updateEngine(speedNorm, input.gas);

        // camera: drag to look around, otherwise swings back behind the car
        if (lookX !== 0 || lookY !== 0) {
          camYawOffset -= lookX * lookSens;
          cameraPitch = Math.max(-0.2, Math.min(0.9, cameraPitch + lookY * lookSens * 0.6));
          lastLookAt = now;
        } else if (now - lastLookAt > 1500) {
          camYawOffset = THREE.MathUtils.lerp(camYawOffset, 0, 1 - Math.exp(-delta * 3));
        }
        const camYaw = car.mesh.rotation.y + camYawOffset;
        const dist = cameraMode === 2 ? 0.5 : cameraDistance;
        const h = dist * (0.2 + cameraPitch * 0.8) + (cameraMode === 2 ? 1.1 : 0.4);
        tA.set(-Math.sin(camYaw) * dist, h, -Math.cos(camYaw) * dist).add(car.mesh.position);
        camera.position.lerp(tA, 1 - Math.exp(-delta * 9));
        tB.copy(car.mesh.position);
        tB.y += 1.4;
        camera.lookAt(tB);

        const wantFov = baseFov + speedNorm * 12;
        if (Math.abs(camera.fov - wantFov) > 0.2) {
          camera.fov = THREE.MathUtils.lerp(camera.fov, wantFov, 0.1);
          camera.updateProjectionMatrix();
        }

        // headlight (single shared spotlight)
        if (car.isHeadlightsOn) {
          forwardOf(car.mesh.rotation.y, tA);
          headlight.position.set(car.mesh.position.x + tA.x * 2.2, 1.1, car.mesh.position.z + tA.z * 2.2);
          headlight.target.position.set(car.mesh.position.x + tA.x * 30, 0.2, car.mesh.position.z + tA.z * 30);
          headlight.target.updateMatrixWorld();
          headlight.intensity = isNight ? 45 : 18;
        } else headlight.intensity = 0;
      } else {
        // ======================= ON FOOT =======================
        focus = player.root.position;
        headlight.intensity = 0;
        if (camera.fov !== baseFov) {
          camera.fov = baseFov;
          camera.updateProjectionMatrix();
        }

        cameraYaw -= lookX * lookSens;
        cameraPitch = Math.max(-0.45, Math.min(1.15, cameraPitch + lookY * lookSens));

        const mx = Math.abs(input.moveX) > 0.12 ? input.moveX : 0;
        const my = Math.abs(input.moveY) > 0.12 ? input.moveY : 0;
        const mag = Math.min(1, Math.hypot(mx, my));
        const sprinting = input.sprint && mag > 0;
        const sy = Math.sin(cameraYaw);
        const cy = Math.cos(cameraYaw);
        let dirX = 0;
        let dirZ = 0;

        if (mag > 0) {
          // forward = away from the camera, right = camera right
          dirX = -sy * my + cy * mx;
          dirZ = -cy * my - sy * mx;
          const len = Math.hypot(dirX, dirZ) || 1;
          dirX /= len;
          dirZ /= len;
          const maxSpeed = (sprinting ? 9.5 : 5.2) * mag;
          const k = 1 - Math.exp(-delta * 12);
          playerVel.x = THREE.MathUtils.lerp(playerVel.x, dirX * maxSpeed, k);
          playerVel.z = THREE.MathUtils.lerp(playerVel.z, dirZ * maxSpeed, k);
        } else {
          const k = 1 - Math.exp(-delta * 10);
          playerVel.x = THREE.MathUtils.lerp(playerVel.x, 0, k);
          playerVel.z = THREE.MathUtils.lerp(playerVel.z, 0, k);
        }

        // face the crosshair while shooting, otherwise face the walking direction
        const aiming = input.fire && weapon !== "fist";
        let targetHeading = player.root.rotation.y;
        if (aiming) targetHeading = cameraYaw + Math.PI;
        else if (mag > 0) targetHeading = Math.atan2(dirX, dirZ);
        player.root.rotation.y += angleDelta(player.root.rotation.y, targetHeading) * (1 - Math.exp(-delta * 14));

        if (input.jumpQueued) {
          input.jumpQueued = false;
          if (grounded) {
            playerVel.y = 7;
            grounded = false;
          }
        }
        if (!grounded) playerVel.y -= 19.8 * delta;

        player.root.position.x += playerVel.x * delta;
        player.root.position.y += playerVel.y * delta;
        player.root.position.z += playerVel.z * delta;
        if (player.root.position.y <= 0.2) {
          player.root.position.y = 0.2;
          playerVel.y = 0;
          grounded = true;
        }

        // firing (hold the button)
        if (input.fire && !wasted && fireCooldown <= 0) {
          fireWeapon();
          fireCooldown = WEAPONS[weapon].rate;
        }

        const speed2D = Math.hypot(playerVel.x, playerVel.z);
        CharacterBuilder.updateAnimation(player, speed2D, sprinting, grounded, weapon !== "fist", punchAnim > 0, delta);
        player.root.visible = cameraMode !== 2;

        // orbit camera around the head
        tA.copy(player.root.position);
        tA.y += 1.7;
        const cp = Math.cos(cameraPitch);
        tB.set(
          Math.sin(cameraYaw) * cp * cameraDistance,
          Math.sin(cameraPitch) * cameraDistance + 0.5,
          Math.cos(cameraYaw) * cp * cameraDistance
        );
        camera.position.copy(tA).add(tB);
        camera.lookAt(tA);
      }

      // ---------- sun / shadow follow the player (snapped to texel grid = no shimmer) ----------
      const shadowSize = LEVELS[level].shadow || 512;
      const snap = (SHADOW_EXTENT * 2) / shadowSize;
      const sx = Math.round(focus.x / snap) * snap;
      const sz = Math.round(focus.z / snap) * snap;
      dirLight.target.position.set(sx, 0, sz);
      dirLight.target.updateMatrixWorld();
      dirLight.position.set(sx + sunDir.x * 160, sunDir.y * 160, sz + sunDir.z * 160);

      // ---------- interaction prompt ----------
      const near = computeNearby(focus, now);
      const hint = near.kind === "none" ? null : near.label;

      // ---------- AI / world systems ----------
      traffic.update(delta, focus, gunfireTimer > 0);
      pedestrians.update(delta, focus, gunfireTimer > 0);

      const pr = police.update(delta, focus, !!current);
      if (pr.playerDamaged > 0 && dmgCooldown <= 0) {
        damagePlayer(Math.min(25, pr.playerDamaged));
        dmgCooldown = 0.5;
      }

      const mRes = missions.update(delta, focus);
      if (mRes.missionCompleted) {
        awardCash(mRes.rewardCash);
        banner = { title: "GÖREV TAMAMLANDI", reward: mRes.rewardCash };
        bannerUntil = now + 5000;
      }
      if (mRes.triggerPoliceStars) police.setWantedStars(mRes.triggerPoliceStars);

      // ---------- render ----------
      renderer.render(scene, camera);

      // ---------- HUD ----------
      if (now - lastSync > 100) {
        lastSync = now;
        syncHud(now, hint, near.kind !== "none");
      }
    };

    raf = requestAnimationFrame(loop);

    apiRef.current = {
      setMenuOpen: (open) => {
        menuOpen = open;
        updatePaused();
      },
      setQuality: (q) => applyLevel(LABEL_TO_LEVEL[q]),
      setTime: (h) => applyTime(h),
      spawnCar: (type, colorHex) => {
        const fwd = tA.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
        const p = player.root.position;
        const v = VehicleBuilder.createVehicle(type, parseInt(colorHex.replace("#", ""), 16));
        v.mesh.position.set(p.x + fwd.x * 6, 0.1, p.z + fwd.z * 6);
        v.mesh.rotation.y = Math.atan2(fwd.x, fwd.z);
        VehicleBuilder.setHeadlights(v, isNight);
        scene.add(v.mesh);
        drivable.push(v);
        soundManager.playHorn();
      },
      startMission: (id) => {
        missions.startMission(id);
      },
      changeCamera: () => {
        cameraMode = (cameraMode + 1) % 4;
        cameraDistance = cameraMode === 0 ? 5.5 : cameraMode === 1 ? 8.5 : cameraMode === 2 ? 0.5 : 28;
      },
      interact,
      getSaveData: () => ({
        playerName: "Franklin 'V' Vance",
        cash: st.cash,
        health: Math.round(st.health),
        armor: Math.round(st.armor),
        wantedStars: police.wantedStars,
        currentWeapon: weapon,
        posX: player.root.position.x,
        posY: player.root.position.y,
        posZ: player.root.position.z,
      }),
    };

    return () => {
      cancelAnimationFrame(raf);
      apiRef.current = null;
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("gesturestart", blockDefault as EventListener);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      container.removeEventListener("contextmenu", blockDefault);
      container.removeEventListener("touchmove", blockDefault);
      soundManager.stopEngine();
      soundManager.setPoliceSiren(false);
      renderer.dispose();
    };
  }, []);

  // keep the engine in sync with React-side UI state
  useEffect(() => {
    apiRef.current?.setMenuOpen(isPauseMenuOpen);
  }, [isPauseMenuOpen]);

  // fullscreen state + keep the screen awake while playing
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    onFs();

    let lock: { release: () => Promise<void> } | null = null;
    const getLock = async () => {
      try {
        const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
        if (nav.wakeLock && document.visibilityState === "visible") lock = await nav.wakeLock.request("screen");
      } catch {
        /* not supported / denied */
      }
    };
    void getLock();
    const onVis = () => {
      if (document.visibilityState === "visible") void getLock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen({ navigationUI: "hide" })
        .then(() => {
          const o = screen.orientation as unknown as { lock?: (o: string) => Promise<void> };
          return o.lock?.("landscape");
        })
        .catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      soundManager.setMuted(!prev);
      return !prev;
    });
  }, []);

  const openMenu = useCallback(() => setIsPauseMenuOpen(true), []);
  const closeMenu = useCallback(() => setIsPauseMenuOpen(false), []);
  const changeCamera = useCallback(() => apiRef.current?.changeCamera(), []);
  const onHintTap = useCallback(() => {
    inputRef.current.interactQueued = true;
  }, []);

  const handleSaveGame = useCallback(async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiRef.current?.getSaveData() ?? {}),
      });
      const data = await res.json();
      setSaveMessage(data.success ? "✓ Oyun kaydedildi!" : "Kayıt başarısız oldu.");
    } catch {
      setSaveMessage("Kayıt hatası (çevrimdışı olabilir).");
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 4000);
    }
  }, []);

  const changeQuality = useCallback((q: Quality) => apiRef.current?.setQuality(q), []);
  const changeTime = useCallback((h: number) => apiRef.current?.setTime(h), []);
  const spawnCar = useCallback((t: VehicleType, c: string) => apiRef.current?.spawnCar(t, c), []);
  const startMission = useCallback((id: string) => apiRef.current?.startMission(id), []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 select-none overflow-hidden bg-black"
      style={{ touchAction: "none", overscrollBehavior: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
    >
      <canvas ref={canvasRef} className="block h-full w-full outline-none" />

      <HUD
        health={hud.health}
        armor={hud.armor}
        cash={hud.cash}
        cashDelta={hud.cashDelta}
        wantedStars={hud.wantedStars}
        isCoolingDown={hud.isCoolingDown}
        currentWeapon={hud.currentWeapon}
        ammoText={hud.ammoText}
        inVehicle={hud.inVehicle}
        vehicleSpeedKmh={hud.speed}
        vehicleHealth={hud.vehicleHealth}
        vehicleMaxHealth={hud.vehicleMax}
        vehicleName={hud.vehicleName}
        radioStationName={hud.radio}
        interactionHint={hud.hint}
        toast={hud.toast}
        mission={hud.mission}
        missionTimer={hud.missionTimer}
        playerPos={{ x: hud.px, z: hud.pz }}
        playerHeading={hud.heading}
        policePositions={hud.police}
        isWasted={hud.wasted}
        missionPassedBanner={hud.banner}
        isFullscreen={isFullscreen}
        isMuted={isMuted}
        onToggleFullscreen={toggleFullscreen}
        onToggleMute={toggleMute}
        onOpenPauseMenu={openMenu}
        onChangeCamera={changeCamera}
        onHintTap={onHintTap}
      />

      <MobileControls input={inputRef.current} inVehicle={hud.inVehicle} canInteract={hud.canInteract} />

      <PauseMenu
        isOpen={isPauseMenuOpen}
        onClose={closeMenu}
        playerCash={hud.cash}
        timeOfDay={timeOfDay}
        onChangeTimeOfDay={changeTime}
        graphicsQuality={graphicsQuality}
        onChangeGraphicsQuality={changeQuality}
        onStartMission={startMission}
        onSpawnCar={spawnCar}
        onSaveGame={handleSaveGame}
        isSaving={isSaving}
        saveMessage={saveMessage}
      />

      {isPortrait && (
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black px-6 text-center">
          <div className="text-6xl" style={{ transform: "rotate(90deg)" }}>
            📱
          </div>
          <div className="text-lg font-black text-amber-400">Telefonu yatay çevirin</div>
          <div className="text-xs text-neutral-400">Oyun yatay (landscape) modda oynanır.</div>
          <button
            type="button"
            onPointerDown={toggleFullscreen}
            className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-extrabold text-black"
          >
            Tam ekran + yatay kilit
          </button>
        </div>
      )}

      {contextLost && (
        <div className="absolute inset-0 z-[70] flex flex-col items-center justify-center gap-3 bg-black/95 px-6 text-center">
          <div className="text-base font-black text-rose-400">Grafik bağlantısı koptu (telefon belleği doldu)</div>
          <button
            type="button"
            onPointerDown={() => window.location.reload()}
            className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-extrabold text-black"
          >
            Oyunu Yeniden Yükle
          </button>
        </div>
      )}
    </div>
  );
};
