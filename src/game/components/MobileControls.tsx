"use client";

import React, { memo, useRef, useState } from "react";
import { Zap, Car, Crosshair, Radio } from "lucide-react";
import type { InputState } from "../input/inputState";

interface MobileControlsProps {
  input: InputState;
  inVehicle: boolean;
  canInteract: boolean;
}

const buzz = (ms = 10) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
};

interface PadButtonProps {
  style: React.CSSProperties;
  className: string;
  onDown?: () => void;
  onUp?: () => void;
  onMove?: (dx: number, dy: number) => void;
  children: React.ReactNode;
}

/** Multi-touch safe button (pointer events + capture). Optional drag -> onMove (used on FIRE to aim). */
const PadButton = memo(function PadButton({ style, className, onDown, onUp, onMove, children }: PadButtonProps) {
  const [pressed, setPressed] = useState(false);
  const idRef = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });

  return (
    <button
      type="button"
      style={{ ...style, touchAction: "none", WebkitTapHighlightColor: "transparent" }}
      className={`${className} absolute flex select-none flex-col items-center justify-center rounded-full border-2 font-black leading-none shadow-lg ${
        pressed ? "scale-90 brightness-150" : ""
      }`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (idRef.current !== null) return;
        idRef.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = { x: e.clientX, y: e.clientY };
        setPressed(true);
        onDown?.();
      }}
      onPointerMove={(e) => {
        if (idRef.current !== e.pointerId || !onMove) return;
        onMove(e.clientX - last.current.x, e.clientY - last.current.y);
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (idRef.current !== e.pointerId) return;
        idRef.current = null;
        setPressed(false);
        onUp?.();
      }}
      onPointerCancel={(e) => {
        if (idRef.current !== e.pointerId) return;
        idRef.current = null;
        setPressed(false);
        onUp?.();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
});

const R = 54; // joystick radius in px

