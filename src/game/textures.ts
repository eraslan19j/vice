import * as THREE from 'three';
import { mulberry32 } from './config';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}
function tex(c: HTMLCanvasElement, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function noise(g: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number, seed = 1) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const v = Math.floor(r() * 255);
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

/** 8x8 window cells. style 0 = classic windows, 1 = glass tower, 2 = deco ribbon windows */
export function makeWindowTextures(style: number) {
  const S = 256;
  const N = 8;
  const cs = S / N;
  const { c, g } = canvas(S, S);
  const e = canvas(S, S);
  const r = mulberry32(100 + style * 7);
  e.g.fillStyle = '#000';
  e.g.fillRect(0, 0, S, S);
  const lit = () => {
    const p = r();
    return p < 0.6 ? '#ffd58a' : p < 0.85 ? '#fff0c8' : p < 0.93 ? '#8fe6ff' : '#ff9ad5';
  };
  if (style === 0) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, S, S);
    noise(g, S, S, 500, 0.04, 3);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const gx = x * cs + 7;
        const gy = y * cs + 7;
        const gr = g.createLinearGradient(0, gy, 0, gy + 18);
        gr.addColorStop(0, '#5b7f9c');
        gr.addColorStop(1, '#22364a');
        g.fillStyle = gr;
        g.fillRect(gx, gy, 18, 18);
        g.fillStyle = '#d4d4d4';
        g.fillRect(gx - 2, gy + 18, 22, 2);
        if (r() < 0.38) {
          e.g.fillStyle = lit();
          e.g.globalAlpha = 0.55 + r() * 0.45;
          e.g.fillRect(gx, gy, 18, 18);
        }
      }
  } else if (style === 1) {
    g.fillStyle = '#e4eef5';
    g.fillRect(0, 0, S, S);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const gx = x * cs + 2;
        const gy = y * cs + 2;
        const gr = g.createLinearGradient(gx, gy, gx + cs, gy + cs);
        gr.addColorStop(0, '#6fa3c4');
        gr.addColorStop(0.5, '#3d6f92');
        gr.addColorStop(1, '#27506e');
        g.fillStyle = gr;
        g.fillRect(gx, gy, cs - 3, cs - 3);
        if (r() < 0.3) {
          e.g.fillStyle = lit();
          e.g.globalAlpha = 0.35 + r() * 0.5;
          e.g.fillRect(gx, gy, cs - 3, cs - 3);
        }
      }
  } else {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, S, S);
    for (let y = 0; y < N; y++) {
      const gy = y * cs + 8;
      g.fillStyle = '#e9e2da';
      g.fillRect(0, gy + 17, S, 3);
      for (let x = 0; x < N; x++) {
        const gx = x * cs + 2;
        const gr = g.createLinearGradient(0, gy, 0, gy + 15);
        gr.addColorStop(0, '#4f7896');
        gr.addColorStop(1, '#1f3348');
        g.fillStyle = gr;
        g.fillRect(gx, gy, cs - 4, 15);
        if (r() < 0.42) {
          e.g.fillStyle = lit();
          e.g.globalAlpha = 0.5 + r() * 0.5;
          e.g.fillRect(gx, gy, cs - 4, 15);
        }
      }
    }
  }
  return { map: tex(c), emissive: tex(e.c) };
}

/** 16m wide x 8m long tile of a four lane road */
export function makeRoadTexture() {
  const { c, g } = canvas(256, 128);
  g.fillStyle = '#34343b';
  g.fillRect(0, 0, 256, 128);
  noise(g, 256, 128, 2600, 0.05, 11);
  g.fillStyle = '#e8b530';
  g.fillRect(124, 0, 2.5, 128);
  g.fillRect(130, 0, 2.5, 128);
  g.fillStyle = 'rgba(240,240,240,0.85)';
  g.fillRect(71, 0, 2.5, 60);
  g.fillRect(183, 0, 2.5, 60);
  g.fillStyle = 'rgba(240,240,240,0.5)';
  g.fillRect(5, 0, 2, 128);
  g.fillRect(249, 0, 2, 128);
  const t = tex(c);
  t.anisotropy = 8;
  return t;
}
export function makeZebraTexture() {
  const { c, g } = canvas(256, 64);
  g.fillStyle = '#34343b';
  g.fillRect(0, 0, 256, 64);
  noise(g, 256, 64, 1300, 0.05, 12);
  g.fillStyle = 'rgba(240,240,240,0.88)';
  for (let x = 6; x < 250; x += 20) g.fillRect(x, 8, 10, 48);
  const t = tex(c);
  t.anisotropy = 8;
  return t;
}
export function makeAsphaltTexture() {
  const { c, g } = canvas(128, 128);
  g.fillStyle = '#34343b';
  g.fillRect(0, 0, 128, 128);
  noise(g, 128, 128, 2600, 0.05, 13);
  return tex(c);
}
export function makeSidewalkTexture() {
  const { c, g } = canvas(128, 128);
  g.fillStyle = '#d9c9c2';
  g.fillRect(0, 0, 128, 128);
  noise(g, 128, 128, 1800, 0.05, 14);
  g.strokeStyle = 'rgba(120,95,95,0.45)';
  g.lineWidth = 2;
  for (let i = 0; i <= 128; i += 64) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.moveTo(0, i);
    g.lineTo(128, i);
    g.stroke();
  }
  return tex(c);
}
export function makeSandTexture() {
  const { c, g } = canvas(128, 128);
  g.fillStyle = '#e2c98e';
  g.fillRect(0, 0, 128, 128);
  noise(g, 128, 128, 5000, 0.06, 15);
  return tex(c);
}
export function makeGrassTexture() {
  const { c, g } = canvas(128, 128);
  g.fillStyle = '#4fae52';
  g.fillRect(0, 0, 128, 128);
  noise(g, 128, 128, 5000, 0.07, 16);
  return tex(c);
}

export function makeSignTexture(text: string, color: string, script: boolean) {
  const { c, g } = canvas(512, 128);
  g.clearRect(0, 0, 512, 128);
  g.fillStyle = 'rgba(10,6,22,0.72)';
  g.beginPath();
  g.roundRect(4, 4, 504, 120, 16);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.shadowColor = color;
  g.shadowBlur = 14;
  g.beginPath();
  g.roundRect(10, 10, 492, 108, 12);
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = script ? 'italic 700 78px "Brush Script MT", "Segoe Script", cursive' : '900 70px "Arial Black", Impact, sans-serif';
  let size = script ? 78 : 70;
  while (g.measureText(text).width > 450 && size > 20) {
    size -= 4;
    g.font = script ? `italic 700 ${size}px "Brush Script MT", "Segoe Script", cursive` : `900 ${size}px "Arial Black", Impact, sans-serif`;
  }
  g.shadowBlur = 22;
  g.fillStyle = color;
  g.fillText(text, 256, 68);
  g.shadowBlur = 6;
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillText(text, 256, 68);
  return tex(c, false);
}

export function makeGlowTexture() {
  const { c, g } = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return tex(c, false);
}
