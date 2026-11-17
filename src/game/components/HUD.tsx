"use client";

import React, { useEffect, useRef } from "react";
import { Heart, Shield, Maximize2, Minimize2, Volume2, VolumeX, Menu, Camera, Award } from "lucide-react";
import { ActiveMission } from "../systems/missionSystem";

interface HUDProps {
  health: number;
  armor: number;
  cash: number;
  cashDelta: number | null;
  wantedStars: number;
  isCoolingDown: boolean;
  currentWeapon: string;
  ammoText: string;
  inVehicle: boolean;
  vehicleSpeedKmh: number;
  vehicleHealth: number;
  vehicleMaxHealth: number;
  vehicleName: string;
  radioStationName: string;
  interactionHint: string | null;
  toast: string | null;
  mission: ActiveMission | null;
  missionTimer: number | null;
  playerPos: { x: number; z: number };
  playerHeading: number;
  policePositions: { x: number; z: number }[];
  isWasted: boolean;
  missionPassedBanner: { title: string; reward: number } | null;
  isFullscreen: boolean;
  isMuted: boolean;
  onToggleFullscreen: () => void;
  onToggleMute: () => void;
  onOpenPauseMenu: () => void;
  onChangeCamera: () => void;
  onHintTap: () => void;
}

const MAP = 104; // minimap size (css px)

const iconBtn =
  "pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-black/70 text-white active:bg-white/30";

