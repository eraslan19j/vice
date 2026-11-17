import * as THREE from "three";
import { VehicleBuilder, VehicleData } from "../models/vehicleBuilder";

export interface TrafficCar {
  vehicle: VehicleData;
  speed: number;
  targetSpeed: number;
  laneAxis: "x" | "z";
  direction: 1 | -1;
  lanePos: number;
  isPanicked: boolean;
}

export class TrafficSystem {
  public cars: TrafficCar[] = [];
  private scene: THREE.Scene;

  // Major traffic routes
  private routes = [
    { axis: "z" as const, x: -50 - 4, dir: 1 as const, min: -250, max: 250 },
    { axis: "z" as const, x: -50 + 4, dir: -1 as const, min: -250, max: 250 },
    { axis: "z" as const, x: 40 - 4, dir: 1 as const, min: -250, max: 250 },
    { axis: "z" as const, x: 40 + 4, dir: -1 as const, min: -250, max: 250 },
    { axis: "z" as const, x: 130 - 4, dir: 1 as const, min: -250, max: 250 },
    { axis: "z" as const, x: -130 + 4, dir: -1 as const, min: -250, max: 250 },
    { axis: "x" as const, z: 0 - 4, dir: 1 as const, min: -140, max: 200 },
    { axis: "x" as const, z: 0 + 4, dir: -1 as const, min: -140, max: 200 },
    { axis: "x" as const, z: 110 - 4, dir: 1 as const, min: -140, max: 200 },
    { axis: "x" as const, z: -110 + 4, dir: -1 as const, min: -140, max: 200 },
  ];

  constructor(scene: THREE.Scene, maxCars: number = 8) {
    this.scene = scene;
    this.spawnInitialTraffic(maxCars);
  }

  private spawnInitialTraffic(count: number) {
    const types: ("supercar" | "muscle" | "suv")[] = ["supercar", "muscle", "suv"];
    const colors = [0xdc2626, 0x2563eb, 0x16a34a, 0xeab308, 0x9333ea, 0x475569, 0xf97316];

    for (let i = 0; i < count; i++) {
      const route = this.routes[i % this.routes.length];
      const type = types[i % types.length];
      const color = colors[i % colors.length];

      const v = VehicleBuilder.createVehicle(type, color);
      const startT = Math.random() * (route.max - route.min) + route.min;

      if (route.axis === "z") {
        v.mesh.position.set(route.x, 0.1, startT);
        v.mesh.rotation.y = route.dir === 1 ? 0 : Math.PI;
      } else {
        v.mesh.position.set(startT, 0.1, route.z);
        v.mesh.rotation.y = route.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      }

      this.scene.add(v.mesh);
      this.cars.push({
        vehicle: v,
        speed: 12 + Math.random() * 6,
        targetSpeed: 14,
        laneAxis: route.axis,
        direction: route.dir,
        lanePos: route.axis === "z" ? route.x : route.z,
        isPanicked: false,
      });
    }
  }

  public update(delta: number, playerPos: THREE.Vector3, isGunfireNear: boolean = false) {
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      const v = c.vehicle;

      // Distance to player
      const distToPlayer = v.mesh.position.distanceTo(playerPos);
      if (isGunfireNear && distToPlayer < 40) {
        c.isPanicked = true;
        c.targetSpeed = 26; // Accelerate in fear
      }

      // Smooth acceleration
      c.speed = THREE.MathUtils.lerp(c.speed, c.targetSpeed, delta * 2);

      // Forward motion
      const moveDist = c.speed * delta;
      if (c.laneAxis === "z") {
        v.mesh.position.z += moveDist * c.direction;
        if (v.mesh.position.z > 280) v.mesh.position.z = -280;
        if (v.mesh.position.z < -280) v.mesh.position.z = 280;
      } else {
        v.mesh.position.x += moveDist * c.direction;
        if (v.mesh.position.x > 220) v.mesh.position.x = -150;
        if (v.mesh.position.x < -150) v.mesh.position.x = 220;
      }

      // Far cars are hidden (fog hides them anyway) -> saves draw calls on phones
      const near = distToPlayer < 170;
      v.mesh.visible = near;

      // Roll wheels (only when visible)
      if (near) {
        const wheelRot = (c.speed * delta) / 0.38;
        v.frontLeftWheel.rotation.x += wheelRot;
        v.frontRightWheel.rotation.x += wheelRot;
        v.rearLeftWheel.rotation.x += wheelRot;
        v.rearRightWheel.rotation.x += wheelRot;
      }
    }
  }

  public removeCar(v: VehicleData) {
    const idx = this.cars.findIndex((c) => c.vehicle === v);
    if (idx !== -1) {
      this.cars.splice(idx, 1);
    }
  }
}
