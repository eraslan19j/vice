import * as THREE from 'three';
import type { WorldData } from './world';
import { clamp } from './config';

interface Key { h: number; top: number; hor: number; sun: number; si: number; amb: number; night: number; ocean: number }
const NIGHT = { top: 0x050818, hor: 0x241452, sun: 0x7f95ff, si: 0.45, amb: 0.5, night: 1, ocean: 0x0b2a4c };
const DAY = { top: 0x2488e0, hor: 0xbfe9ff, sun: 0xfff3dd, si: 2.5, amb: 0.9, night: 0, ocean: 0x1fb7c9 };
const KEYS: Key[] = [
  { h: 0, ...NIGHT },
  { h: 5.2, ...NIGHT },
  { h: 6.6, top: 0x4a5aa8, hor: 0xff9e7a, sun: 0xffb080, si: 1.7, amb: 0.75, night: 0.3, ocean: 0x2a8fa8 },
  { h: 9, ...DAY },
  { h: 16.5, ...DAY },
  { h: 18.6, top: 0x6b3fa6, hor: 0xff7d7a, sun: 0xff9a5c, si: 2.3, amb: 0.9, night: 0.2, ocean: 0x2f93b4 },
  { h: 20, top: 0x2a1a66, hor: 0xff4f9a, sun: 0xff5f8a, si: 1.0, amb: 0.7, night: 0.75, ocean: 0x1c4c80 },
  { h: 21.6, ...NIGHT },
  { h: 24, ...NIGHT },
];

const ca = new THREE.Color(), cb = new THREE.Color();
function mixHex(out: THREE.Color, a: number, b: number, t: number) {
  ca.set(a);
  cb.set(b);
  return out.copy(ca).lerp(cb, t);
}

export class Environment {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: THREE.Mesh;
  stars: THREE.Points;
  fog: THREE.Fog;
  night = 0;
  sunDir = new THREE.Vector3();
  private uni: Record<string, THREE.IUniform>;
  private lightDir = new THREE.Vector3();
  private tmp = new THREE.Color();

  constructor(scene: THREE.Scene, shadowSize: number) {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a6f66, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.shadow.mapSize.set(shadowSize || 512, shadowSize || 512);
    const sc = this.sun.shadow.camera;
    sc.left = -85; sc.right = 85; sc.top = 85; sc.bottom = -85; sc.near = 10; sc.far = 420;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.08;
    this.sun.castShadow = shadowSize > 0;
    scene.add(this.sun, this.sun.target);
    this.fog = new THREE.Fog(0xffffff, 130, 980);
    scene.fog = this.fog;

    this.uni = {
      top: { value: new THREE.Color() },
      hor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunCol: { value: new THREE.Color() },
      retro: { value: 0 },
      discR: { value: 0.06 },
      glow: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uni,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol;
        uniform float retro; uniform float discR; uniform float glow;
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 col = mix(hor, top, pow(h, 0.5));
          if (d.y < 0.0) col = mix(hor, hor * 0.55, clamp(-d.y * 5.0, 0.0, 1.0));
          float cs = dot(d, sunDir);
          col += sunCol * pow(max(cs, 0.0), 18.0) * 0.4 * glow;
          col += sunCol * pow(max(cs, 0.0), 120.0) * 0.5 * glow;
          float ang = acos(clamp(cs, -1.0, 1.0));
          if (ang < discR && d.y > -0.01) {
            float ny = (d.y - sunDir.y) / discR;
            float cut = 0.0;
            if (ny < 0.15) {
              float band = fract((ny + 1.0) * 4.5);
              float th = 0.2 + (0.15 - ny) * 0.42;
              cut = step(band, th);
            }
            vec3 retroCol = mix(vec3(1.0, 0.16, 0.5), vec3(1.0, 0.9, 0.3), smoothstep(-0.9, 0.8, ny)) * 1.6;
            vec3 disc = mix(sunCol * 2.2, retroCol, retro);
            float edge = smoothstep(discR, discR * 0.94, ang);
            col = mix(col, disc, edge * (1.0 - cut * retro));
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.asin(0.08 + Math.random() * 0.92);
      pos[i * 3] = Math.cos(a) * Math.cos(e) * 1400;
      pos[i * 3 + 1] = Math.sin(e) * 1400;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 1400;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    scene.add(this.stars);
  }

  update(tod: number, focus: THREE.Vector3, camPos: THREE.Vector3, world: WorldData) {
    let i = 0;
    while (i < KEYS.length - 2 && tod >= KEYS[i + 1].h) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = clamp((tod - a.h) / (b.h - a.h), 0, 1);
    const L = (x: number, y: number) => x + (y - x) * t;
    const u = this.uni;
    mixHex(u.top.value, a.top, b.top, t);
    mixHex(u.hor.value, a.hor, b.hor, t);
    mixHex(u.sunCol.value, a.sun, b.sun, t);
    this.night = L(a.night, b.night);

    // sun arc: rises in the east (+x, over the ocean), sets in the west
    const ang = ((tod - 6.5) / 13) * Math.PI;
    this.sunDir.set(Math.cos(ang), Math.sin(ang), -0.3).normalize();
    const up = this.sunDir.y > -0.04;
    if (up) {
      u.sunDir.value.copy(this.sunDir);
      u.retro.value = 1 - clamp((this.sunDir.y - 0.22) / 0.3, 0, 1);
      u.discR.value = 0.055 + u.retro.value * 0.065;
      u.glow.value = 1;
      this.lightDir.copy(this.sunDir);
      this.lightDir.y = Math.max(this.lightDir.y, 0.28);
    } else {
      u.sunDir.value.set(-0.35, 0.72, 0.5).normalize();
      u.retro.value = 0;
      u.discR.value = 0.03;
      u.glow.value = 0.35;
      this.lightDir.copy(u.sunDir.value);
    }
    this.lightDir.normalize();
    this.sun.color.copy(u.sunCol.value);
    this.sun.intensity = L(a.si, b.si);
    this.sun.position.copy(focus).addScaledVector(this.lightDir, 200);
    this.sun.target.position.copy(focus);
    this.hemi.intensity = L(a.amb, b.amb) * 2.2;
    this.hemi.color.copy(u.top.value).lerp(this.tmp.set(0xffffff), 0.55);
    this.hemi.groundColor.copy(u.hor.value).lerp(this.tmp.set(0x6a5a55), 0.6);
    this.fog.color.copy(u.hor.value);
    this.sky.position.copy(camPos);
    this.stars.position.copy(camPos);
    (this.stars.material as THREE.PointsMaterial).opacity = clamp(this.night * 1.4 - 0.4, 0, 1);

    const n = this.night;
    for (const m of world.buildingMats) m.emissiveIntensity = n * 1.25;
    world.bulbMat.color.setRGB(0.3 + n * 1.5, 0.3 + n * 1.3, 0.3 + n * 0.8);
    mixHex(world.oceanMat.color, a.ocean, b.ocean, t);
  }
}