export const HUD: React.FC<HUDProps> = ({
  health,
  armor,
  cash,
  cashDelta,
  wantedStars,
  isCoolingDown,
  currentWeapon,
  ammoText,
  inVehicle,
  vehicleSpeedKmh,
  vehicleHealth,
  vehicleMaxHealth,
  vehicleName,
  radioStationName,
  interactionHint,
  toast,
  mission,
  missionTimer,
  playerPos,
  playerHeading,
  policePositions,
  isWasted,
  missionPassedBanner,
  isFullscreen,
  isMuted,
  onToggleFullscreen,
  onToggleMute,
  onOpenPauseMenu,
  onChangeCamera,
  onHintTap,
}) => {
  const mapRef = useRef<HTMLCanvasElement | null>(null);
  const blink = useRef(0);

  useEffect(() => {
    const canvas = mapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = MAP;
    canvas.height = MAP;
    const c = MAP / 2;
    const scale = 0.42; // px per world meter
    blink.current++;

    ctx.clearRect(0, 0, MAP, MAP);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(10,15,25,0.9)";
    ctx.fillRect(0, 0, MAP, MAP);

    // rotate so the view direction points UP (world +z is down on the canvas)
    ctx.translate(c, c);
    ctx.rotate(playerHeading - Math.PI);

    ctx.fillStyle = "rgba(2,132,199,0.5)";
    ctx.fillRect((-220 - playerPos.x) * scale - 300, -400, 300, 800);

    ctx.strokeStyle = "rgba(226,232,240,0.35)";
    ctx.lineWidth = 4;
    [-130, -50, 40, 130, 210].forEach((x) => {
      const rx = (x - playerPos.x) * scale;
      ctx.beginPath();
      ctx.moveTo(rx, -300);
      ctx.lineTo(rx, 300);
      ctx.stroke();
    });
    [-220, -110, 0, 110, 220].forEach((z) => {
      const rz = (z - playerPos.z) * scale;
      ctx.beginPath();
      ctx.moveTo(-300, rz);
      ctx.lineTo(300, rz);
      ctx.stroke();
    });

    const dot = (wx: number, wz: number, color: string, r: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc((wx - playerPos.x) * scale, (wz - playerPos.z) * scale, r, 0, Math.PI * 2);
      ctx.fill();
    };
    dot(85, 153, "#ef4444", 3.5);
    dot(85, -153, "#10b981", 3.5);
    dot(-5, -151, "#f59e0b", 4);

    const step = mission?.steps[mission.currentStepIndex]?.targetPos;
    if (step) dot(step.x, step.z, "#fbbf24", 5);
    policePositions.forEach((p, i) => dot(p.x, p.z, (blink.current + i) % 2 ? "#ef4444" : "#3b82f6", 4));
    ctx.restore();

    ctx.save();
    ctx.translate(c, c);
    ctx.fillStyle = inVehicle ? "#38bdf8" : "#ffffff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c, c, c - 1, 0, Math.PI * 2);
    ctx.stroke();
  }, [playerPos, playerHeading, policePositions, mission, inVehicle]);

  const pct = (v: number, m: number) => `${Math.max(0, Math.min(100, (v / m) * 100))}%`;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 select-none overflow-hidden font-sans"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 6px)",
        paddingRight: "calc(env(safe-area-inset-right) + 10px)",
        paddingLeft: "calc(env(safe-area-inset-left) + 10px)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* TOP LEFT: minimap + bars + system buttons */}
      <div className="absolute flex items-start gap-2" style={{ top: "calc(env(safe-area-inset-top) + 6px)", left: "calc(env(safe-area-inset-left) + 10px)" }}>
        <div className="overflow-hidden rounded-full border border-white/25 bg-black/50" style={{ width: MAP, height: MAP }}>
          <canvas ref={mapRef} className="block" style={{ width: MAP, height: MAP }} />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="w-[116px] rounded-lg border border-white/15 bg-black/70 p-1.5">
            <div className="flex items-center gap-1">
              <Heart className="h-3 w-3 shrink-0 text-emerald-400" />
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
                <div className="h-full bg-emerald-500" style={{ width: pct(health, 100) }} />
              </div>
              <span className="w-6 text-right font-mono text-[9px] font-bold text-emerald-400">{health}</span>
            </div>
            <div className="mt-1 flex items-center gap-1">
              <Shield className="h-3 w-3 shrink-0 text-sky-400" />
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
                <div className="h-full bg-sky-500" style={{ width: pct(armor, 100) }} />
              </div>
              <span className="w-6 text-right font-mono text-[9px] font-bold text-sky-400">{armor}</span>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button type="button" className={iconBtn} onPointerDown={onOpenPauseMenu} aria-label="Menü">
              <Menu className="h-4 w-4" />
            </button>
            <button type="button" className={iconBtn} onPointerDown={onToggleMute} aria-label="Ses">
              {isMuted ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button type="button" className={iconBtn} onPointerDown={onChangeCamera} aria-label="Kamera">
              <Camera className="h-4 w-4 text-sky-400" />
            </button>
            <button type="button" className={iconBtn} onPointerDown={onToggleFullscreen} aria-label="Tam ekran">
              {isFullscreen ? <Minimize2 className="h-4 w-4 text-amber-400" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* TOP RIGHT: stars, cash, weapon */}
      <div className="absolute flex flex-col items-end gap-1" style={{ top: "calc(env(safe-area-inset-top) + 6px)", right: "calc(env(safe-area-inset-right) + 10px)" }}>
        <div className="flex items-center gap-0.5 rounded-lg border border-white/15 bg-black/70 px-2 py-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={`text-base ${
                i <= wantedStars ? (isCoolingDown ? "text-amber-400" : "text-red-500") : "text-neutral-700"
              }`}
            >
              ★
            </span>
          ))}
        </div>
        <div className="font-mono text-xl font-black text-emerald-400" style={{ textShadow: "0 1px 4px #000" }}>
          ${cash.toLocaleString()}
        </div>
        {cashDelta !== null && (
          <div className={`font-mono text-xs font-bold ${cashDelta > 0 ? "text-emerald-300" : "text-rose-400"}`}>
            {cashDelta > 0 ? "+" : "-"}${Math.abs(cashDelta).toLocaleString()}
          </div>
        )}
        {!inVehicle && (
          <div className="rounded-lg border border-white/20 bg-black/75 px-2 py-1 text-right font-mono">
            <div className="text-[10px] font-bold uppercase text-amber-400">{currentWeapon}</div>
            <div className="text-xs font-extrabold text-white">{ammoText}</div>
          </div>
        )}
      </div>

      {/* TOP CENTER: mission + toast */}
      <div className="absolute left-1/2 flex max-w-[34%] -translate-x-1/2 flex-col items-center gap-1" style={{ top: "calc(env(safe-area-inset-top) + 6px)" }}>
        {mission && (
          <div className="w-full rounded-xl border-l-4 border-amber-500 bg-black/75 p-2">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-amber-400">
              <span className="flex items-center gap-1">
                <Award className="h-3 w-3" /> {mission.title}
              </span>
              {missionTimer !== null && <span className="font-mono text-rose-400">⏱ {missionTimer}s</span>}
            </div>
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/90">
              {mission.steps[mission.currentStepIndex]?.text}
            </p>
          </div>
        )}
        {toast && (
          <div className="rounded-lg border border-amber-500/50 bg-black/80 px-2.5 py-1 text-center text-[11px] font-bold text-amber-300">
            {toast}
          </div>
        )}
      </div>

      {/* CROSSHAIR */}
      {!inVehicle && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-70">
          <div className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_4px_black]" />
        </div>
      )}

      {/* BOTTOM CENTER: interaction hint (tappable) + speedometer */}
      <div className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-1" style={{ bottom: "calc(env(safe-area-inset-bottom) + 8px)" }}>
        {interactionHint && (
          <button
            type="button"
            onPointerDown={onHintTap}
            className="pointer-events-auto rounded-full border border-amber-500/60 bg-black/85 px-3 py-1.5 text-[11px] font-black text-amber-300 active:bg-amber-500 active:text-black"
          >
            {interactionHint}
          </button>
        )}
        {inVehicle && (
          <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-black/75 px-3 py-1.5">
            <div className="text-center font-mono leading-none">
              <div className="text-2xl font-black text-white">{Math.round(vehicleSpeedKmh)}</div>
              <div className="text-[8px] font-bold tracking-widest text-neutral-400">KM/H</div>
            </div>
            <div className="w-24">
              <div className="truncate text-[10px] font-bold text-amber-400">{vehicleName}</div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className={vehicleHealth > vehicleMaxHealth / 2 ? "h-full bg-emerald-500" : vehicleHealth > vehicleMaxHealth / 4 ? "h-full bg-amber-500" : "h-full bg-red-500"}
                  style={{ width: pct(vehicleHealth, vehicleMaxHealth) }}
                />
              </div>
              {radioStationName && radioStationName !== "Radio Off" && (
                <div className="mt-0.5 truncate text-[8px] text-purple-300">♪ {radioStationName}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {isWasted && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/75">
          <div className="font-serif text-6xl font-black tracking-widest text-rose-600">WASTED</div>
          <div className="mt-2 text-xs font-semibold text-neutral-300">Yeniden doğuyorsunuz...</div>
        </div>
      )}

      {missionPassedBanner && (
        <div className="absolute left-1/2 top-1/3 z-50 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-amber-500 bg-black/90 px-6 py-3 text-center">
          <div className="text-2xl font-black tracking-wider text-amber-400">GÖREV TAMAMLANDI!</div>
          <div className="mt-1 text-sm font-bold text-white">{missionPassedBanner.title}</div>
          <div className="mt-1 font-mono text-xl font-black text-emerald-400">
            + ${missionPassedBanner.reward.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
};
