import * as THREE from "three";
import { soundManager } from "../audio/soundManager";

export interface MissionStep {
  text: string;
  targetPos?: THREE.Vector3;
  targetRadius?: number;
  timeLimit?: number; // seconds
}

export interface ActiveMission {
  id: string;
  title: string;
  giver: string;
  steps: MissionStep[];
  currentStepIndex: number;
  cashReward: number;
  timerRemaining?: number;
  isCompleted: boolean;
}

export class MissionSystem {
  public currentMission: ActiveMission | null = null;
  public missionWaypointMesh: THREE.Mesh | null = null;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.createWaypointMarker();
  }

  private createWaypointMarker() {
    const geom = new THREE.CylinderGeometry(0.2, 2.5, 4, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    });
    this.missionWaypointMesh = new THREE.Mesh(geom, mat);
    this.missionWaypointMesh.position.set(0, -50, 0);
    this.scene.add(this.missionWaypointMesh);
  }

  public startMission(missionId: string) {
    if (missionId === "heist_bank") {
      this.currentMission = {
        id: "heist_bank",
        title: "Pacific Standard Heist",
        giver: "Lester",
        steps: [
          {
            text: "Drive to the Pacific Union Bank Downtown and enter the grand entrance.",
            targetPos: new THREE.Vector3(-5, 1, -151),
            targetRadius: 7,
          },
          {
            text: "Rob the bank vault! Grab the cash bags and escape!",
            targetPos: new THREE.Vector3(-5, 1, -151),
            targetRadius: 6,
          },
          {
            text: "Evade the 3-star Police and escape to the Industrial Safehouse at the Docks!",
            targetPos: new THREE.Vector3(85, 1, 255),
            targetRadius: 10,
          },
        ],
        currentStepIndex: 0,
        cashReward: 25000,
        isCompleted: false,
      };
    } else if (missionId === "gang_turf") {
      this.currentMission = {
        id: "gang_turf",
        title: "Vagos Cartel Turf Ambush",
        giver: "Franklin",
        steps: [
          {
            text: "Head to the Industrial Container Yard in the South Docks.",
            targetPos: new THREE.Vector3(85, 1, 255),
            targetRadius: 14,
          },
          {
            text: "Neutralize cartel resistance in the yard and secure the weapons stash!",
            targetPos: new THREE.Vector3(85, 1, 265),
            targetRadius: 10,
          },
        ],
        currentStepIndex: 0,
        cashReward: 15000,
        isCompleted: false,
      };
    } else if (missionId === "exotic_theft") {
      this.currentMission = {
        id: "exotic_theft",
        title: "Gone in 60 Seconds",
        giver: "Devin Weston",
        steps: [
          {
            text: "Locate the prototype Supercar parked along Coastal Beach Boulevard.",
            targetPos: new THREE.Vector3(-130, 1, -80),
            targetRadius: 8,
          },
          {
            text: "Deliver the Supercar to the Harbor Export Crane in mint condition!",
            targetPos: new THREE.Vector3(85, 1, 255),
            targetRadius: 8,
          },
        ],
        currentStepIndex: 0,
        cashReward: 18000,
        isCompleted: false,
      };
    } else if (missionId === "vip_taxi") {
      this.currentMission = {
        id: "vip_taxi",
        title: "High Roller VIP Rush",
        giver: "Downtown Cab Co.",
        steps: [
          {
            text: "Pick up the celebrity VIP outside the Vinewood Suites.",
            targetPos: new THREE.Vector3(-90, 1, 165),
            targetRadius: 8,
          },
          {
            text: "Speed to Del Perro Beach Pier before time expires! (75s)",
            targetPos: new THREE.Vector3(-220, 1, 0),
            targetRadius: 12,
            timeLimit: 75,
          },
        ],
        currentStepIndex: 0,
        cashReward: 10000,
        timerRemaining: 75,
        isCompleted: false,
      };
    }

    this.updateWaypointMarker();
    soundManager.playHorn();
  }

  public update(
    delta: number,
    playerPos: THREE.Vector3
  ): { missionCompleted: boolean; rewardCash: number; triggerPoliceStars?: number } {
    if (!this.currentMission || this.currentMission.isCompleted) {
      if (this.missionWaypointMesh) this.missionWaypointMesh.position.y = -50;
      return { missionCompleted: false, rewardCash: 0 };
    }

    // Animate waypoint ring
    if (this.missionWaypointMesh) {
      this.missionWaypointMesh.rotation.y += delta * 2;
    }

    // Timer check
    if (this.currentMission.timerRemaining !== undefined) {
      this.currentMission.timerRemaining -= delta;
      if (this.currentMission.timerRemaining <= 0) {
        // Mission failed!
        this.currentMission = null;
        if (this.missionWaypointMesh) this.missionWaypointMesh.position.y = -50;
        return { missionCompleted: false, rewardCash: 0 };
      }
    }

    const currentStep = this.currentMission.steps[this.currentMission.currentStepIndex];
    if (currentStep && currentStep.targetPos) {
      const dist = playerPos.distanceTo(currentStep.targetPos);
      const rad = currentStep.targetRadius || 6;

      if (dist < rad) {
        // Step completed!
        this.currentMission.currentStepIndex++;

        // Special triggers
        let triggerPoliceStars: number | undefined;
        if (this.currentMission.id === "heist_bank" && this.currentMission.currentStepIndex === 2) {
          triggerPoliceStars = 3; // Trigger 3 stars when robbing bank!
          soundManager.playExplosion();
        }

        if (this.currentMission.currentStepIndex >= this.currentMission.steps.length) {
          // Entire mission passed!
          this.currentMission.isCompleted = true;
          const cash = this.currentMission.cashReward;
          this.currentMission = null;
          if (this.missionWaypointMesh) this.missionWaypointMesh.position.y = -50;
          soundManager.playMissionPassed();
          return { missionCompleted: true, rewardCash: cash, triggerPoliceStars };
        } else {
          this.updateWaypointMarker();
          soundManager.playCashEarned();
          return { missionCompleted: false, rewardCash: 0, triggerPoliceStars };
        }
      }
    }

    return { missionCompleted: false, rewardCash: 0 };
  }

  private updateWaypointMarker() {
    if (!this.missionWaypointMesh || !this.currentMission) return;
    const currentStep = this.currentMission.steps[this.currentMission.currentStepIndex];
    if (currentStep && currentStep.targetPos) {
      this.missionWaypointMesh.position.copy(currentStep.targetPos);
      this.missionWaypointMesh.position.y = 2.0;
    } else {
      this.missionWaypointMesh.position.y = -50;
    }
  }

  public cancelMission() {
    this.currentMission = null;
    if (this.missionWaypointMesh) this.missionWaypointMesh.position.y = -50;
  }
}
