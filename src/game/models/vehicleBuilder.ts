import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type VehicleType = "supercar" | "muscle" | "police" | "suv";

export interface VehicleData {
  mesh: THREE.Group;
  type: VehicleType;
  /** Steering pivots (rotate .y for steering). Wheel meshes below only spin on .x */
  frontLeftSteer: THREE.Object3D;
  frontRightSteer: THREE.Object3D;
  frontLeftWheel: THREE.Object3D;
  frontRightWheel: THREE.Object3D;
  rearLeftWheel: THREE.Object3D;
  rearRightWheel: THREE.Object3D;
  /** Per-vehicle emissive-style materials (NO real lights: real lights per car killed mobile GPUs). */
  headMat: THREE.MeshBasicMaterial;
  tailMat: THREE.MeshBasicMaterial;
  sirenRedMat?: THREE.MeshBasicMaterial;
  sirenBlueMat?: THREE.MeshBasicMaterial;
  bodyMesh: THREE.Mesh;
  health: number;
  maxHealth: number;
  topSpeed: number;
  acceleration: number;
  turnSpeed: number;
  currentSpeed: number;
  steerAngle: number;
  isEngineOn: boolean;
  isBraking: boolean;
  isHeadlightsOn: boolean;
  isSirenOn: boolean;
}

interface Dims {
  length: number;
  width: number;
  height: number;
  topSpeed: number;
  accel: number;
  turn: number;
  health: number;
}

const DIMS: Record<VehicleType, Dims> = {
  supercar: { length: 4.4, width: 2.0, height: 1.15, topSpeed: 48, accel: 26, turn: 2.2, health: 300 },
  muscle: { length: 4.6, width: 2.05, height: 1.3, topSpeed: 44, accel: 24, turn: 1.9, health: 350 },
  police: { length: 4.7, width: 2.05, height: 1.35, topSpeed: 46, accel: 28, turn: 2.3, health: 400 },
  suv: { length: 4.9, width: 2.2, height: 1.7, topSpeed: 38, accel: 20, turn: 1.7, health: 500 },
};

const HEAD_ON = 0xfff6d8;
const HEAD_OFF = 0xb8b8a8;
const TAIL_ON = 0xff3030;
const TAIL_OFF = 0x7a1010;

export class VehicleBuilder {
  // ---- shared resources (created once, reused by every car) ----
  private static geoCache = new Map<string, THREE.BufferGeometry>();
  private static bodyMatCache = new Map<string, THREE.MeshPhongMaterial>();
  private static secMatCache = new Map<number, THREE.MeshLambertMaterial>();

