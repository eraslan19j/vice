import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "./game/game";
import { defaultSettings, type HudState, type Settings } from "./game/config";
import { Hud } from "./ui/Hud";
import { Logo, Menus } from "./ui/Menus";
import { TouchControls } from "./ui/TouchControls";
import cover from "./assets/cover.jpg";

type Phase = "loading" | "menu" | "play" | "pause";
const SETTINGS_KEY = "coral-city-settings-v1";

function loadSettings(): Settings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...d, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return d;
}
function isFullscreen() {
  const d = document as any;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}
function enterFullscreen() {
  const el = document.documentElement as any;
  try {
    const p = (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: "hide" });
    if (p && p.catch) p.catch(() => {});
    const o = (screen as any).orientation;
    if (o && o.lock) o.lock("landscape").catch(() => {});
  } catch {
    /* unsupported (e.g. iPhone Safari) */
  }
}
function toggleFullscreen() {
  if (isFullscreen()) {
    const d = document as any;
    (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
  } else enterFullscreen();
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const phaseRef = useRef<Phase>("loading");
  const [phase, setPhaseState] = useState<Phase>("loading");
  const [hud, setHud] = useState<HudState | null>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [touch, setTouch] = useState(() => typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window));
  const [hasSave, setHasSave] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const pause = useCallback(() => {
    const g = gameRef.current;
    if (!g || phaseRef.current !== "play") return;
    g.setMode("pause");
    setToast("");
    setPhase("pause");
  }, [setPhase]);

  // boot the engine once
  useEffect(() => {
    const canvas = canvasRef.current!;
    let cancelled = false;
    const g = new Game(canvas, loadSettings(), { onHud: setHud, onPause: () => pause() });
    gameRef.current = g;
    (window as any).__game = g;
    const t = setTimeout(() => {
      g.init()
        .then(() => {
          if (cancelled) return;
          g.setMode("menu");
          g.start();
          setHasSave(g.hasSave());
          setPhase("menu");
        })
        .catch((e) => {
          console.error(e);
          setError("Coral City needs WebGL2 and WebAssembly. Please try a recent version of Chrome, Edge, Firefox or Safari.");
        });
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(t);
      g.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onTouch = () => setTouch(true);
    const onVis = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("touchstart", onTouch, { passive: true, once: true });
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("touchstart", onTouch);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pause]);

  const updateSettings = (s: Settings) => {
    setSettings(s);
    gameRef.current?.applySettings(s);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  };

  const begin = (load: boolean) => {
    const g = gameRef.current;
    if (!g) return;
    if (!load || !g.load()) g.newGame();
    g.setMode("play");
    setPhase("play");
    if (touch) {
      if (!isFullscreen()) enterFullscreen();
    } else g.input.requestLock();
  };
  const resume = () => {
    const g = gameRef.current;
    if (!g) return;
    g.setMode("play");
    setPhase("play");
    if (!touch) g.input.requestLock();
  };
  const save = () => {
    const g = gameRef.current;
    if (!g) return;
    if (g.player.dead) setToast("Can't save right now.");
    else {
      setToast(g.save() ? "Game saved." : "Saving is not available in this browser.");
      setHasSave(g.hasSave());
    }
  };
  const quit = () => {
    const g = gameRef.current;
    if (!g) return;
    g.setMode("menu");
    setHasSave(g.hasSave());
    setToast("");
    setPhase("menu");
  };

  const mapRef = useCallback((c: HTMLCanvasElement | null) => {
    if (gameRef.current) gameRef.current.minimap = c;
  }, []);

  const g = gameRef.current;
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b0416]">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full touch-none outline-none" />

      {phase === "play" && hud && g && (
        <>
          {touch && <TouchControls input={g.input} hud={hud} />}
          <Hud hud={hud} touch={touch} onPause={pause} onFullscreen={toggleFullscreen} mapRef={mapRef} />
        </>
      )}

      {(phase === "menu" || phase === "pause") && (
        <Menus
          key={phase}
          mode={phase}
          hasSave={hasSave}
          touch={touch}
          settings={settings}
          stats={hud ? { money: hud.money, missions: hud.missions, packages: hud.packages } : null}
          toast={toast}
          onNew={() => begin(false)}
          onContinue={() => begin(true)}
          onResume={resume}
          onSave={save}
          onQuit={quit}
          onSettings={updateSettings}
          onFullscreen={toggleFullscreen}
        />
      )}

      {phase === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-end bg-[#12071f] text-white">
          <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#12071f] via-[#12071f]/40 to-transparent" />
          <div className="relative mb-[8vh] flex flex-col items-center px-6 text-center">
            <Logo />
            {error ? (
              <p className="mt-6 max-w-md rounded-lg bg-black/70 px-4 py-3 text-sm text-[#ffb3b3]">{error}</p>
            ) : (
              <>
                <div className="mt-6 h-1.5 w-56 overflow-hidden rounded-full bg-white/15">
                  <div className="loadbar h-full w-1/3 rounded-full bg-[#ff4fa3]" />
                </div>
                <p className="mt-3 font-hud text-[11px] tracking-[0.35em] text-white/70">BUILDING THE CITY…</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
