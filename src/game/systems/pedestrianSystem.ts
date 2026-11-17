import * as THREE from "three";
import { CharacterBuilder, CharacterRig } from "../models/characterBuilder";

export interface Pedestrian {
  rig: CharacterRig;
  health: number;
  isDead: boolean;
  isPanicked: boolean;
  speed: number;
  dir: THREE.Vector3;
  targetPos: THREE.Vector3;
  cashReward: number;
}

export class PedestrianSystem {
  public pedestrians: Pedestrian[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, count: number = 14) {
    this.scene = scene;
    this.spawnPedestrians(count);
  }

  private spawnPedestrians(count: number) {
    const sidewalkX = [-146, -114, -66, -34, 24, 56, 114, 146];
    for (let i = 0; i < count; i++) {
      const rig = CharacterBuilder.createCharacter(true, i % 4);
      const x = sidewalkX[i % sidewalkX.length];
      const z = (Math.random() - 0.5) * 400;

      rig.root.position.set(x, 0.17, z);
      rig.root.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(rig.root);

      this.pedestrians.push({
        rig,
        health: 50,
        isDead: false,
        isPanicked: false,
        speed: 1.6 + Math.random() * 0.8,
        dir: new THREE.Vector3(0, 0, Math.random() > 0.5 ? 1 : -1),
        targetPos: new THREE.Vector3(x, 0.17, z + (Math.random() > 0.5 ? 60 : -60)),
        cashReward: Math.floor(Math.random() * 180) + 40,
      });
    }
  }

  public update(delta: number, playerPos: THREE.Vector3, isGunfire: boolean): { cashDrops: { pos: THREE.Vector3; amount: number }[] } {
    const drops: { pos: THREE.Vector3; amount: number }[] = [];

    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];
      if (p.isDead) continue;

      const distToPlayer = p.rig.root.position.distanceTo(playerPos);
      if (isGunfire && distToPlayer < 45) {
        p.isPanicked = true;
        // Run away from player
        p.dir.subVectors(p.rig.root.position, playerPos).setY(0).normalize();
        p.speed = 5.2; // Sprint away
      }

      // Move along direction
      p.rig.root.position.addScaledVector(p.dir, p.speed * delta);

      // Align rotation
      if (p.dir.lengthSq() > 0.01) {
        p.rig.root.rotation.y = Math.atan2(p.dir.x, p.dir.z);
      }

      // Animate + draw only nearby pedestrians (big saving on phones)
      const near = distToPlayer < 85;
      p.rig.root.visible = near;
      if (near) {
        CharacterBuilder.updateAnimation(
          p.rig,
          p.speed,
          p.isPanicked,
          true,
          false,
          false,
          delta
        );
      }

      // Boundaries reset
      if (p.rig.root.position.z > 280) p.rig.root.position.z = -280;
      if (p.rig.root.position.z < -280) p.rig.root.position.z = 280;
    }

    return { cashDrops: drops };
  }

  public damagePedestrian(index: number, damage: number): { killed: boolean; cash: number } {
    const p = this.pedestrians[index];
    if (!p || p.isDead) return { killed: false, cash: 0 };

    p.health -= damage;
    if (p.health <= 0) {
      p.isDead = true;
      p.rig.root.rotation.x = Math.PI / 2;
      p.rig.root.position.y = 0.3;
      return { killed: true, cash: p.cashReward };
    }
    p.isPanicked = true;
    p.speed = 5.5;
    return { killed: false, cash: 0 };
  }
}
