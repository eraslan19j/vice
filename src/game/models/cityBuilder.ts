import * as THREE from "three";
import { TextureGenerator } from "../textures/textureGenerator";

export interface InteractiveZone {
  id: string;
  type: "bank_vault" | "ammunation" | "pay_n_spray" | "mission_start" | "dock_dropoff";
  position: THREE.Vector3;
  radius: number;
  label: string;
  description: string;
  markerMesh?: THREE.Mesh;
}

export interface CityData {
  root: THREE.Group;
  colliderBoxes: THREE.Box3[];
  interactiveZones: InteractiveZone[];
  /** Shared emissive material of every street lamp head (no real lights: they killed mobile GPUs) */
  lampMat: THREE.MeshBasicMaterial;
  /** Additive glow pools on the road under each lamp, toggled at night */
  glowPools: THREE.InstancedMesh;
  /** Shared red beacon material on skyscrapers (blinked from the game loop) */
  beaconMat: THREE.MeshBasicMaterial;
  /** Skyscraper facade material: its emissiveIntensity is raised at night so windows glow (no lights needed) */
  windowMat: THREE.MeshLambertMaterial;
  /** NOT part of root (root is frozen / static); add it to the scene separately */
  oceanMesh: THREE.Mesh;
  spawnPoints: { x: number; y: number; z: number }[];
  carSpawns: { x: number; y: number; z: number; rotY: number; type: "supercar" | "muscle" | "police" | "suv" }[];
}

