import * as THREE from "three";

export class TextureGenerator {
  private static cache: Map<string, THREE.CanvasTexture> = new Map();

  // --- ROAD TEXTURE WITH 4 LANES & MARKINGS ---
  public static createRoadTexture(): THREE.CanvasTexture {
    const key = "road_texture";
    if (this.cache.has(key)) return this.cache.get(key)!;

    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    // Dark asphalt base with subtle aggregate noise
    ctx.fillStyle = "#202226";
    ctx.fillRect(0, 0, size, size);

    // Aggregate speckles (cheap: no per-pixel getImageData loop that froze phones at startup)
    for (let i = 0; i < 2200; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.14)";
      ctx.fillRect(Math.random() * size, Math.random() * size, 3, 3);
    }

    // Double yellow center line
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(size / 2 - 8, 0, 4, size);
    ctx.fillRect(size / 2 + 4, 0, 4, size);

    // White dashed lane divider (left side)
    ctx.fillStyle = "rgba(240, 240, 245, 0.9)";
    const dashLength = 60;
    const gapLength = 40;
    for (let y = 0; y < size; y += dashLength + gapLength) {
      ctx.fillRect(size * 0.25 - 3, y, 6, dashLength);
    }

    // White dashed lane divider (right side)
    for (let y = 0; y < size; y += dashLength + gapLength) {
      ctx.fillRect(size * 0.75 - 3, y, 6, dashLength);
    }

    // Solid white edge lines near sidewalks
    ctx.fillStyle = "rgba(230, 230, 240, 0.85)";
    ctx.fillRect(20, 0, 6, size);
    ctx.fillRect(size - 26, 0, 6, size);

    // Subtle tire skid mark streaks
    ctx.fillStyle = "rgba(10, 10, 12, 0.15)";
    ctx.fillRect(size * 0.2, 0, 22, size);
    ctx.fillRect(size * 0.3, 0, 22, size);
    ctx.fillRect(size * 0.7, 0, 22, size);
    ctx.fillRect(size * 0.8, 0, 22, size);

    // Downscale to 512 for mobile GPUs (4x less texture memory/bandwidth)
    const small = document.createElement("canvas");
    small.width = 512;
    small.height = 512;
    small.getContext("2d")!.drawImage(canvas, 0, 0, 512, 512);

    const texture = new THREE.CanvasTexture(small);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 2;
    this.cache.set(key, texture);
    return texture;
  }

  // --- CROSSWALK / INTERSECTION ROAD TEXTURE ---
  public static createCrosswalkTexture(): THREE.CanvasTexture {
    const key = "crosswalk_texture";
    if (this.cache.has(key)) return this.cache.get(key)!;

    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#22252a";
    ctx.fillRect(0, 0, size, size);

    // Thick white zebra stripes
    ctx.fillStyle = "rgba(245, 245, 250, 0.92)";
    const stripeCount = 8;
    const stripeWidth = size / (stripeCount * 2);
    for (let i = 0; i < stripeCount; i++) {
      ctx.fillRect(i * stripeWidth * 2 + 10, 30, stripeWidth, size - 60);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.cache.set(key, texture);
    return texture;
  }

  // --- SIDEWALK PAVEMENT TEXTURE ---
  public static createSidewalkTexture(): THREE.CanvasTexture {
    const key = "sidewalk_texture";
    if (this.cache.has(key)) return this.cache.get(key)!;

    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    // Concrete light gray
    ctx.fillStyle = "#9ca3af";
    ctx.fillRect(0, 0, size, size);

    // Tile grid lines
    ctx.strokeStyle = "#4b5563";
    ctx.lineWidth = 2;
    const tileSize = 64;
    for (let x = 0; x <= size; x += tileSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    for (let y = 0; y <= size; y += tileSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.cache.set(key, texture);
    return texture;
  }

  // --- SKYSCRAPER WINDOW FACADE ---
  public static createSkyscraperTexture(hasLightsAtNight: boolean = true): THREE.CanvasTexture {
    const key = `skyscraper_${hasLightsAtNight}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    // Modern dark slate glass frame
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, size, size);

    const cols = 8;
    const rows = 16;
    const w = size / cols;
    const h = size / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Office window
        const isLit = Math.random() > 0.45;
        if (isLit) {
          const warmOrCool = Math.random() > 0.3 ? "#fef08a" : "#93c5fd";
          ctx.fillStyle = warmOrCool;
        } else {
          ctx.fillStyle = "#0f172a";
        }
        ctx.fillRect(c * w + 2, r * h + 2, w - 4, h - 4);

        // Blinds / reflection streak
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.fillRect(c * w + 2, r * h + 2, (w - 4) * 0.3, h - 4);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 3);
    this.cache.set(key, texture);
    return texture;
  }

  // --- STORE FRONT / NEON SIGNS ---
  public static createSignTexture(text: string, subText: string, color: string, bg: string): THREE.CanvasTexture {
    const key = `sign_${text}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 128);

    // Border glow
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 120);

    ctx.fillStyle = color;
    ctx.font = "bold 34px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillText(text, 256, 45);

    ctx.shadowBlur = 4;
    ctx.font = "bold 18px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(subText, 256, 92);

    const texture = new THREE.CanvasTexture(canvas);
    this.cache.set(key, texture);
    return texture;
  }

  // --- SHIPPING CONTAINER TEXTURE ---
  public static createContainerTexture(colorHex: string): THREE.CanvasTexture {
    const key = `container_${colorHex}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, 256, 128);

    // Corrugated vertical steel ribs
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    for (let x = 0; x < 256; x += 12) {
      ctx.fillRect(x, 0, 4, 128);
    }
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    for (let x = 4; x < 256; x += 12) {
      ctx.fillRect(x, 0, 3, 128);
    }

    // Logo / Stencil ID
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px monospace";
    ctx.fillText("MAERSK 40FT", 20, 30);
    ctx.fillText("MAX GROSS 30480 KG", 20, 50);

    const texture = new THREE.CanvasTexture(canvas);
    this.cache.set(key, texture);
    return texture;
  }
}
