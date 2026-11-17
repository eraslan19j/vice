import * as THREE from 'three';
import { makeGlowTexture } from './textures';

interface P {
  s: THREE.Sprite;
  vx: number; vy: number; vz: number;
  life: number; max: number; s0: number; s1: number; a: number;
}
export class Effects {
  private parts: P[] = [];
  private tracers: { line: THREE.Line; life: number }[] = [];
  private next = 0;
  private nextTr = 0;

  constructor(scene: THREE.Scene, count = 90) {
    const map = makeGlowTexture();
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }));
      s.visible = false;
      scene.add(s);
      this.parts.push({ s, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 1, s1: 1, a: 1 });
    }
    for (let i = 0; i < 14; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.9, toneMapped: false }));
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
  }

  spawn(x: number, y: number, z: number, o: { color: number; life: number; s0: number; s1: number; vx?: number; vy?: number; vz?: number; add?: boolean; a?: number }) {
    const p = this.parts[this.next];
    this.next = (this.next + 1) % this.parts.length;
    p.s.position.set(x, y, z);
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.vz = o.vz || 0;
    p.life = p.max = o.life;
    p.s0 = o.s0;
    p.s1 = o.s1;
    p.a = o.a ?? 1;
    const m = p.s.material;
    m.color.set(o.color);
    m.blending = o.add === false ? THREE.NormalBlending : THREE.AdditiveBlending;
    m.opacity = p.a;
    p.s.scale.setScalar(o.s0);
    p.s.visible = true;
  }
  tracer(a: THREE.Vector3, b: THREE.Vector3) {
    const t = this.tracers[this.nextTr];
    this.nextTr = (this.nextTr + 1) % this.tracers.length;
    const pos = t.line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, a.x, a.y, a.z);
    pos.setXYZ(1, b.x, b.y, b.z);
    pos.needsUpdate = true;
    t.line.visible = true;
    t.life = 0.07;
  }
  flash(x: number, y: number, z: number) {
    this.spawn(x, y, z, { color: 0xffe08a, life: 0.06, s0: 0.9, s1: 0.3 });
  }
  spark(x: number, y: number, z: number) {
    for (let i = 0; i < 3; i++)
      this.spawn(x, y, z, { color: 0xffd27a, life: 0.25, s0: 0.25, s1: 0.05, vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 5 });
  }
  blood(x: number, y: number, z: number) {
    for (let i = 0; i < 3; i++)
      this.spawn(x, y, z, { color: 0xb0101a, life: 0.35, s0: 0.3, s1: 0.1, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, add: false });
  }
  smoke(x: number, y: number, z: number, dark = true) {
    this.spawn(x, y, z, { color: dark ? 0x222222 : 0x999999, life: 1.3, s0: 0.8, s1: 3, vx: (Math.random() - 0.5) * 0.8, vy: 2 + Math.random(), vz: (Math.random() - 0.5) * 0.8, add: false, a: 0.55 });
  }
  fire(x: number, y: number, z: number) {
    this.spawn(x + (Math.random() - 0.5) * 1.2, y, z + (Math.random() - 0.5) * 1.2, { color: Math.random() < 0.5 ? 0xff7a1a : 0xffc23a, life: 0.5, s0: 1.6, s1: 0.4, vy: 3 + Math.random() * 2 });
  }
  explosion(x: number, y: number, z: number) {
    this.spawn(x, y + 1, z, { color: 0xfff0c0, life: 0.25, s0: 4, s1: 16 });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 7;
      this.spawn(x, y + 0.8, z, { color: i % 2 ? 0xff6a10 : 0xffb030, life: 0.6 + Math.random() * 0.5, s0: 3.5, s1: 1, vx: Math.cos(a) * r, vy: 2 + Math.random() * 8, vz: Math.sin(a) * r });
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn(x, y + 1.2, z, { color: 0x1a1a1a, life: 1.8 + Math.random(), s0: 2.5, s1: 8, vx: Math.cos(a) * 2, vy: 3 + Math.random() * 3, vz: Math.sin(a) * 2, add: false, a: 0.7 });
    }
  }

  update(dt: number) {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        continue;
      }
      const k = 1 - p.life / p.max;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      p.vx *= 1 - dt * 1.5;
      p.vz *= 1 - dt * 1.5;
      p.vy *= 1 - dt * 1.2;
      p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * k);
      p.s.material.opacity = p.a * (1 - k * k);
    }
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.line.visible = false;
    }
  }
}