  private static tireMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  private static rimMat = new THREE.MeshLambertMaterial({ color: 0xc8ccd4 });
  private static glassMat = new THREE.MeshPhongMaterial({ color: 0x1b2a3f, shininess: 120, specular: 0x8899aa });
  private static chromeMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });

  private static geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.geoCache.get(key);
    if (!g) {
      g = make();
      this.geoCache.set(key, g);
    }
    return g;
  }

  private static box(w: number, h: number, d: number, x = 0, y = 0, z = 0, rotX = 0): THREE.BufferGeometry {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotX) g.rotateX(rotX);
    g.translate(x, y, z);
    return g;
  }

  private static bodyMaterial(color: number): THREE.MeshPhongMaterial {
    const key = `b${color}`;
    let m = this.bodyMatCache.get(key);
    if (!m) {
      m = new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x666666 });
      this.bodyMatCache.set(key, m);
    }
    return m;
  }

  private static secondaryMaterial(color: number): THREE.MeshLambertMaterial {
    let m = this.secMatCache.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color });
      this.secMatCache.set(color, m);
    }
    return m;
  }

  private static createWheel(): THREE.Mesh {
    // One mesh per wheel: cylinder groups = [tire side, cap, cap] -> hubcaps get the rim material
    const g = this.geo("wheel", () => {
      const cyl = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12);
      cyl.rotateZ(Math.PI / 2);
      return cyl;
    });
    return new THREE.Mesh(g, [this.tireMat, this.rimMat, this.rimMat]);
  }

  public static setHeadlights(v: VehicleData, on: boolean) {
    v.isHeadlightsOn = on;
    v.headMat.color.setHex(on ? HEAD_ON : HEAD_OFF);
  }

  public static setBraking(v: VehicleData, braking: boolean) {
    if (v.isBraking === braking) return;
    v.isBraking = braking;
    v.tailMat.color.setHex(braking ? TAIL_ON : TAIL_OFF);
  }

  public static setSiren(v: VehicleData, phase: boolean) {
    if (!v.sirenRedMat || !v.sirenBlueMat) return;
    v.sirenRedMat.color.setHex(phase ? 0xff2222 : 0x551010);
    v.sirenBlueMat.color.setHex(phase ? 0x102a66 : 0x3b82ff);
  }

  public static createVehicle(
    type: VehicleType = "supercar",
    primaryColor: number = 0xef4444,
    _secondaryColor: number = 0x1f2937
  ): VehicleData {
    const d = DIMS[type];
    const { length: L, width: W, height: H } = d;

    const root = new THREE.Group();
    root.name = `vehicle_${type}`;

    const bodyMat = this.bodyMaterial(type === "police" ? 0x0f172a : primaryColor);

    // --- LOWER BODY ---
    const bodyGeom = this.geo(`body_${type}`, () => new THREE.BoxGeometry(W, H * 0.5, L));
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    bodyMesh.position.y = H * 0.4 + 0.2;
    bodyMesh.castShadow = true;
    root.add(bodyMesh);

    // --- CABIN ---
    const cabinL = L * 0.5;
    const cabinH = H * 0.48;
    const cabinW = W * 0.88;
    const cabinY = H * 0.72 + 0.2;
    const cabinZ = -L * 0.05;
    const cabinGeom = this.geo(`cabin_${type}`, () => new THREE.BoxGeometry(cabinW, cabinH, cabinL));
    const cabin = new THREE.Mesh(cabinGeom, bodyMat);
    cabin.position.set(0, cabinY, cabinZ);
    cabin.castShadow = true;
    root.add(cabin);

    // --- GLASS (windshield + rear + side merged into ONE mesh) ---
    const glassGeom = this.geo(`glass_${type}`, () =>
      mergeGeometries([
        this.box(cabinW * 0.94, cabinH * 0.85, 0.06, 0, H * 0.75 + 0.2, cabinZ + cabinL * 0.45, Math.PI / 5),
        this.box(cabinW * 0.92, cabinH * 0.8, 0.06, 0, H * 0.75 + 0.2, cabinZ - cabinL * 0.45, -Math.PI / 5.5),
        this.box(cabinW * 1.02, cabinH * 0.7, cabinL * 0.75, 0, cabinY, cabinZ),
      ])!
    );
    root.add(new THREE.Mesh(glassGeom, this.glassMat));

    // --- POLICE DOOR PANEL ---
    if (type === "police") {
      const doorGeom = this.geo("police_door", () => new THREE.BoxGeometry(W * 1.01, H * 0.45, L * 0.4));
      const door = new THREE.Mesh(doorGeom, this.secondaryMaterial(0xf8fafc));
      door.position.copy(bodyMesh.position);
      door.position.z -= 0.1;
      root.add(door);
    }

    // --- HEAD / TAIL LIGHTS: basic materials (look lit, cost nothing), merged per pair ---
    const headMat = new THREE.MeshBasicMaterial({ color: HEAD_OFF });
    const headGeom = this.geo(`head_${type}`, () =>
      mergeGeometries([
        this.box(0.35, 0.16, 0.08, -W * 0.38, H * 0.45 + 0.2, L * 0.5 + 0.02),
        this.box(0.35, 0.16, 0.08, W * 0.38, H * 0.45 + 0.2, L * 0.5 + 0.02),
      ])!
    );
    root.add(new THREE.Mesh(headGeom, headMat));

    const tailMat = new THREE.MeshBasicMaterial({ color: TAIL_OFF });
    const tailGeom = this.geo(`tail_${type}`, () =>
      mergeGeometries([
        this.box(0.35, 0.16, 0.08, -W * 0.38, H * 0.45 + 0.2, -L * 0.5 - 0.02),
        this.box(0.35, 0.16, 0.08, W * 0.38, H * 0.45 + 0.2, -L * 0.5 - 0.02),
      ])!
    );
    root.add(new THREE.Mesh(tailGeom, tailMat));

    // --- SUPERCAR SPOILER (wing + struts merged) ---
    if (type === "supercar") {
      const spoilerGeom = this.geo("spoiler", () =>
        mergeGeometries([
          this.box(W * 0.9, 0.06, 0.35, 0, H * 0.85 + 0.2, -L * 0.45),
          this.box(0.06, 0.25, 0.12, -W * 0.3, H * 0.68 + 0.2, -L * 0.45),
          this.box(0.06, 0.25, 0.12, W * 0.3, H * 0.68 + 0.2, -L * 0.45),
        ])!
      );
      root.add(new THREE.Mesh(spoilerGeom, bodyMat));
    }

    // --- POLICE LIGHTBAR (strobing emissive meshes only, no real lights) ---
    let sirenRedMat: THREE.MeshBasicMaterial | undefined;
    let sirenBlueMat: THREE.MeshBasicMaterial | undefined;
    if (type === "police") {
      const barY = cabinY + cabinH * 0.5 + 0.04;
      const barGeom = this.geo("bar_base", () => new THREE.BoxGeometry(W * 0.6, 0.08, 0.25));
      const bar = new THREE.Mesh(barGeom, this.chromeMat);
      bar.position.set(0, barY, cabinZ);
      root.add(bar);

      sirenRedMat = new THREE.MeshBasicMaterial({ color: 0x551010 });
      sirenBlueMat = new THREE.MeshBasicMaterial({ color: 0x3b82ff });
      const bulbGeom = this.geo("bar_bulb", () => new THREE.BoxGeometry(W * 0.25, 0.1, 0.2));
      const red = new THREE.Mesh(bulbGeom, sirenRedMat);
      red.position.set(-W * 0.15, barY + 0.08, cabinZ);
      const blue = new THREE.Mesh(bulbGeom, sirenBlueMat);
      blue.position.set(W * 0.15, barY + 0.08, cabinZ);
      root.add(red, blue);
    }

    // --- WHEELS ---
    const fl = this.createWheel();
    const fr = this.createWheel();
    const rl = this.createWheel();
    const rr = this.createWheel();

    const wheelY = 0.38;
    const frontZ = L * 0.28;
    const rearZ = -L * 0.28;
    const halfTrack = 1.85 * 0.5;

    const steerL = new THREE.Group();
    steerL.position.set(-halfTrack, wheelY, frontZ);
    steerL.add(fl);
    const steerR = new THREE.Group();
    steerR.position.set(halfTrack, wheelY, frontZ);
    steerR.add(fr);

    rl.position.set(-halfTrack, wheelY, rearZ);
    rr.position.set(halfTrack, wheelY, rearZ);
    root.add(steerL, steerR, rl, rr);

    return {
      mesh: root,
      type,
      frontLeftSteer: steerL,
      frontRightSteer: steerR,
      frontLeftWheel: fl,
      frontRightWheel: fr,
      rearLeftWheel: rl,
      rearRightWheel: rr,
      headMat,
      tailMat,
      sirenRedMat,
      sirenBlueMat,
      bodyMesh,
      health: d.health,
      maxHealth: d.health,
      topSpeed: d.topSpeed,
      acceleration: d.accel,
      turnSpeed: d.turn,
      currentSpeed: 0,
      steerAngle: 0,
      isEngineOn: false,
      isBraking: false,
      isHeadlightsOn: false,
      isSirenOn: false,
    };
  }
}
