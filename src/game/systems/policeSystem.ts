import * as THREE from "three";
import { VehicleBuilder, VehicleData } from "../models/vehicleBuilder";
import { soundManager } from "../audio/soundManager";

const _dir = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export interface PolicePursuitUnit {
  vehicle: VehicleData;
  speed: number;
  maxSpeed: number;
  strobeTimer: number;
  strobeState: boolean;
  shootCooldown: number;
}

export class PoliceSystem {
  public wantedStars: number = 0;
  public evasionTimer: number = 0;
  public isCoolingDown: boolean = false;
  public policeUnits: PolicePursuitUnit[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public setWantedStars(stars: number) {
    const clamped = Math.max(0, Math.min(5, stars));
    const wasZero = this.wantedStars === 0;
    this.wantedStars = clamped;

    if (clamped > 0) {
      this.evasionTimer = 0;
      this.isCoolingDown = false;
      soundManager.setPoliceSiren(true);
      if (wasZero) {
        soundManager.playHorn(); // Dispatch radio chirp
      }
      this.adjustPoliceCount(Math.min(clamped, 4));
    } else {
      soundManager.setPoliceSiren(false);
      this.clearAllPolice();
    }
  }

  public addWantedStars(add: number) {
    this.setWantedStars(this.wantedStars + add);
  }

  public clearWanted() {
    this.setWantedStars(0);
  }

  private adjustPoliceCount(targetCount: number) {
    while (this.policeUnits.length < targetCount) {
      this.spawnPoliceUnit();
    }
    while (this.policeUnits.length > targetCount) {
      const u = this.policeUnits.pop();
      if (u) {
        this.scene.remove(u.vehicle.mesh);
      }
    }
  }

  private spawnPoliceUnit() {
    const v = VehicleBuilder.createVehicle("police");
    // Spawn around 70-100m away from center
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 40;
    v.mesh.position.set(Math.cos(angle) * dist, 0.1, Math.sin(angle) * dist);
    this.scene.add(v.mesh);

    this.policeUnits.push({
      vehicle: v,
      speed: 0,
      maxSpeed: 38 + this.wantedStars * 4,
      strobeTimer: 0,
      strobeState: false,
      shootCooldown: 0,
    });
  }

  private clearAllPolice() {
    this.policeUnits.forEach((u) => {
      this.scene.remove(u.vehicle.mesh);
    });
    this.policeUnits = [];
  }

  public update(delta: number, playerPos: THREE.Vector3, playerInVehicle: boolean): { playerDamaged: number } {
    let damageToPlayer = 0;

    if (this.wantedStars === 0) {
      return { playerDamaged: 0 };
    }

    // Check distance to all police units
    let closestDist = Infinity;

    for (let i = 0; i < this.policeUnits.length; i++) {
      const u = this.policeUnits[i];
      const v = u.vehicle;
      const dist = v.mesh.position.distanceTo(playerPos);
      if (dist < closestDist) closestDist = dist;

      // Strobe light flashing (Red / Blue alternating)
      u.strobeTimer += delta * 6;
      if (u.strobeTimer > 1.0) {
        u.strobeTimer = 0;
        u.strobeState = !u.strobeState;
        VehicleBuilder.setSiren(v, u.strobeState);
      }

      // Chase Player Navigation
      const targetDir = _dir.subVectors(playerPos, v.mesh.position);
      targetDir.y = 0;
      const targetDist = targetDir.length();
      targetDir.normalize();

      // Desired angle
      const targetAngle = Math.atan2(targetDir.x, targetDir.z);
      // Smooth steering towards player
      let angleDiff = targetAngle - v.mesh.rotation.y;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      v.mesh.rotation.y += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), delta * 2.8);

      // Accelerate towards player
      if (targetDist > 6.0) {
        u.speed = THREE.MathUtils.lerp(u.speed, u.maxSpeed, delta * 3.5);
      } else {
        // Ramming or braking near player
        u.speed = THREE.MathUtils.lerp(u.speed, 8, delta * 2.0);
      }

      // Move cruiser
      const forward = _fwd.set(0, 0, 1).applyAxisAngle(_up, v.mesh.rotation.y);
      v.mesh.position.addScaledVector(forward, u.speed * delta);

      // Roll wheels
      const wheelRoll = (u.speed * delta) / 0.38;
      v.frontLeftWheel.rotation.x += wheelRoll;
      v.frontRightWheel.rotation.x += wheelRoll;
      v.rearLeftWheel.rotation.x += wheelRoll;
      v.rearRightWheel.rotation.x += wheelRoll;

      // Ramming damage if colliding
      if (targetDist < 4.0 && u.speed > 12) {
        damageToPlayer += Math.round(u.speed * 0.4);
      }

      // Shooting at player if 3+ stars and within range
      if (this.wantedStars >= 3 && targetDist < 35) {
        u.shootCooldown += delta;
        if (u.shootCooldown > (this.wantedStars >= 4 ? 0.8 : 1.6)) {
          u.shootCooldown = 0;
          soundManager.playGunshot("pistol");
          // Chance to hit player
          if (Math.random() > 0.4) {
            damageToPlayer += 12;
          }
        }
      }
    }

    // Evasion logic: if player has stayed > 55m away from all police
    if (closestDist > 55) {
      this.isCoolingDown = true;
      this.evasionTimer += delta;
      if (this.evasionTimer > 12.0) {
        // Drop 1 star every 12 seconds
        this.wantedStars--;
        this.evasionTimer = 0;
        if (this.wantedStars <= 0) {
          this.clearWanted();
        } else {
          this.adjustPoliceCount(this.wantedStars);
        }
      }
    } else {
      this.isCoolingDown = false;
      this.evasionTimer = 0;
    }

    return { playerDamaged: damageToPlayer };
  }
}
