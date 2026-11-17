import { clamp } from './config';

/** Unified keyboard / mouse / touch / gamepad input. */
export class Input {
  keys = new Set<string>();
  private pressed = new Set<string>();
  lookDX = 0;
  lookDY = 0;
  joy = { x: 0, y: 0 };
  touchBtn: Record<string, boolean> = {};
  touchMode = false;
  pointerLocked = false;
  lockFailed = false;
  private lockErrors = 0;
  mouseDown = false;
  mouseFire = false;
  lastLook = 0;
  sensitivity = 1;
  enabled = false; // true only while actually playing
  onUnlock: (() => void) | null = null;

  // derived each frame
  moveX = 0;
  moveY = 0;
  sprint = false;
  jump = false;
  fire = false;
  throttle = 0;
  brake = 0;
  handbrake = false;
  horn = false;

  private gpPrev: boolean[] = [];
  private canvas: HTMLCanvasElement;
  private off: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K | string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    const EDGE: Record<string, string> = {
      KeyF: 'enter', Enter: 'enter', KeyQ: 'prevWeapon', KeyE: 'nextWeapon', KeyR: 'radio', KeyT: 'mission',
      Escape: 'pause', KeyP: 'pause', Space: 'jump',
    };
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (!this.enabled) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat && EDGE[e.code]) this.pressed.add(EDGE[e.code]);
      this.keys.add(e.code);
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    on(window, 'blur', () => {
      this.keys.clear();
      this.mouseDown = this.mouseFire = false;
    });
    on(canvas, 'mousedown', (e: MouseEvent) => {
      if (!this.enabled || this.touchMode) return;
      this.mouseDown = true;
      if (!this.pointerLocked && !this.lockFailed) {
        this.requestLock();
        return;
      }
      if (e.button === 0) this.mouseFire = true;
    });
    on(window, 'mouseup', (e: MouseEvent) => {
      this.mouseDown = false;
      if (e.button === 0) this.mouseFire = false;
    });
    on(window, 'mousemove', (e: MouseEvent) => {
      if (!this.enabled || this.touchMode) return;
      if (this.pointerLocked || this.mouseDown) this.addLook(e.movementX * 0.0026, e.movementY * 0.0022);
    });
    on(canvas, 'wheel', (e: WheelEvent) => {
      if (!this.enabled) return;
      this.pressed.add(e.deltaY > 0 ? 'nextWeapon' : 'prevWeapon');
    }, { passive: true });
    on(canvas, 'contextmenu', (e: Event) => e.preventDefault());
    on(document, 'pointerlockchange', () => {
      const was = this.pointerLocked;
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (this.pointerLocked) this.lockErrors = 0;
      if (was && !this.pointerLocked) {
        this.mouseFire = false;
        if (this.enabled && this.onUnlock) this.onUnlock();
      }
    });
    on(document, 'pointerlockerror', () => this.lockError());
    on(window, 'touchstart', () => (this.touchMode = true), { passive: true });
  }

  requestLock() {
    if (this.touchMode || this.pointerLocked) return;
    try {
      const p = (this.canvas as any).requestPointerLock?.();
      if (p && p.catch) p.catch(() => this.lockError());
    } catch {
      this.lockError();
    }
  }
  private lockError() {
    // browsers briefly refuse to re-lock after Esc; only give up after repeated failures (e.g. sandboxed iframes)
    if (++this.lockErrors >= 4) this.lockFailed = true;
  }
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  addLook(dx: number, dy: number) {
    this.lookDX += dx * this.sensitivity;
    this.lookDY += dy * this.sensitivity;
    this.lastLook = performance.now();
  }
  press(action: string) {
    this.pressed.add(action);
  }
  consume(action: string) {
    if (this.pressed.has(action)) {
      this.pressed.delete(action);
      return true;
    }
    return false;
  }
  reset() {
    this.keys.clear();
    this.pressed.clear();
    this.lookDX = this.lookDY = 0;
    this.joy.x = this.joy.y = 0;
    this.touchBtn = {};
    this.mouseDown = this.mouseFire = false;
  }

  poll(dt: number) {
    const k = this.keys;
    const b = this.touchBtn;
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let my = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let throttle = my > 0 ? 1 : 0;
    let brake = my < 0 ? 1 : 0;
    mx += this.joy.x;
    my += this.joy.y;
    if (this.joy.y > 0.5) throttle = Math.max(throttle, this.joy.y);
    if (b.gas) throttle = 1;
    if (b.brake) brake = 1;
    let sprint = k.has('ShiftLeft') || k.has('ShiftRight') || !!b.sprint;
    let fire = this.mouseFire || k.has('ControlLeft') || k.has('KeyJ') || !!b.fire;
    let handbrake = k.has('Space') || !!b.handbrake;
    let horn = k.has('KeyH') || !!b.horn;
    let jump = !!b.jump;

    // gamepad
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let gp: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (gp && this.enabled) {
      const dz = (v: number) => (Math.abs(v) < 0.16 ? 0 : v);
      mx += dz(gp.axes[0] || 0);
      my -= dz(gp.axes[1] || 0);
      const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
      if (rx || ry) this.addLook(rx * 2.6 * dt, ry * 1.8 * dt);
      const bt = (i: number) => !!gp!.buttons[i] && (gp!.buttons[i].pressed || gp!.buttons[i].value > 0.4);
      const val = (i: number) => (gp!.buttons[i] ? gp!.buttons[i].value : 0);
      throttle = Math.max(throttle, val(7));
      brake = Math.max(brake, val(6));
      if (bt(0)) { sprint = true; handbrake = true; }
      if (bt(1) || val(7) > 0.4) fire = true;
      if (bt(10)) horn = true;
      const edges: [number, string][] = [[2, 'jump'], [3, 'enter'], [4, 'prevWeapon'], [5, 'nextWeapon'], [9, 'pause'], [12, 'radio'], [13, 'mission']];
      for (const [i, a] of edges) {
        const d = bt(i);
        if (d && !this.gpPrev[i]) this.pressed.add(a);
        this.gpPrev[i] = d;
      }
    }
    this.moveX = clamp(mx, -1, 1);
    this.moveY = clamp(my, -1, 1);
    this.throttle = clamp(throttle, 0, 1);
    this.brake = clamp(brake, 0, 1);
    this.sprint = sprint;
    this.fire = fire;
    this.handbrake = handbrake;
    this.horn = horn;
    this.jump = jump;
  }

  dispose() {
    for (const f of this.off) f();
    this.off = [];
  }
}
