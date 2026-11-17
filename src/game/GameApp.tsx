"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { Play, Crosshair, Car, Zap } from "lucide-react";
import { soundManager } from "./audio/soundManager";

// The 3D engine (three.js + city) is only downloaded after the player taps PLAY -> instant first paint on phones.
const GameCanvas = dynamic(() => import("./components/GameCanvas").then((m) => m.GameCanvas), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-black text-sm font-bold text-amber-400">
      Şehir yükleniyor...
    </div>
  ),
});

export const GameApp: React.FC = () => {
  const [started, setStarted] = useState(false);

  const start = async () => {
    // Must run inside the tap handler (user gesture) for fullscreen / orientation lock / audio.
    soundManager.resume();
    try {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      const o = screen.orientation as unknown as { lock?: (o: string) => Promise<void> };
      await o.lock?.("landscape");
    } catch {
      /* iOS / unsupported: the game still works, a rotate hint is shown in portrait */
    }
    setStarted(true);
  };

  if (started) return <GameCanvas />;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden bg-neutral-950 text-white"
      style={{
        background: "radial-gradient(circle at 50% 20%, #431407 0%, #09090b 70%)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div className="flex w-full max-w-3xl flex-col items-center gap-3 px-4 text-center">
        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Vice Metropolis • Mobil Sürüm</div>
        <h1 className="font-serif text-4xl font-black italic uppercase tracking-tight text-amber-400 sm:text-5xl">
          VICE METROPOLIS 3D
        </h1>

        <button
          type="button"
          onPointerDown={start}
          className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 px-8 py-4 text-base font-black uppercase tracking-wider text-black shadow-[0_0_30px_rgba(245,158,11,0.5)] active:scale-95"
        >
          <Play className="h-6 w-6 fill-black" />
          Tam Ekran Oyna
        </button>
        <p className="text-[11px] text-neutral-400">Otomatik tam ekran + yatay mod. En iyi sonuç için Chrome kullanın.</p>

        <div className="mt-1 grid w-full grid-cols-3 gap-2 text-left text-[11px]">
          <div className="rounded-xl border border-white/10 bg-black/50 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 font-bold text-amber-400">
              <Zap className="h-3.5 w-3.5" /> Yürüme
            </div>
            Sol başparmak: joystick. Ekranın boşluğunu sürükle: kamera. KOŞ / ZIPLA butonları.
          </div>
          <div className="rounded-xl border border-white/10 bg-black/50 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 font-bold text-rose-400">
              <Crosshair className="h-3.5 w-3.5" /> Savaş
            </div>
            Ateş butonuna basılı tut. Parmağını kaydırarak nişan al. SİLAH ile silah değiştir.
          </div>
          <div className="rounded-xl border border-white/10 bg-black/50 p-2.5">
            <div className="mb-1 flex items-center gap-1.5 font-bold text-emerald-400">
              <Car className="h-3.5 w-3.5" /> Araç
            </div>
            Arabaya yaklaş, BİN butonuna bas. Joystick: direksiyon. GAZ / FREN / EL FRENİ butonları.
          </div>
        </div>
      </div>
    </div>
  );
};
