import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import type { Input } from "../game/input";
import type { HudState } from "../game/config";

interface BtnProps {
  input: Input;
  hold?: string;
  action?: string;
  right: number;
  bottom: number;
  size: number;
  tone?: "pink" | "cyan" | "red" | "plain" | "yellow";
  children: ReactNode;
}
const TONES = {
  pink: "border-[#ff7ac8] bg-[#ff4fa3]/35",
  cyan: "border-[#7df0e8] bg-[#27e0d6]/30",
  red: "border-[#ff8a8a] bg-[#ff4040]/35",
  yellow: "border-[#ffe58a] bg-[#ffd23f]/30",
  plain: "border-white/45 bg-white/15",
};
function Btn({ input, hold, action, right, bottom, size, tone = "plain", children }: BtnProps) {
  const [down, setDown] = useState(false);
  const press = (e: RPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setDown(true);
    if (hold) input.touchBtn[hold] = true;
    if (action) input.press(action);
    if (navigator.vibrate) navigator.vibrate(8);
  };
  const release = (e: RPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDown(false);
    if (hold) input.touchBtn[hold] = false;
  };
  return (
    <button
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      className={`pointer-events-auto absolute flex touch-none items-center justify-center rounded-full border-2 font-hud text-white backdrop-blur-[2px] transition-transform ${TONES[tone]} ${down ? "scale-90 brightness-150" : ""}`}
      style={{
        right: `calc(${right}px + env(safe-area-inset-right))`,
        bottom: `calc(${bottom}px + env(safe-area-inset-bottom))`,
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.2),
        textShadow: "1px 1px 0 #000",
      }}
    >
      {children}
    </button>
  );
}

export function TouchControls({ input, hud }: { input: Input; hud: HudState }) {
  const [joy, setJoy] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const joyId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });
  const R = 56;

  const joyDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (joyId.current !== null) return;
    joyId.current = e.pointerId;
    origin.current = { x: e.clientX, y: e.clientY };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setJoy({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
  };
  const joyMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyId.current) return;
    let dx = (e.clientX - origin.current.x) / R;
    let dy = (e.clientY - origin.current.y) / R;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    input.joy.x = dx;
    input.joy.y = -dy;
    setJoy({ x: origin.current.x, y: origin.current.y, dx, dy });
  };
  const joyUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyId.current) return;
    joyId.current = null;
    input.joy.x = 0;
    input.joy.y = 0;
    setJoy(null);
  };
  const lookDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (lookId.current !== null) return;
    lookId.current = e.pointerId;
    lookLast.current = { x: e.clientX, y: e.clientY };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const lookMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== lookId.current) return;
    input.addLook((e.clientX - lookLast.current.x) * 0.0065, (e.clientY - lookLast.current.y) * 0.005);
    lookLast.current = { x: e.clientX, y: e.clientY };
  };
  const lookUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId === lookId.current) lookId.current = null;
  };

  const car = hud.inVehicle;
  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* camera drag zone */}
      <div className="pointer-events-auto absolute bottom-0 right-0 top-[18%] w-[56%] touch-none" onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookUp} onPointerCancel={lookUp} />
      {/* movement stick zone */}
      <div className="pointer-events-auto absolute bottom-0 left-0 top-[34%] w-[44%] touch-none" onPointerDown={joyDown} onPointerMove={joyMove} onPointerUp={joyUp} onPointerCancel={joyUp} />
      {/* stick visual */}
      {joy ? (
        <div className="absolute" style={{ left: joy.x - R, top: joy.y - R, width: R * 2, height: R * 2 }}>
          <div className="absolute inset-0 rounded-full border-2 border-white/40 bg-white/10" />
          <div className="absolute h-[52px] w-[52px] rounded-full border-2 border-[#ff7ac8] bg-[#ff4fa3]/50" style={{ left: R - 26 + joy.dx * R * 0.8, top: R - 26 + joy.dy * R * 0.8 }} />
        </div>
      ) : (
        <div className="absolute rounded-full border-2 border-dashed border-white/25 bg-white/5" style={{ left: "calc(34px + env(safe-area-inset-left))", bottom: "calc(30px + env(safe-area-inset-bottom))", width: R * 2, height: R * 2 }}>
          <div className="absolute left-1/2 top-1/2 h-[46px] w-[46px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35 bg-white/15" />
        </div>
      )}

      {car ? (
        <>
          <Btn input={input} hold="gas" right={18} bottom={22} size={86} tone="cyan">GAS</Btn>
          <Btn input={input} hold="brake" right={114} bottom={18} size={68} tone="red">BRAKE</Btn>
          <Btn input={input} hold="handbrake" right={108} bottom={96} size={52}>DRIFT</Btn>
          <Btn input={input} action="enter" right={22} bottom={120} size={56} tone="pink">EXIT</Btn>
          <Btn input={input} hold="horn" right={14} bottom={188} size={46}>HORN</Btn>
          <Btn input={input} action="radio" right={68} bottom={182} size={46} tone="yellow">RADIO</Btn>
          {hud.isTaxi && <Btn input={input} action="mission" right={122} bottom={166} size={50} tone="yellow">TAXI</Btn>}
        </>
      ) : (
        <>
          <Btn input={input} hold="fire" right={18} bottom={24} size={84} tone="red">{hud.weapon === "fist" ? "PUNCH" : "FIRE"}</Btn>
          <Btn input={input} hold="sprint" right={112} bottom={20} size={60} tone="cyan">RUN</Btn>
          <Btn input={input} hold="jump" right={104} bottom={92} size={54}>JUMP</Btn>
          <Btn input={input} action="nextWeapon" right={24} bottom={120} size={52} tone="yellow">WPN</Btn>
          {hud.canEnter && <Btn input={input} action="enter" right={20} bottom={184} size={62} tone="pink">DRIVE</Btn>}
        </>
      )}
    </div>
  );
}