const MobileControlsInner: React.FC<MobileControlsProps> = ({ input, inVehicle, canInteract }) => {
  // ---- camera look pad (whole screen, below everything else) ----
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });

  // ---- floating joystick ----
  const stickId = useRef<number | null>(null);
  const stickOrigin = useRef({ x: 0, y: 0 });
  const baseRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);

  const setStick = (clientX: number, clientY: number) => {
    let dx = clientX - stickOrigin.current.x;
    let dy = clientY - stickOrigin.current.y;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    input.moveX = dx / R;
    input.moveY = -dy / R;
  };

  const endStick = () => {
    stickId.current = null;
    input.moveX = 0;
    input.moveY = 0;
    if (baseRef.current) baseRef.current.style.display = "none";
    if (ghostRef.current) ghostRef.current.style.display = "block";
  };

  const side = "calc(env(safe-area-inset-right) + 14px)";
  const bottom = (n: number) => `calc(env(safe-area-inset-bottom) + ${n}px)`;
  const right = (n: number) => `calc(env(safe-area-inset-right) + ${n}px)`;

  return (
    <div className="absolute inset-0 z-20 select-none overflow-hidden" style={{ touchAction: "none" }}>
      {/* LOOK PAD */}
      <div
        className="absolute inset-0"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          if (lookId.current !== null) return;
          lookId.current = e.pointerId;
          lookLast.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (lookId.current !== e.pointerId) return;
          input.lookDX += e.clientX - lookLast.current.x;
          input.lookDY += e.clientY - lookLast.current.y;
          lookLast.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          if (lookId.current === e.pointerId) lookId.current = null;
        }}
        onPointerCancel={(e) => {
          if (lookId.current === e.pointerId) lookId.current = null;
        }}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* JOYSTICK ZONE (left side) */}
      <div
        className="absolute bottom-0 left-0"
        style={{ width: "42%", height: "72%", touchAction: "none" }}
        onPointerDown={(e) => {
          if (stickId.current !== null) return;
          e.preventDefault();
          stickId.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          const rect = e.currentTarget.getBoundingClientRect();
          stickOrigin.current = { x: e.clientX, y: e.clientY };
          if (baseRef.current) {
            baseRef.current.style.display = "block";
            baseRef.current.style.transform = `translate(${e.clientX - rect.left - 64}px, ${e.clientY - rect.top - 64}px)`;
          }
          if (ghostRef.current) ghostRef.current.style.display = "none";
          if (knobRef.current) knobRef.current.style.transform = "translate(0px, 0px)";
        }}
        onPointerMove={(e) => {
          if (stickId.current === e.pointerId) setStick(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (stickId.current === e.pointerId) endStick();
        }}
        onPointerCancel={(e) => {
          if (stickId.current === e.pointerId) endStick();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* idle hint */}
        <div
          ref={ghostRef}
          className="pointer-events-none absolute rounded-full border-2 border-white/25 bg-white/5"
          style={{ left: "calc(env(safe-area-inset-left) + 28px)", bottom: 28, width: 120, height: 120 }}
        />
        {/* active stick */}
        <div
          ref={baseRef}
          className="pointer-events-none absolute left-0 top-0 hidden rounded-full border-2 border-white/40 bg-white/10"
          style={{ width: 128, height: 128 }}
        >
          <div
            ref={knobRef}
            className="absolute rounded-full border border-white/60 bg-white/40"
            style={{ left: 38, top: 38, width: 52, height: 52 }}
          />
        </div>
      </div>

      {/* ---------------- RIGHT SIDE BUTTONS ---------------- */}
      {!inVehicle ? (
        <>
          <PadButton
            style={{ right: side, bottom: bottom(18), width: 84, height: 84 }}
            className="border-rose-300 bg-rose-600/80 text-white"
            onDown={() => (input.fire = true)}
            onUp={() => (input.fire = false)}
            onMove={(dx, dy) => {
              input.lookDX += dx;
              input.lookDY += dy;
            }}
          >
            <Crosshair className="h-8 w-8" />
          </PadButton>

          <PadButton
            style={{ right: right(112), bottom: bottom(26), width: 62, height: 62 }}
            className="border-sky-300 bg-sky-600/80 text-[11px] text-white"
            onDown={() => {
              input.jumpQueued = true;
              buzz();
            }}
          >
            ZIPLA
          </PadButton>

          <PadButton
            style={{ right: side, bottom: bottom(116), width: 58, height: 58 }}
            className="border-yellow-300 bg-yellow-600/80 text-[10px] text-white"
            onDown={() => (input.sprint = true)}
            onUp={() => (input.sprint = false)}
          >
            <Zap className="h-5 w-5" />
            KOŞ
          </PadButton>

          <PadButton
            style={{ right: right(96), bottom: bottom(100), width: 64, height: 64 }}
            className={`text-[10px] ${
              canInteract
                ? "animate-pulse border-amber-200 bg-amber-500 text-black"
                : "border-white/30 bg-black/50 text-white/60"
            }`}
            onDown={() => {
              input.interactQueued = true;
              buzz(15);
            }}
          >
            <Car className="h-5 w-5" />
            BİN/İŞLEM
          </PadButton>

          <PadButton
            style={{ right: right(184), bottom: bottom(40), width: 48, height: 48 }}
            className="border-white/30 bg-black/55 text-[9px] text-white"
            onDown={() => {
              input.weaponQueued = true;
              buzz();
            }}
          >
            SİLAH
          </PadButton>
        </>
      ) : (
        <>
          <PadButton
            style={{ right: side, bottom: bottom(18), width: 88, height: 88 }}
            className="border-emerald-200 bg-emerald-600/85 text-sm text-white"
            onDown={() => (input.gas = true)}
            onUp={() => (input.gas = false)}
          >
            GAZ
          </PadButton>

          <PadButton
            style={{ right: right(118), bottom: bottom(20), width: 70, height: 70 }}
            className="border-rose-200 bg-rose-600/85 text-xs text-white"
            onDown={() => (input.brake = true)}
            onUp={() => (input.brake = false)}
          >
            FREN
            <span className="mt-0.5 text-[8px] font-bold opacity-80">GERİ</span>
          </PadButton>

          <PadButton
            style={{ right: side, bottom: bottom(116), width: 58, height: 58 }}
            className="border-orange-200 bg-orange-600/85 text-[9px] text-white"
            onDown={() => (input.handbrake = true)}
            onUp={() => (input.handbrake = false)}
          >
            EL
            <br />
            FRENİ
          </PadButton>

          <PadButton
            style={{ right: right(96), bottom: bottom(100), width: 60, height: 60 }}
            className="border-amber-200 bg-amber-500 text-[10px] text-black"
            onDown={() => {
              input.interactQueued = true;
              buzz(15);
            }}
          >
            <Car className="h-5 w-5" />
            İN
          </PadButton>

          <PadButton
            style={{ right: right(170), bottom: bottom(104), width: 46, height: 46 }}
            className="border-white/30 bg-black/55 text-[9px] text-white"
            onDown={() => (input.hornQueued = true)}
          >
            KORNA
          </PadButton>
          <PadButton
            style={{ right: right(222), bottom: bottom(104), width: 46, height: 46 }}
            className="border-white/30 bg-black/55 text-[9px] text-white"
            onDown={() => (input.lightsQueued = true)}
          >
            FAR
          </PadButton>
          <PadButton
            style={{ right: right(274), bottom: bottom(104), width: 46, height: 46 }}
            className="border-white/30 bg-black/55 text-white"
            onDown={() => (input.radioQueued = true)}
          >
            <Radio className="h-5 w-5" />
          </PadButton>
        </>
      )}
    </div>
  );
};

export const MobileControls = memo(MobileControlsInner);
