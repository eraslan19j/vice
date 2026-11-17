import * as THREE from "three";

export interface CharacterRig {
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Group;
  leftUpperArm: THREE.Group;
  leftForearm: THREE.Group;
  rightUpperArm: THREE.Group;
  rightForearm: THREE.Group;
  leftThigh: THREE.Group;
  leftShin: THREE.Group;
  rightThigh: THREE.Group;
  rightShin: THREE.Group;
  weaponSocket: THREE.Group;
  weaponMeshes: Record<string, THREE.Group>;
  currentWeapon: string;
  walkCycle: number;
  punchTimer: number;
}

export class CharacterBuilder {
  public static createCharacter(isNpc: boolean = false, skinToneIndex: number = 0): CharacterRig {
    const root = new THREE.Group();
    root.name = isNpc ? "npc_character" : "player_character";

    const skinTones = [0xf5d0b0, 0xdfa47e, 0xad724e, 0x6e4327];
    const skinMat = new THREE.MeshLambertMaterial({
      color: skinTones[skinToneIndex % skinTones.length],
    });

    const shirtColors = isNpc
      ? [0x3b82f6, 0x10b981, 0xef4444, 0x8b5cf6, 0x64748b]
      : [0x1e293b, 0x0f172a];
    const shirtColor = shirtColors[Math.floor(Math.random() * shirtColors.length)];

    const shirtMat = new THREE.MeshLambertMaterial({
      color: shirtColor,
    });

    const pantsMat = new THREE.MeshLambertMaterial({
      color: isNpc ? 0x334155 : 0x1e3a8a, // dark denim
    });

    const shoeMat = new THREE.MeshLambertMaterial({
      color: 0x18181b,
    });

    // --- PELVIS (Center of motion) ---
    const pelvis = new THREE.Group();
    pelvis.position.y = 1.0;
    root.add(pelvis);

    const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, 0.24), pantsMat);
    pelvisMesh.castShadow = true;
    pelvis.add(pelvisMesh);

    // --- TORSO ---
    const torsoGeom = new THREE.BoxGeometry(0.44, 0.55, 0.26);
    const torso = new THREE.Mesh(torsoGeom, shirtMat);
    torso.position.y = 0.35;
    torso.castShadow = true;
    pelvis.add(torso);

    // --- HEAD & ACCESSORIES ---
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.38, 0);
    torso.add(headGroup);

    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.28, 0.25), skinMat);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // Hair / Cap
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x171717,});
    const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.1, 0.27), hairMat);
    hairMesh.position.y = 0.12;
    headGroup.add(hairMesh);

    // Sunglasses
    const glassesMat = new THREE.MeshLambertMaterial({ color: 0x111111,});
    const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.08), glassesMat);
    glasses.position.set(0, 0.04, 0.13);
    headGroup.add(glasses);

    // --- LEFT ARM ---
    const leftUpperArm = new THREE.Group();
    leftUpperArm.position.set(-0.28, 0.22, 0);
    torso.add(leftUpperArm);
    const luaMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), shirtMat);
    luaMesh.position.y = -0.14;
    luaMesh.castShadow = true;
    leftUpperArm.add(luaMesh);

    const leftForearm = new THREE.Group();
    leftForearm.position.set(0, -0.28, 0);
    leftUpperArm.add(leftForearm);
    const lfaMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.1), skinMat);
    lfaMesh.position.y = -0.13;
    lfaMesh.castShadow = true;
    leftForearm.add(lfaMesh);

    // --- RIGHT ARM & WEAPON SOCKET ---
    const rightUpperArm = new THREE.Group();
    rightUpperArm.position.set(0.28, 0.22, 0);
    torso.add(rightUpperArm);
    const ruaMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), shirtMat);
    ruaMesh.position.y = -0.14;
    ruaMesh.castShadow = true;
    rightUpperArm.add(ruaMesh);

    const rightForearm = new THREE.Group();
    rightForearm.position.set(0, -0.28, 0);
    rightUpperArm.add(rightForearm);
    const rfaMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.1), skinMat);
    rfaMesh.position.y = -0.13;
    rfaMesh.castShadow = true;
    rightForearm.add(rfaMesh);

    const weaponSocket = new THREE.Group();
    weaponSocket.position.set(0, -0.26, 0.08);
    rightForearm.add(weaponSocket);

    // --- LEFT LEG ---
    const leftThigh = new THREE.Group();
    leftThigh.position.set(-0.12, -0.1, 0);
    pelvis.add(leftThigh);
    const ltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, 0.18), pantsMat);
    ltMesh.position.y = -0.2;
    ltMesh.castShadow = true;
    leftThigh.add(ltMesh);

    const leftShin = new THREE.Group();
    leftShin.position.set(0, -0.42, 0);
    leftThigh.add(leftShin);
    const lsMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.16), pantsMat);
    lsMesh.position.y = -0.2;
    lsMesh.castShadow = true;
    leftShin.add(lsMesh);

    const leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.26), shoeMat);
    leftFoot.position.set(0, -0.42, 0.05);
    leftFoot.castShadow = true;
    leftShin.add(leftFoot);

    // --- RIGHT LEG ---
    const rightThigh = new THREE.Group();
    rightThigh.position.set(0.12, -0.1, 0);
    pelvis.add(rightThigh);
    const rtMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, 0.18), pantsMat);
    rtMesh.position.y = -0.2;
    rtMesh.castShadow = true;
    rightThigh.add(rtMesh);

    const rightShin = new THREE.Group();
    rightShin.position.set(0, -0.42, 0);
    rightThigh.add(rightShin);
    const rsMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.16), pantsMat);
    rsMesh.position.y = -0.2;
    rsMesh.castShadow = true;
    rightShin.add(rsMesh);

    const rightFoot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.26), shoeMat);
    rightFoot.position.set(0, -0.42, 0.05);
    rightFoot.castShadow = true;
    rightShin.add(rightFoot);

    // --- WEAPONS GEOMETRIES ---
    const weaponMeshes: Record<string, THREE.Group> = {};
    const gunMetal = new THREE.MeshLambertMaterial({ color: 0x222225,});
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x663311,});

    // 1. Pistol
    const pistol = new THREE.Group();
    const pSlide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.24), gunMetal);
    pSlide.position.set(0, 0.04, 0.08);
    const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.08), gunMetal);
    pGrip.position.set(0, -0.04, 0);
    pGrip.rotation.x = 0.2;
    pistol.add(pSlide, pGrip);
    weaponMeshes["pistol"] = pistol;

    // 2. SMG / Assault Rifle
    const smg = new THREE.Group();
    const sBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.5), gunMetal);
    sBody.position.set(0, 0.05, 0.15);
    const sMag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.08), gunMetal);
    sMag.position.set(0, -0.08, 0.12);
    sMag.rotation.x = 0.3;
    const sBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 8), gunMetal);
    sBarrel.rotation.x = Math.PI / 2;
    sBarrel.position.set(0, 0.07, 0.45);
    smg.add(sBody, sMag, sBarrel);
    weaponMeshes["smg"] = smg;

    // 3. Shotgun
    const shotgun = new THREE.Group();
    const sgBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.65), gunMetal);
    sgBody.position.set(0, 0.05, 0.2);
    const sgStock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.22), woodMat);
    sgStock.position.set(0, 0.02, -0.15);
    const sgPump = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.15), woodMat);
    sgPump.position.set(0, 0.01, 0.25);
    shotgun.add(sgBody, sgStock, sgPump);
    weaponMeshes["shotgun"] = shotgun;

    // 4. RPG
    const rpg = new THREE.Group();
    const rTube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 12), gunMetal);
    rTube.rotation.x = Math.PI / 2;
    rTube.position.set(0, 0.1, 0.2);
    const rHead = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 12), new THREE.MeshLambertMaterial({ color: 0x2e7d32,}));
    rHead.rotation.x = Math.PI / 2;
    rHead.position.set(0, 0.1, 0.72);
    rpg.add(rTube, rHead);
    weaponMeshes["rpg"] = rpg;

    // Add weapons to socket, initially only pistol visible
    Object.entries(weaponMeshes).forEach(([key, wMesh]) => {
      wMesh.visible = key === "pistol";
      weaponSocket.add(wMesh);
    });

    return {
      root,
      pelvis,
      torso,
      head: headGroup,
      leftUpperArm,
      leftForearm,
      rightUpperArm,
      rightForearm,
      leftThigh,
      leftShin,
      rightThigh,
      rightShin,
      weaponSocket,
      weaponMeshes,
      currentWeapon: "pistol",
      walkCycle: 0,
      punchTimer: 0,
    };
  }

  public static setWeapon(rig: CharacterRig, weaponName: string) {
    rig.currentWeapon = weaponName;
    Object.entries(rig.weaponMeshes).forEach(([k, mesh]) => {
      mesh.visible = k === weaponName;
    });
  }

  public static updateAnimation(
    rig: CharacterRig,
    speed: number,
    isSprinting: boolean,
    isGrounded: boolean,
    isAiming: boolean,
    isPunching: boolean,
    delta: number
  ) {
    if (isPunching) {
      rig.punchTimer += delta * 12;
      const punchPhase = Math.sin(rig.punchTimer);
      rig.rightUpperArm.rotation.x = -Math.PI / 2 + punchPhase * 0.4;
      rig.rightUpperArm.rotation.y = punchPhase * 0.3;
      rig.rightForearm.rotation.x = -punchPhase * 0.2;
      return;
    }

    if (speed > 0.1 && isGrounded) {
      const cadence = isSprinting ? 14 : 9;
      rig.walkCycle += delta * cadence;

      const legAngle = Math.sin(rig.walkCycle) * (isSprinting ? 0.85 : 0.55);
      rig.leftThigh.rotation.x = legAngle;
      rig.rightThigh.rotation.x = -legAngle;

      rig.leftShin.rotation.x = Math.max(0, -legAngle * 1.1);
      rig.rightShin.rotation.x = Math.max(0, legAngle * 1.1);

      // Natural hip bounce & lean
      rig.pelvis.position.y = 1.0 + Math.abs(Math.sin(rig.walkCycle * 2)) * 0.05;
      rig.torso.rotation.x = isSprinting ? 0.2 : 0.05;

      // Arm swing if not aiming
      if (!isAiming && rig.currentWeapon === "fist") {
        rig.leftUpperArm.rotation.x = -legAngle * 0.8;
        rig.rightUpperArm.rotation.x = legAngle * 0.8;
      }
    } else {
      // Idle pose
      rig.walkCycle = 0;
      rig.leftThigh.rotation.x = THREE.MathUtils.lerp(rig.leftThigh.rotation.x, 0, 0.1);
      rig.rightThigh.rotation.x = THREE.MathUtils.lerp(rig.rightThigh.rotation.x, 0, 0.1);
      rig.leftShin.rotation.x = THREE.MathUtils.lerp(rig.leftShin.rotation.x, 0, 0.1);
      rig.rightShin.rotation.x = THREE.MathUtils.lerp(rig.rightShin.rotation.x, 0, 0.1);
      rig.pelvis.position.y = THREE.MathUtils.lerp(rig.pelvis.position.y, 1.0, 0.1);
      rig.torso.rotation.x = THREE.MathUtils.lerp(rig.torso.rotation.x, 0, 0.1);
    }

    // Aim pose
    if (isAiming || rig.currentWeapon !== "fist") {
      rig.rightUpperArm.rotation.x = THREE.MathUtils.lerp(rig.rightUpperArm.rotation.x, -Math.PI / 2 + 0.1, 0.15);
      rig.rightUpperArm.rotation.y = THREE.MathUtils.lerp(rig.rightUpperArm.rotation.y, -0.2, 0.15);
      rig.rightForearm.rotation.x = THREE.MathUtils.lerp(rig.rightForearm.rotation.x, -0.2, 0.15);

      rig.leftUpperArm.rotation.x = THREE.MathUtils.lerp(rig.leftUpperArm.rotation.x, -Math.PI / 2.2, 0.15);
      rig.leftUpperArm.rotation.y = THREE.MathUtils.lerp(rig.leftUpperArm.rotation.y, 0.4, 0.15);
      rig.leftForearm.rotation.x = THREE.MathUtils.lerp(rig.leftForearm.rotation.x, -0.5, 0.15);
    } else {
      rig.rightUpperArm.rotation.x = THREE.MathUtils.lerp(rig.rightUpperArm.rotation.x, 0, 0.1);
      rig.rightUpperArm.rotation.y = THREE.MathUtils.lerp(rig.rightUpperArm.rotation.y, 0, 0.1);
      rig.leftUpperArm.rotation.x = THREE.MathUtils.lerp(rig.leftUpperArm.rotation.x, 0, 0.1);
      rig.leftUpperArm.rotation.y = THREE.MathUtils.lerp(rig.leftUpperArm.rotation.y, 0, 0.1);
    }
  }
}
