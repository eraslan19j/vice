import { useEffect, useRef, useState, type ReactNode } from "react";
import type { HudState } from "../game/config";
import { WEAPONS } from "../game/config";

function useFlash(key: string | number, ms: number, skipEmpty = true) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (skipEmpty && !key) {
      setShow(false);
      return;
    }
    setShow(true);
    const t = setTimeout(() => setShow(false), ms);
    return () => clearTimeout(t);
  }, [key, ms, skipEmpty]);
  return show;
}

export function rich(text: string): ReactNode[] {
  return text.split(/(\[[^\]]+\])/g).map((part, i) =>
    part.startsWith("[") ? (
      <span key={i} className="text-[#ff6fb5]">
        {part.slice(1, -1)}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function WeaponIcon({ id }: { id: string }) {
  const common = { fill: "#f4f4f4", stroke: "#000", strokeWidth: 2.5, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 64 44" className="h-full w-full">
      {id === "fist" && (
        <g {...common}>
          <rect x="16" y="12" width="30" height="24" rx="6" />
          <rect x="18" y="6" width="7" height="12" rx="3" />
          <rect x="25" y="5" width="7" height="12" rx="3" />
          <rect x="32" y="6" width="7" height="12" rx="3" />
          <rect x="39" y="8" width="7" height="12" rx="3" />
          <rect x="10" y="18" width="12" height="9" rx="4" />
        </g>
      )}
      {id === "pistol" && <path {...common} d="M10 10h44v9H34l-2 6h-8l-3 14H10l3-20h-3z" />}
      {id === "smg" && <path {...common} d="M4 12h38v-4h6v4h12v7H44v14h-8V19h-8l-3 14h-9l3-14H4z" />}
      {id === "shotgun" && <path {...common} d="M2 14h60v6H38l-2 6h-8l-1-4H16L8 36H1l5-20H2z" />}
    </svg>
  );
}

interface Props {
  hud: HudState;
  touch: boolean;
  onPause: () => void;
  onFullscreen: () => void;
  mapRef: (c: HTMLCanvasElement | null) => void;
}

export function Hud({ hud, touch, onPause, onFullscreen, mapRef }: Props) {
  const zoneShow = useFlash(hud.zone, 3600);
  const vehShow = useFlash(hud.vehicle, 3600);
  const radioShow = useFlash(hud.radioTick, 3000) && hud.inVehicle;
  const lastVeh = useRef("");
  if (hud.vehicle) lastVeh.current = hud.vehicle;
  const money = "$" + String(Math.max(0, Math.floor(hud.money))).padStart(8, "0");
  const w = WEAPONS[hud.weapon];

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-hud text-white safe-pad">
      {/* top-right status block */}
      <div className="absolute right-[max(12px,env(safe-area-inset-right))] top-[max(10px,env(safe-area-inset-top))] flex items-start gap-2">
        <div className="flex flex-col items-end leading-none">
          <div className="ol text-[22px] sm:text-[30px] tracking-wider">{hud.clock}</div>
          <div className="ol mt-1 text-[20px] sm:text-[28px] tracking-wider text-[#3fdc74]">{money}</div>
          <div className="ol mt-1 flex items-center gap-3 text-[18px] sm:text-[26px]">
            {hud.armor > 0 && (
              <span className="text-[#6fc3ff]">
                <span className="mr-1 text-[0.8em]">◆</span>
                {String(hud.armor).padStart(3, "0")}
              </span>
            )}
            <span className={`text-[#ff5fa8] ${hud.health <= 20 ? "flash" : ""}`}>
              <span className="mr-1 text-[0.85em]">♥</span>
              {String(hud.health).padStart(3, "0")}
            </span>
          </div>
          <div className={`ol mt-1 flex gap-[2px] text-[18px] sm:text-[26px] ${hud.wantedFlash ? "flash" : ""}`}>
            {[5, 4, 3, 2, 1, 0].map((i) => (
              <span key={i} className={i < hud.wanted ? "text-[#ffd84a]" : "text-white/15"} style={i < hud.wanted ? undefined : { textShadow: "none" }}>
                ★
              </span>
            ))}
          </div>
          {hud.timer && (
            <div className="ol mt-2 rounded bg-black/45 px-2 py-1 text-[18px] sm:text-[24px] tracking-widest text-[#ffe14a]">
              <span className="mr-2 text-[0.6em] text-white/80">TIME</span>
              {hud.timer}
            </div>
          )}
        </div>
        <div className="flex flex-col items-center">
          <div className="h-[46px] w-[62px] rounded-lg border-2 border-black bg-gradient-to-b from-[#ff8fc4]/80 to-[#b0347a]/80 p-1 sm:h-[64px] sm:w-[88px]">
            <WeaponIcon id={hud.weapon} />
          </div>
          <div className="ol-sm mt-0.5 text-[12px] sm:text-[15px] text-[#bfe9ff]">{hud.ammo >= 0 ? hud.ammo : w?.name.toUpperCase()}</div>
        </div>
      </div>

      {/* radar */}
      <div className={`absolute ${touch ? "left-[max(10px,env(safe-area-inset-left))] top-[max(46px,calc(env(safe-area-inset-top)+40px))]" : "bottom-4 left-4"}`}>
        <canvas
          ref={mapRef}
          width={320}
          height={320}
          className={`${touch ? "h-[104px] w-[104px]" : "h-[150px] w-[150px] lg:h-[176px] lg:w-[176px]"} rounded-full shadow-[0_0_0_3px_rgba(0,0,0,0.6),0_0_18px_rgba(255,79,163,0.35)]`}
        />
      </div>

      {/* utility buttons */}
      <div className="pointer-events-auto absolute left-[max(10px,env(safe-area-inset-left))] top-[max(8px,env(safe-area-inset-top))] flex gap-2">
        <button aria-label="Pause" onClick={onPause} className="h-8 w-8 rounded-md border border-white/30 bg-black/45 text-[13px] leading-none text-white/90 active:scale-95">
          II
        </button>
        <button aria-label="Toggle full screen" onClick={onFullscreen} className="flex h-8 w-8 items-center justify-center rounded-md border border-white/30 bg-black/45 text-white/90 active:scale-95">
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
          </svg>
        </button>
      </div>

      {/* help box */}
      {hud.help && (
        <div className={`absolute ${touch ? "left-[128px] top-[46px] max-w-[42vw]" : "left-4 top-14 max-w-[340px]"} rounded-lg bg-black/70 px-3 py-2 font-sans text-[13px] font-semibold leading-snug text-white sm:text-[15px]`}>
          {hud.help}
        </div>
      )}
      {!hud.help && hud.canEnter && !touch && (
        <div className="absolute left-4 top-14 rounded-lg bg-black/70 px-3 py-2 font-sans text-[14px] font-semibold">
          Press <span className="text-[#ff6fb5]">F</span> to get in
        </div>
      )}

      {/* radio */}
      {radioShow && hud.radio && (
        <div key={hud.radioTick} className={`fade-msg absolute left-1/2 -translate-x-1/2 text-center ${touch ? "top-[27%]" : "top-[12%]"}`}>
          <div className="ol text-[20px] tracking-[0.2em] text-[#ffd84a] sm:text-[26px]">{hud.radio}</div>
        </div>
      )}

      {/* big messages */}
      {hud.big && (
        <div key={hud.big.kind + hud.big.sub} className="pop absolute inset-0 flex flex-col items-center justify-center text-center">
          <div
            className={`ol px-4 text-[44px] italic leading-none tracking-wide sm:text-[86px] ${
              hud.big.kind === "wasted" ? "text-[#ff4f8f]" : hud.big.kind === "busted" ? "text-[#5aa8ff]" : hud.big.kind === "passed" ? "text-[#ffd84a]" : "text-[#ff5a4a]"
            }`}
          >
            {hud.big.text}
          </div>
          {hud.big.sub && <div className="ol mt-2 px-4 text-[22px] text-white sm:text-[38px]">{hud.big.sub}</div>}
        </div>
      )}
      {(hud.big?.kind === "wasted" || hud.big?.kind === "busted") && <div className="absolute inset-0 -z-10 bg-black/35" />}

      {/* zone + vehicle names */}
      <div className={`absolute ${touch ? "left-1/2 top-[35%] w-[46vw] -translate-x-1/2 text-center" : "bottom-5 right-[max(14px,env(safe-area-inset-right))] text-right"}`}>
        {vehShow && lastVeh.current && (
          <div key={"v" + hud.vehicle} className="fade-msg ol text-[18px] italic text-[#7dffb0] sm:text-[26px]">
            {lastVeh.current}
          </div>
        )}
        {zoneShow && (
          <div key={"z" + hud.zone} className="fade-msg font-script ol text-[30px] leading-tight text-[#ffb3da] sm:text-[46px]">
            {hud.zone}
          </div>
        )}
        {hud.inVehicle && !touch && <div className="ol-sm mt-1 text-[15px] text-white/85">{hud.speed} MPH</div>}
      </div>

      {/* subtitles */}
      {hud.subtitle && (
        <div className={`absolute left-1/2 w-[min(92vw,820px)] -translate-x-1/2 text-center ${touch ? "bottom-[max(8px,env(safe-area-inset-bottom))] px-[22vw]" : "bottom-8"}`}>
          <span className="ol-sm font-sans text-[14px] font-bold leading-snug text-white sm:text-[21px]">{rich(hud.subtitle)}</span>
        </div>
      )}
    </div>
  );
}