export class CityBuilder {
  public static buildCity(): CityData {
    const root = new THREE.Group();
    root.name = "city_world";

    const colliderBoxes: THREE.Box3[] = [];
    const interactiveZones: InteractiveZone[] = [];
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x330000 });

    // --- MATERIALS ---
    const roadTexture = TextureGenerator.createRoadTexture();
    roadTexture.repeat.set(1, 10);
    const roadMat = new THREE.MeshLambertMaterial({
      map: roadTexture,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const crosswalkTexture = TextureGenerator.createCrosswalkTexture();
    const crosswalkMat = new THREE.MeshLambertMaterial({
      map: crosswalkTexture,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const sidewalkTexture = TextureGenerator.createSidewalkTexture();
    sidewalkTexture.repeat.set(2, 20);
    const sidewalkMat = new THREE.MeshLambertMaterial({
      map: sidewalkTexture,
    });

    const skyscraperTex = TextureGenerator.createSkyscraperTexture();
    const glassMat = new THREE.MeshLambertMaterial({
      map: skyscraperTex,
      emissive: 0xffffff,
      emissiveMap: skyscraperTex,
      emissiveIntensity: 0,
    });

    const concreteMat = new THREE.MeshLambertMaterial({
      color: 0x475569,
    });

    const sandMat = new THREE.MeshLambertMaterial({
      color: 0xe2ba84,
    });

    // Ocean: cheap Phong + transparency (MeshPhysicalMaterial transmission = extra full-scene render pass!)
    const oceanMat = new THREE.MeshPhongMaterial({
      color: 0x0284c7,
      shininess: 90,
      specular: 0x88ccff,
      transparent: true,
      opacity: 0.88,
    });

    // --- TERRAIN & OCEAN ---
    // Ground plane (City foundation)
    const groundGeom = new THREE.PlaneGeometry(1000, 1000);
    groundGeom.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeom, concreteMat);
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    root.add(ground);

    // Ocean on West Side (x < -220)
    const oceanGeom = new THREE.PlaneGeometry(600, 1000, 1, 1);
    oceanGeom.rotateX(-Math.PI / 2);
    const oceanMesh = new THREE.Mesh(oceanGeom, oceanMat);
    oceanMesh.position.set(-520, -0.6, 0);
    // oceanMesh is animated -> kept outside the frozen static root

    // Sandy Beach Strip (-220 to -170)
    const beachGeom = new THREE.BoxGeometry(60, 0.5, 1000);
    const beach = new THREE.Mesh(beachGeom, sandMat);
    beach.position.set(-195, -0.2, 0);
    beach.receiveShadow = true;
    root.add(beach);

    // --- ROAD NETWORK GRID ---
    // City bounds: x from -160 to +240, z from -300 to +300
    // Major North-South Avenues at x = -130, -50, 40, 130, 210
    // Major East-West Boulevards at z = -220, -110, 0, 110, 220
    const avenueX = [-130, -50, 40, 130, 210];
    const boulevardZ = [-220, -110, 0, 110, 220];
    const roadWidth = 24;

    // Draw North-South Avenues
    avenueX.forEach((x) => {
      const segGeom = new THREE.PlaneGeometry(roadWidth, 600);
      segGeom.rotateX(-Math.PI / 2);
      const road = new THREE.Mesh(segGeom, roadMat);
      road.position.set(x, 0.02, 0);
      road.receiveShadow = true;
      root.add(road);

      // Sidewalks on both sides
      const swGeomL = new THREE.BoxGeometry(4, 0.35, 600);
      const swL = new THREE.Mesh(swGeomL, sidewalkMat);
      swL.position.set(x - roadWidth * 0.5 - 2, 0.17, 0);
      swL.receiveShadow = true;

      const swR = swL.clone();
      swR.position.x = x + roadWidth * 0.5 + 2;
      root.add(swL, swR);
    });

    // Draw East-West Boulevards
    boulevardZ.forEach((z) => {
      const segGeom = new THREE.PlaneGeometry(400, roadWidth);
      segGeom.rotateX(-Math.PI / 2);
      segGeom.rotateY(Math.PI / 2);
      const road = new THREE.Mesh(segGeom, roadMat);
      road.position.set(40, 0.03, z);
      road.receiveShadow = true;
      root.add(road);

      // Sidewalks
      const swGeom = new THREE.BoxGeometry(400, 0.35, 4);
      const swN = new THREE.Mesh(swGeom, sidewalkMat);
      swN.position.set(40, 0.17, z - roadWidth * 0.5 - 2);
      swN.receiveShadow = true;

      const swS = swN.clone();
      swS.position.z = z + roadWidth * 0.5 + 2;
      root.add(swN, swS);
    });

    // Intersections crosswalk decals
    avenueX.forEach((x) => {
      boulevardZ.forEach((z) => {
        const cw = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, roadWidth), crosswalkMat);
        cw.rotation.x = -Math.PI / 2;
        cw.position.set(x, 0.04, z);
        cw.receiveShadow = true;
        root.add(cw);
      });
    });

    // Helper to add building with collider
    const addBuilding = (
      name: string,
      x: number,
      z: number,
      width: number,
      depth: number,
      height: number,
      mat: THREE.Material = glassMat,
      isGlassSkyscraper: boolean = false
    ) => {
      const bGeom = new THREE.BoxGeometry(width, height, depth);
      const bMesh = new THREE.Mesh(bGeom, mat);
      bMesh.name = name;
      bMesh.position.set(x, height / 2, z);
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      root.add(bMesh);

      // Skyscraper roof structure (helipad or AC units)
      if (isGlassSkyscraper && height > 40) {
        const roofGeom = new THREE.BoxGeometry(width * 0.7, 4, depth * 0.7);
        const roofCap = new THREE.Mesh(roofGeom, concreteMat);
        roofCap.position.set(x, height + 2, z);
        roofCap.castShadow = true;
        root.add(roofCap);

        // Antenna with flashing beacon
        const antGeom = new THREE.CylinderGeometry(0.3, 0.6, 14, 8);
        const ant = new THREE.Mesh(antGeom, concreteMat);
        ant.position.set(x, height + 11, z);
        root.add(ant);

        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), beaconMat);
        beacon.position.set(x, height + 18, z);
        root.add(beacon);
      }

      // Collider
      const box = new THREE.Box3(
        new THREE.Vector3(x - width / 2 - 0.5, 0, z - depth / 2 - 0.5),
        new THREE.Vector3(x + width / 2 + 0.5, height, z + depth / 2 + 0.5)
      );
      colliderBoxes.push(box);
      return bMesh;
    };

    // --- DOWNTOWN SKYSCRAPERS (Blocks between avenues) ---
    // Block 1 (x: -10 to 10, z: -80 to -30)
    addBuilding("MazeTower_Skyscraper", -5, -55, 34, 34, 110, glassMat, true);
    addBuilding("Arcadia_Plaza", -5, 55, 38, 38, 85, glassMat, true);
    addBuilding("Lombank_Tower", 85, -55, 32, 32, 95, glassMat, true);
    addBuilding("FIB_Bureau_Tower", 85, 55, 36, 36, 75, glassMat, true);
    addBuilding("Schlongberg_Tower", 170, -55, 30, 30, 65, glassMat, true);
    addBuilding("Elysian_Heights", 170, 55, 32, 32, 70, glassMat, true);

    // Mid-rise corporate complexes
    addBuilding("City_Hall_Annex", -90, -55, 32, 36, 35, concreteMat);
    addBuilding("Metro_Library", -90, 55, 30, 32, 28, concreteMat);
    addBuilding("Vinewood_Suites", -90, 165, 34, 38, 42, concreteMat);
    addBuilding("Downtown_Condos_A", -90, -165, 32, 34, 45, concreteMat);
    addBuilding("Financial_Plaza_East", 170, 165, 32, 35, 50, glassMat, true);
    addBuilding("Tech_Incubator", 170, -165, 34, 34, 40, concreteMat);

    // --- PACIFIC UNION BANK (Grand Bank with Vault) ---
    const bankMesh = addBuilding("Pacific_Union_Bank", -5, -165, 42, 36, 22, concreteMat);
    // Bank Pillars
    for (let p = -16; p <= 16; p += 8) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 18, 16), concreteMat);
      col.position.set(-5 + p, 9, -165 + 19);
      col.castShadow = true;
      root.add(col);
    }
    // Bank Sign
    const bankSignTex = TextureGenerator.createSignTexture("PACIFIC UNION BANK", "EST. 1898 - VAULT LEVEL 1", "#f59e0b", "#0f172a");
    const bankSign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: bankSignTex }));
    bankSign.position.set(-5, 18, -165 + 18.2);
    root.add(bankSign);

    // Bank Vault Trigger Zone (Inside front grand entrance)
    interactiveZones.push({
      id: "bank_vault",
      type: "bank_vault",
      position: new THREE.Vector3(-5, 1, -165 + 14),
      radius: 4.5,
      label: "PACIFIC UNION BANK VAULT",
      description: "Press [E] to plant C4 explosives and rob the safe ($25,000)! Warning: High Wanted Level!",
    });

    // --- AMMU-NATION GUN SHOP ---
    const ammuBuilding = addBuilding("AmmuNation_Store", 85, 165, 32, 28, 14, concreteMat);
    const ammuSignTex = TextureGenerator.createSignTexture("AMMU-NATION", "PROTECTING YOUR RIGHTS & GUNS", "#ef4444", "#18181b");
    const ammuSign = new THREE.Mesh(new THREE.PlaneGeometry(15, 3.8), new THREE.MeshBasicMaterial({ map: ammuSignTex }));
    ammuSign.position.set(85, 11, 165 - 14.2);
    ammuSign.rotation.y = Math.PI;
    root.add(ammuSign);

    // Gun Shop Entrance Trigger Zone
    interactiveZones.push({
      id: "ammunation",
      type: "ammunation",
      position: new THREE.Vector3(85, 1, 165 - 12),
      radius: 4.5,
      label: "AMMU-NATION GUN SHOP",
      description: "Press [E] to purchase firearms, body armor, and ammo!",
    });

    // --- PAY 'N' SPRAY AUTO BODY SHOP ---
    const sprayBuilding = addBuilding("PayNSpray_Garage", 85, -165, 32, 28, 12, concreteMat);
    const spraySignTex = TextureGenerator.createSignTexture("PAY 'N' SPRAY", "RESRAY - REPAIR - CLEAR WANTED", "#10b981", "#022c22");
    const spraySign = new THREE.Mesh(new THREE.PlaneGeometry(15, 3.8), new THREE.MeshBasicMaterial({ map: spraySignTex }));
    spraySign.position.set(85, 9.5, -165 + 14.2);
    root.add(spraySign);

    // Pay 'N' Spray Garage Bay Door Trigger Zone
    interactiveZones.push({
      id: "pay_n_spray",
      type: "pay_n_spray",
      position: new THREE.Vector3(85, 1, -165 + 12),
      radius: 5.5,
      label: "PAY 'N' SPRAY AUTO BODY",
      description: "Drive in to repair vehicle ($500) and completely clear Police Wanted Stars!",
    });

    // --- INDUSTRIAL DOCKS & GANG TURF (South: z > 200) ---
    // Shipping Containers Stacked
    const containerColors = ["#1e40af", "#b91c1c", "#047857", "#c2410c", "#eab308"];
    const containerMatMap = new Map<string, THREE.MeshLambertMaterial>();
    containerColors.forEach((col) => {
      containerMatMap.set(
        col,
        new THREE.MeshLambertMaterial({
          map: TextureGenerator.createContainerTexture(col),
        })
      );
    });

    const dockPositions = [
      { x: 30, z: 250, r: 0, c: "#1e40af" },
      { x: 30, z: 265, r: 0, c: "#b91c1c" },
      { x: 50, z: 255, r: Math.PI / 2, c: "#047857" },
      { x: 50, z: 270, r: Math.PI / 2, c: "#c2410c" },
      { x: 120, z: 250, r: 0, c: "#eab308" },
      { x: 120, z: 265, r: 0, c: "#1e40af" },
      { x: 140, z: 255, r: 0, c: "#b91c1c" },
      { x: 140, z: 270, r: 0, c: "#047857" },
    ];

    dockPositions.forEach((pos, idx) => {
      const cGeom = new THREE.BoxGeometry(8, 3.5, 16);
      const cMesh = new THREE.Mesh(cGeom, containerMatMap.get(pos.c)!);
      cMesh.rotation.y = pos.r;
      cMesh.position.set(pos.x, 1.75, pos.z);
      cMesh.castShadow = true;
      cMesh.receiveShadow = true;
      root.add(cMesh);

      // Stacked 2nd level container
      if (idx % 2 === 0) {
        const topMesh = cMesh.clone();
        topMesh.position.y = 5.25;
        root.add(topMesh);
      }

      colliderBoxes.push(
        new THREE.Box3(
          new THREE.Vector3(pos.x - 5, 0, pos.z - 9),
          new THREE.Vector3(pos.x + 5, 4, pos.z + 9)
        )
      );
    });

    // Giant Red Gantry Crane at Port
    const craneMat = new THREE.MeshLambertMaterial({ color: 0xdc2626,});
    const craneLegL = new THREE.Mesh(new THREE.BoxGeometry(2, 28, 2), craneMat);
    craneLegL.position.set(80, 14, 280);
    const craneLegR = craneLegL.clone();
    craneLegR.position.x = 105;
    const craneBeam = new THREE.Mesh(new THREE.BoxGeometry(45, 3, 3), craneMat);
    craneBeam.position.set(92.5, 28, 280);
    root.add(craneLegL, craneLegR, craneBeam);

    // Gang Turf & Mission Trigger Zone
    interactiveZones.push({
      id: "dock_dropoff",
      type: "dock_dropoff",
      position: new THREE.Vector3(85, 1, 255),
      radius: 6.0,
      label: "PORT EXPORT CRANE & SAFEHOUSE",
      description: "Deliver stolen supercars here or complete gang turf contracts for massive cash rewards!",
    });

    // --- BEACH PIER & FERRIS WHEEL (West Side: x = -200, z = 0) ---
    const pierPlankMat = new THREE.MeshLambertMaterial({ color: 0x78350f,});
    const pierGeom = new THREE.BoxGeometry(160, 1.2, 24);
    const pier = new THREE.Mesh(pierGeom, pierPlankMat);
    pier.position.set(-270, 1.0, 0);
    pier.castShadow = true;
    pier.receiveShadow = true;
    root.add(pier);

    // Pier Pilings into Ocean
    for (let px = -340; px <= -200; px += 20) {
      for (let pz = -9; pz <= 9; pz += 9) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 8, 8), pierPlankMat);
        pole.position.set(px, -2, pz);
        root.add(pole);
      }
    }

    // Ferris Wheel at end of Pier
    const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2, 16), concreteMat);
    wheelHub.rotation.z = Math.PI / 2;
    wheelHub.position.set(-330, 22, 0);
    root.add(wheelHub);

    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(18, 0.4, 8, 32), new THREE.MeshLambertMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.8 }));
    rimRing.rotation.y = Math.PI / 2;
    rimRing.position.copy(wheelHub.position);
    root.add(rimRing);

    // --- STUNT JUMP RAMPS ---
    const rampMat = new THREE.MeshLambertMaterial({ color: 0xf59e0b,});
    const createStuntRamp = (x: number, y: number, z: number, rotY: number) => {
      const rampGeom = new THREE.BoxGeometry(8, 2.5, 14);
      rampGeom.rotateX(0.3); // Incline
      const rampMesh = new THREE.Mesh(rampGeom, rampMat);
      rampMesh.position.set(x, y + 1.2, z);
      rampMesh.rotation.y = rotY;
      rampMesh.castShadow = true;
      rampMesh.receiveShadow = true;
      root.add(rampMesh);

      colliderBoxes.push(
        new THREE.Box3(
          new THREE.Vector3(x - 4, y, z - 7),
          new THREE.Vector3(x + 4, y + 3, z + 7)
        )
      );
    };

    createStuntRamp(-50, 0, -60, 0);
    createStuntRamp(40, 0, 80, Math.PI);
    createStuntRamp(-130, 0, 150, 0);

    // --- PALM TREES & STREET CLUTTER ---
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c4033,});
    const frondMat = new THREE.MeshLambertMaterial({ color: 0x15803d,});

    const palmSpots: { x: number; z: number }[] = [];
    for (let z = -250; z <= 250; z += 35) {
      palmSpots.push({ x: -146, z }, { x: -114, z });
    }
    for (let z = -200; z <= 200; z += 40) {
      palmSpots.push({ x: -34, z }, { x: 24, z });
    }

    const FRONDS = 7;
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 6), trunkMat, palmSpots.length);
    const fronds = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 3.8, 4), frondMat, palmSpots.length * FRONDS);
    const _m = new THREE.Matrix4();
    const _q = new THREE.Quaternion();
    const _e = new THREE.Euler();
    const _p = new THREE.Vector3();
    const _s = new THREE.Vector3(1, 1, 1);
    palmSpots.forEach((spot, i) => {
      _e.set(0, 0, (Math.random() - 0.5) * 0.15);
      _q.setFromEuler(_e);
      _p.set(spot.x, 3.5, spot.z);
      trunks.setMatrixAt(i, _m.compose(_p, _q, _s));
      for (let f = 0; f < FRONDS; f++) {
        _e.set(0, (f * Math.PI * 2) / FRONDS, Math.PI / 2.6);
        _q.setFromEuler(_e);
        _p.set(spot.x, 7.2, spot.z);
        fronds.setMatrixAt(i * FRONDS + f, _m.compose(_p, _q, _s));
      }
    });
    trunks.instanceMatrix.needsUpdate = true;
    fronds.instanceMatrix.needsUpdate = true;
    root.add(trunks, fronds);

    // --- STREETLAMPS: instanced poles/arms/heads + fake additive glow pools (zero real lights) ---
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xcfc7a6 });

    const lampSpots: { x: number; z: number; toRoad: number }[] = [];
    avenueX.forEach((ax) => {
      for (let z = -200; z <= 200; z += 65) {
        lampSpots.push({ x: ax - 14, z, toRoad: 1 }, { x: ax + 14, z, toRoad: -1 });
      }
    });

    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 7.5, 6), poleMat, lampSpots.length);
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(2.0, 0.12, 0.12), poleMat, lampSpots.length);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.15, 0.3), lampMat, lampSpots.length);

    // Radial gradient used for the glow pools
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 64;
    glowCanvas.height = 64;
    const gctx = glowCanvas.getContext("2d")!;
    const grad = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,236,180,0.85)");
    grad.addColorStop(1, "rgba(255,236,180,0)");
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 64, 64);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const glowMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.6,
    });
    const glowGeom = new THREE.PlaneGeometry(15, 15);
    glowGeom.rotateX(-Math.PI / 2);
    const glowPools = new THREE.InstancedMesh(glowGeom, glowMat, lampSpots.length);
    glowPools.renderOrder = 2;
    glowPools.visible = false; // turned on at dusk/night

    const _id = new THREE.Quaternion();
    lampSpots.forEach((l, i) => {
      poles.setMatrixAt(i, _m.compose(_p.set(l.x, 3.75, l.z), _id, _s));
      arms.setMatrixAt(i, _m.compose(_p.set(l.x + l.toRoad * 0.9, 7.4, l.z), _id, _s));
      heads.setMatrixAt(i, _m.compose(_p.set(l.x + l.toRoad * 1.8, 7.3, l.z), _id, _s));
      glowPools.setMatrixAt(i, _m.compose(_p.set(l.x + l.toRoad * 3.5, 0.07, l.z), _id, _s));
    });
    poles.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    glowPools.instanceMatrix.needsUpdate = true;
    root.add(poles, arms, heads, glowPools);

    // --- INTERACTIVE ZONE GROUND RINGS ---
    interactiveZones.forEach((zone) => {
      const ringGeom = new THREE.RingGeometry(zone.radius * 0.8, zone.radius, 32);
      ringGeom.rotateX(-Math.PI / 2);
      const ringColor =
        zone.type === "bank_vault" ? 0xf59e0b :
        zone.type === "ammunation" ? 0xef4444 :
        zone.type === "pay_n_spray" ? 0x10b981 : 0x3b82f6;

      const ringMat = new THREE.MeshBasicMaterial({
        color: ringColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const marker = new THREE.Mesh(ringGeom, ringMat);
      marker.position.copy(zone.position);
      marker.position.y = 0.1;
      root.add(marker);
      zone.markerMesh = marker;
    });

    // --- VEHICLE SPAWN POINTS PARKED ON THE STREETS ---
    const carSpawns = [
      { x: -50, y: 0.1, z: 20, rotY: 0, type: "supercar" as const },
      { x: 40, y: 0.1, z: -30, rotY: Math.PI, type: "muscle" as const },
      { x: -130, y: 0.1, z: -80, rotY: 0, type: "police" as const },
      { x: 130, y: 0.1, z: 90, rotY: Math.PI / 2, type: "suv" as const },
      { x: -50, y: 0.1, z: -140, rotY: 0, type: "supercar" as const },
      { x: 210, y: 0.1, z: -20, rotY: Math.PI, type: "muscle" as const },
    ];

    const spawnPoints = [
      { x: -50, y: 1.0, z: 5 },
      { x: 0, y: 1.0, z: 0 },
      { x: 85, y: 1.0, z: 140 },
    ];

    // Freeze the static world: no per-frame matrix recomputation for hundreds of meshes
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      o.matrixAutoUpdate = false;
    });
    root.matrixWorldAutoUpdate = false;

    return {
      root,
      colliderBoxes,
      interactiveZones,
      windowMat: glassMat,
      lampMat,
      glowPools,
      beaconMat,
      oceanMesh,
      spawnPoints,
      carSpawns,
    };
  }
}
