import { useState, type ReactNode } from "react";
import type { Settings, Quality } from "../game/config";

interface Props {
  mode: "menu" | "pause";
  hasSave: boolean;
  touch: boolean;
  settings: Settings;
  stats: { money: number; missions: number; packages: number } | null;
  toast: string;
  onNew: () => void;
  onContinue: () => void;
  onResume: () => void;
  onSave: () => void;
  onQuit: () => void;
  onSettings: (s: Settings) => void;
  onFullscreen: () => void;
}

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className="select-none leading-none">
      <div className={`font-hud italic tracking-[0.35em] text-[#27e0d6] ${small ? "text-[10px]" : "text-[11px] sm:text-[14px]"}`} style={{ textShadow: "0 0 10px #27e0d6" }}>
        NEON SUNSET STORIES
      </div>
      <div className={`menu-logo font-script neon-pink -rotate-3 text-[#ffd9ee] ${small ? "text-[44px] sm:text-[60px]" : "text-[58px] sm:text-[104px]"}`}>Coral City</div>
    </div>
  );
}

function Item({ children, onClick, dim = false }: { children: ReactNode; onClick: () => void; dim?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`menu-item group block w-full py-[5px] text-left font-hud text-[19px] italic uppercase tracking-wide transition-all duration-150 hover:translate-x-2 hover:text-[#ff6fb5] focus-visible:translate-x-2 focus-visible:text-[#ff6fb5] focus-visible:outline-none active:scale-[0.98] sm:py-2 sm:text-[30px] ${dim ? "text-white/45" : "text-white"}`}
      style={{ textShadow: "2px 2px 0 #000" }}
    >
      <span className="mr-2 inline-block w-3 text-[#27e0d6] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">›</span>
      {children}
    </button>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <span className="mx-0.5 inline-block min-w-[26px] rounded border border-white/40 bg-white/10 px-1.5 py-0.5 text-center font-hud text-[11px] text-[#ffd9ee]">{children}</span>;
}
function Row({ k, children }: { k: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 py-1.5 text-[13px]">
      <span className="text-white/80">{children}</span>
      <span className="shrink-0 text-right">{k}</span>
    </div>
  );
}

export function Menus(p: Props) {
  const [screen, setScreen] = useState<"main" | "controls" | "options">("main");
  const s = p.settings;
  const set = (patch: Partial<Settings>) => p.onSettings({ ...s, ...patch });

  return (
    <div className="absolute inset-0 overflow-hidden text-white">
      <div className={`absolute inset-0 ${p.mode === "pause" ? "bg-[#12071f]/75 backdrop-blur-sm" : "bg-gradient-to-r from-[#12071f]/95 via-[#2a0d45]/55 to-transparent"}`} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#12071f]/90 to-transparent" />

      <div className="safe-pad absolute inset-0 flex flex-col overflow-y-auto px-5 sm:px-12" style={{ touchAction: "pan-y" }}>
        <div className="menu-head mt-2 sm:mt-8">
          <Logo small={p.mode === "pause" || screen !== "main"} />
        </div>

        {screen === "main" && (
          <div className="menu-list mt-3 w-full max-w-[460px] sm:mt-8">
            {p.mode === "pause" ? (
              <>
                <div className="mb-2 font-hud text-[13px] tracking-[0.3em] text-[#27e0d6]">PAUSED</div>
                <Item onClick={p.onResume}>Resume</Item>
                <Item onClick={p.onSave}>Save Game</Item>
              </>
            ) : (
              <>
                <Item onClick={p.onNew}>Start New Game</Item>
                {p.hasSave && <Item onClick={p.onContinue}>Continue</Item>}
              </>
            )}
            <Item onClick={() => setScreen("controls")}>Controls</Item>
            <Item onClick={() => setScreen("options")}>Options</Item>
            <Item onClick={p.onFullscreen}>Full Screen</Item>
            {p.mode === "pause" && <Item onClick={p.onQuit} dim>Quit to Title</Item>}
            {p.toast && <div className="mt-3 inline-block rounded bg-[#27e0d6]/20 px-3 py-1.5 text-[13px] font-semibold text-[#9ff5ef]">{p.toast}</div>}
            {p.mode === "pause" && p.stats && (
              <div className="mt-4 grid max-w-[360px] grid-cols-3 gap-2 text-center font-hud">
                {[
                  ["CASH", "$" + p.stats.money],
                  ["MISSIONS", String(p.stats.missions)],
                  ["PACKAGES", `${p.stats.packages}/10`],
                ].map(([a, b]) => (
                  <div key={a} className="rounded-lg border border-white/15 bg-black/35 px-2 py-2">
                    <div className="text-[9px] tracking-[0.2em] text-white/55">{a}</div>
                    <div className="text-[16px] text-[#ffd84a]">{b}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {screen === "controls" && (
          <div className="mt-3 w-full max-w-[880px] rounded-xl border border-white/15 bg-black/55 p-4 sm:mt-6 sm:p-6">
            <div className="grid gap-x-8 gap-y-4 md:grid-cols-3">
              <div>
                <h3 className="mb-1 font-hud text-[13px] tracking-[0.25em] text-[#27e0d6]">KEYBOARD + MOUSE</h3>
                <Row k={<><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key></>}>Move / drive</Row>
                <Row k={<Key>Mouse</Key>}>Look around</Row>
                <Row k={<><Key>Click</Key><Key>Ctrl</Key></>}>Punch / shoot</Row>
                <Row k={<Key>Shift</Key>}>Sprint</Row>
                <Row k={<Key>Space</Key>}>Jump / handbrake</Row>
                <Row k={<Key>F</Key>}>Enter / exit vehicle</Row>
                <Row k={<><Key>Q</Key><Key>E</Key><Key>Wheel</Key></>}>Switch weapon</Row>
                <Row k={<Key>R</Key>}>Radio station</Row>
                <Row k={<Key>H</Key>}>Horn</Row>
                <Row k={<Key>T</Key>}>Taxi fares (in a Cabbie)</Row>
                <Row k={<><Key>Esc</Key><Key>P</Key></>}>Pause</Row>
              </div>
              <div>
                <h3 className="mb-1 font-hud text-[13px] tracking-[0.25em] text-[#27e0d6]">TOUCH</h3>
                <Row k="Left thumb">Move / steer (push up = gas)</Row>
                <Row k="Drag right side">Look around</Row>
                <Row k="Buttons">Punch, run, jump, drive, gas, brake…</Row>
                <h3 className="mb-1 mt-4 font-hud text-[13px] tracking-[0.25em] text-[#27e0d6]">GAMEPAD</h3>
                <Row k="Sticks">Move + look</Row>
                <Row k={<><Key>RT</Key><Key>LT</Key></>}>Gas / shoot · brake</Row>
                <Row k={<Key>A</Key>}>Sprint / handbrake</Row>
                <Row k={<><Key>X</Key><Key>Y</Key></>}>Jump · enter / exit</Row>
                <Row k={<><Key>LB</Key><Key>RB</Key></>}>Switch weapon</Row>
                <Row k={<Key>D-pad</Key>}>↑ radio · ↓ taxi</Row>
              </div>
              <div>
                <h3 className="mb-1 font-hud text-[13px] tracking-[0.25em] text-[#27e0d6]">HOW TO PLAY</h3>
                <ul className="space-y-1.5 text-[13px] leading-snug text-white/85">
                  <li><span className="mr-1.5 inline-block h-2.5 w-2.5 bg-[#ff4fa3]" />Pink marker: <b>Special Delivery</b> courier job.</li>
                  <li><span className="mr-1.5 inline-block h-2.5 w-2.5 bg-[#ffd23f]" />Yellow marker: <b>Sunset Sprint</b> race (bring a car).</li>
                  <li><span className="mr-1.5 inline-block h-2.5 w-2.5 bg-[#40ff80]" />Green marker: <b>Spray 'n' Go</b> — $100 clears your wanted level.</li>
                  <li>Steal a <b>Cabbie</b> for taxi fares.</li>
                  <li>Find 10 hidden packages and weapon, armor and health pickups around town.</li>
                  <li>Crime raises your wanted stars. Break line of sight to lose the cops.</li>
                </ul>
              </div>
            </div>
            <div className="mt-4 max-w-[240px]"><Item onClick={() => setScreen("main")}>Back</Item></div>
          </div>
        )}

        {screen === "options" && (
          <div className="mt-3 w-full max-w-[520px] rounded-xl border border-white/15 bg-black/55 p-4 sm:mt-6 sm:p-6">
            <h3 className="mb-2 font-hud text-[13px] tracking-[0.25em] text-[#27e0d6]">GRAPHICS QUALITY</h3>
            <div className="flex gap-2">
              {(["low", "medium", "high"] as Quality[]).map((q) => (
                <button
                  key={q}
                  onClick={() => set({ quality: q })}
                  className={`flex-1 rounded-lg border px-3 py-2 font-hud text-[13px] uppercase transition-colors ${s.quality === q ? "border-[#ff7ac8] bg-[#ff4fa3]/40 text-white" : "border-white/20 bg-white/5 text-white/65 hover:bg-white/10"}`}
                >
                  {q}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] text-white/55">Low: no shadows, fewer cars and people (best for phones). High: soft shadows and neon bloom.</p>
            {(
              [
                ["Radio volume", "music", 0, 1],
                ["Effects volume", "sfx", 0, 1],
                ["Look sensitivity", "sensitivity", 0.3, 2.5],
              ] as [string, "music" | "sfx" | "sensitivity", number, number][]
            ).map(([label, key, min, max]) => (
              <label key={key} className="mt-4 block">
                <div className="mb-1 flex justify-between font-hud text-[12px] tracking-[0.2em] text-[#27e0d6]">
                  <span>{label.toUpperCase()}</span>
                  <span className="text-white/70">{Math.round(((s[key] - min) / (max - min)) * 100)}%</span>
                </div>
                <input type="range" min={min} max={max} step={0.05} value={s[key]} onChange={(e) => set({ [key]: parseFloat(e.target.value) } as Partial<Settings>)} className="w-full" style={{ touchAction: "pan-x" }} />
              </label>
            ))}
            <div className="mt-4 max-w-[240px]"><Item onClick={() => setScreen("main")}>Back</Item></div>
          </div>
        )}

        <div className={`menu-foot mt-auto pt-4 text-[10.5px] leading-snug text-white/50 sm:text-[12px] ${p.mode === "pause" ? "hidden" : ""}`}>
          {p.touch && p.mode === "menu" && <div className="mb-1 text-[#9ff5ef]/80">Tip: rotate to landscape and use Full Screen (or “Add to Home Screen”) for the best experience.</div>}
          An original fan-made homage to 80s open-world games. Not affiliated with or endorsed by Rockstar Games or Take-Two. Built with three.js + Rapier.
        </div>
      </div>
    </div>
  );
}
