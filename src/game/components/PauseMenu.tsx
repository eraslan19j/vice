"use client";

import React, { useState, useEffect } from "react";
import {
  MapPin,
  Car,
  Award,
  Settings,
  Save,
  Trophy,
  X,
  Play,
  Sun,
  Moon,
  Volume2,
  Sparkles,
  Shield,
  Zap,
} from "lucide-react";

interface PauseMenuProps {
  isOpen: boolean;
  onClose: () => void;
  playerCash: number;
  timeOfDay: number; // 0 to 24
  onChangeTimeOfDay: (time: number) => void;
  graphicsQuality: "low" | "medium" | "high" | "ultra";
  onChangeGraphicsQuality: (quality: "low" | "medium" | "high" | "ultra") => void;
  onStartMission: (missionId: string) => void;
  onSpawnCar: (type: "supercar" | "muscle" | "police" | "suv", color: string) => void;
  onSaveGame: () => Promise<void>;
  isSaving: boolean;
  saveMessage: string | null;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({
  isOpen,
  onClose,
  playerCash,
  timeOfDay,
  onChangeTimeOfDay,
  graphicsQuality,
  onChangeGraphicsQuality,
  onStartMission,
  onSpawnCar,
  onSaveGame,
  isSaving,
  saveMessage,
}) => {
  const [activeTab, setActiveTab] = useState<"map" | "missions" | "garage" | "settings" | "leaderboard">("map");
  const [missionsList, setMissionsList] = useState<any[]>([]);
  const [leaderboardList, setLeaderboardList] = useState<any[]>([]);
  const [selectedCarColor, setSelectedCarColor] = useState("#e63946");
  const [selectedCarType, setSelectedCarType] = useState<"supercar" | "muscle" | "police" | "suv">("supercar");

  useEffect(() => {
    if (!isOpen) return;
    // Load missions and leaderboard from API
    fetch("/api/missions")
      .then((res) => res.json())
      .then((data) => {
        if (data.missions) setMissionsList(data.missions);
      })
      .catch(() => {});

    fetch("/api/leaderboard")
      .then((res) => res.json())
      .then((data) => {
        if (data.scores) setLeaderboardList(data.scores);
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/95 select-none" style={{ touchAction: "auto", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}>
      <div className="relative w-full h-full bg-neutral-950 flex flex-col overflow-hidden">
        {/* --- HEADER --- */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-white/10 bg-neutral-900">
          <div className="hidden lg:flex items-center gap-3">
            <div className="text-2xl font-black italic tracking-tighter text-amber-500 font-serif">
              GRAND THEFT AUTO <span className="text-white text-xs font-sans tracking-widest uppercase ml-2 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">VICE METROPOLIS</span>
            </div>
          </div>

          {/* TABS */}
          <div className="flex flex-1 min-w-0 items-center gap-1 overflow-x-auto bg-black/60 p-1 rounded-2xl border border-white/10">
            <button
              onPointerDown={() => setActiveTab("map")}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded-xl text-xs font-bold ${
                activeTab === "map" ? "bg-amber-500 text-black shadow-lg" : "text-neutral-400 hover:text-white"
              }`}
            >
              <MapPin className="h-4 w-4" /> Harita
            </button>
            <button
              onPointerDown={() => setActiveTab("missions")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "missions" ? "bg-amber-500 text-black shadow-lg" : "text-neutral-400 hover:text-white"
              }`}
            >
              <Award className="h-4 w-4" /> Görevler
            </button>
            <button
              onPointerDown={() => setActiveTab("garage")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "garage" ? "bg-amber-500 text-black shadow-lg" : "text-neutral-400 hover:text-white"
              }`}
            >
              <Car className="h-4 w-4" /> Garaj
            </button>
            <button
              onPointerDown={() => setActiveTab("settings")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "settings" ? "bg-amber-500 text-black shadow-lg" : "text-neutral-400 hover:text-white"
              }`}
            >
              <Settings className="h-4 w-4" /> Grafikler
            </button>
            <button
              onPointerDown={() => setActiveTab("leaderboard")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "leaderboard" ? "bg-amber-500 text-black shadow-lg" : "text-neutral-400 hover:text-white"
              }`}
            >
              <Trophy className="h-4 w-4" /> Skorlar
            </button>
          </div>

          <button
            onClick={onClose}
            className="shrink-0 rounded-full bg-white/10 p-3 text-white active:bg-white/30"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* --- BODY CONTENT --- */}
        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-3 text-white">
          {/* 1. MAP TAB */}
          {activeTab === "map" && (
            <div className="flex flex-col md:flex-row gap-3 h-full">
              <div className="flex-1 bg-black/60 rounded-2xl border border-white/10 relative overflow-hidden flex items-center justify-center p-4">
                <svg viewBox="0 0 800 600" className="w-full h-full max-h-[460px]">
                  {/* Ocean on left */}
                  <rect x="0" y="0" width="160" height="600" fill="#0284c7" opacity="0.35" />
                  <text x="70" y="300" fill="#38bdf8" fontSize="14" fontWeight="bold" textAnchor="middle" transform="rotate(-90 70 300)">PACIFIC OCEAN</text>
                  {/* Beach Strip */}
                  <rect x="160" y="0" width="40" height="600" fill="#d97706" opacity="0.25" />
                  {/* Pier */}
                  <rect x="70" y="280" width="110" height="25" fill="#78350f" opacity="0.8" />
                  <circle cx="70" cy="292" r="15" fill="none" stroke="#38bdf8" strokeWidth="3" />
                  <text x="120" y="270" fill="#fcd34d" fontSize="11" fontWeight="bold">DEL PERRO PIER</text>

                  {/* Road Network */}
                  {/* Vertical Avenues */}
                  {[220, 320, 440, 560, 680].map((x) => (
                    <line key={x} x1={x} y1="0" x2={x} y2="600" stroke="#475569" strokeWidth="16" />
                  ))}
                  {/* Horizontal Boulevards */}
                  {[80, 190, 300, 410, 520].map((y) => (
                    <line key={y} x1="200" y1={y} x2="720" y2={y} stroke="#475569" strokeWidth="16" />
                  ))}

                  {/* Downtown Skyscraper Clusters */}
                  <rect x="360" y="220" width="140" height="150" fill="#1e293b" stroke="#64748b" rx="8" />
                  <text x="430" y="295" fill="#e2e8f0" fontSize="12" fontWeight="bold" textAnchor="middle">DOWNTOWN MAZE</text>

                  {/* Locations Markers */}
                  {/* Bank */}
                  <circle cx="410" cy="135" r="12" fill="#f59e0b" />
                  <text x="410" y="140" fill="#000" fontSize="13" fontWeight="bold" textAnchor="middle">$</text>
                  <text x="410" y="115" fill="#f59e0b" fontSize="11" fontWeight="bold" textAnchor="middle">Pacific Union Bank</text>

                  {/* Ammu-Nation */}
                  <circle cx="580" cy="460" r="12" fill="#ef4444" />
                  <text x="580" y="465" fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">🔫</text>
                  <text x="580" y="490" fill="#ef4444" fontSize="11" fontWeight="bold" textAnchor="middle">Ammu-Nation</text>

                  {/* Pay 'N' Spray */}
                  <circle cx="580" cy="135" r="12" fill="#10b981" />
                  <text x="580" y="140" fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">🔧</text>
                  <text x="580" y="115" fill="#10b981" fontSize="11" fontWeight="bold" textAnchor="middle">Pay 'N' Spray</text>

                  {/* Industrial Docks */}
                  <rect x="400" y="525" width="220" height="60" fill="#0f172a" stroke="#0ea5e9" rx="6" />
                  <circle cx="500" cy="555" r="12" fill="#3b82f6" />
                  <text x="500" y="560" fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">⚓</text>
                  <text x="500" y="580" fill="#38bdf8" fontSize="11" fontWeight="bold" textAnchor="middle">Industrial Port & Safehouse</text>
                </svg>
              </div>

              {/* Map Legend */}
              <div className="w-full md:w-72 bg-black/40 rounded-2xl border border-white/10 p-3 flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-bold text-amber-400 mb-4 uppercase tracking-wider">Şehir Haritası Açıklaması</h3>
                  <div className="space-y-3.5 text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-amber-500 text-black flex items-center justify-center font-black">$</div>
                      <div>
                        <div className="font-bold text-white">Pacific Union Bank</div>
                        <div className="text-neutral-400 text-[11px]">Banka Soygunu Hedefi ($25,000)</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center font-black">🔫</div>
                      <div>
                        <div className="font-bold text-white">Ammu-Nation Silahçı</div>
                        <div className="text-neutral-400 text-[11px]">Tabanca, SMG, Shotgun, RPG, Çelik Yelek</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black">🔧</div>
                      <div>
                        <div className="font-bold text-white">Pay &apos;N&apos; Spray Tamirhane</div>
                        <div className="text-neutral-400 text-[11px]">Aracı Yenile & Polisi Sıfırla ($500)</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center font-black">⚓</div>
                      <div>
                        <div className="font-bold text-white">Liman & İhracat Sahası</div>
                        <div className="text-neutral-400 text-[11px]">Çalıntı araç teslimatı & Çete alanı</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <button
                    onClick={onClose}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 text-black font-extrabold text-sm hover:bg-amber-400 transition"
                  >
                    <Play className="h-4 w-4" /> Oyuna Devam Et
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. MISSIONS TAB */}
          {activeTab === "missions" && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="text-sm text-neutral-400 mb-2">
                Açık dünya görevlerini tamamlayarak nakit para, saygınlık ve yeni silahlar kazanın.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {missionsList.map((m) => (
                  <div
                    key={m.id}
                    className="bg-black/60 rounded-2xl border border-white/10 p-3 flex flex-col justify-between hover:border-amber-500/50 transition-all shadow-lg"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {m.giver}
                        </span>
                        <span className="text-xs font-bold text-emerald-400 font-mono">
                          + ${m.rewardCash.toLocaleString()}
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-white mt-2">{m.title}</h4>
                      <p className="text-xs text-neutral-400 mt-2 leading-relaxed">{m.description}</p>
                    </div>

                    <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between">
                      <span className="text-xs text-neutral-500 font-medium">Zorluk: {m.difficulty}</span>
                      <button
                        onClick={() => {
                          onStartMission(m.id);
                          onClose();
                        }}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition flex items-center gap-1.5 shadow-md"
                      >
                        <Play className="h-3.5 w-3.5" /> Görevi Başlat
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. GARAGE & VEHICLE CUSTOMIZER */}
          {activeTab === "garage" && (
            <div className="max-w-4xl mx-auto space-y-3">
              <div className="bg-black/60 rounded-2xl border border-white/10 p-3">
                <h3 className="text-base font-bold text-amber-400 mb-2 flex items-center gap-2">
                  <Car className="h-5 w-5" /> Araç Galerisi & Özel Modifiye
                </h3>
                <p className="text-xs text-neutral-400">
                  İstediğiniz süper aracı, kaslı Amerikan muscle arabasını veya polis interceptor aracını seçin ve hemen önünüzde oluşturun.
                </p>

                {/* Vehicle Model Selector */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                  {[
                    { id: "supercar", name: "Pegassi Torero GT", desc: "185 KM/H Süper Spor", icon: "🏎️" },
                    { id: "muscle", name: "Vapid Dominator", desc: "165 KM/H Ağır Drift Muscle", icon: "🚗" },
                    { id: "police", name: "Police Interceptor", desc: "175 KM/H Strob Işıklı Polis", icon: "🚓" },
                    { id: "suv", name: "Mammoth Patriot 4x4", desc: "145 KM/H Ağır Zırhlı SUV", icon: "🚙" },
                  ].map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedCarType(v.id as any)}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        selectedCarType === v.id
                          ? "bg-amber-500/20 border-amber-500 text-white shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                          : "bg-black/40 border-white/10 text-neutral-300 hover:border-white/30"
                      }`}
                    >
                      <div className="text-3xl mb-2">{v.icon}</div>
                      <div className="font-bold text-sm text-white">{v.name}</div>
                      <div className="text-[11px] text-neutral-400 mt-1">{v.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Color Palette */}
                <div className="mt-3">
                  <label className="text-xs font-bold text-neutral-300 uppercase tracking-wider block mb-2">
                    Metalik Gövde Boyası
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { hex: "#e63946", name: "Rosso Corsa Kırmızı" },
                      { hex: "#1d3557", name: "Gece Mavisi" },
                      { hex: "#10b981", name: "Zümrüt Yeşil" },
                      { hex: "#f59e0b", name: "Lüks Altın Sarısı" },
                      { hex: "#8b5cf6", name: "Neon Menekşe Moru" },
                      { hex: "#18181b", name: "Mat Karbon Siyah" },
                      { hex: "#f8fafc", name: "Sedefli Beyaz" },
                    ].map((col) => (
                      <button
                        key={col.hex}
                        onClick={() => setSelectedCarColor(col.hex)}
                        className={`w-10 h-10 rounded-xl border-2 transition-all ${
                          selectedCarColor === col.hex ? "scale-115 border-white shadow-lg" : "border-transparent opacity-80 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: col.hex }}
                        title={col.name}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    onClick={() => {
                      onSpawnCar(selectedCarType, selectedCarColor);
                      onClose();
                    }}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition shadow-xl"
                  >
                    <Car className="h-4 w-4" /> Aracı Çağır & Oyuna Dön
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 4. SETTINGS & GRAPHICS TAB */}
          {activeTab === "settings" && (
            <div className="max-w-3xl mx-auto space-y-3">
              <div className="bg-black/60 rounded-2xl border border-white/10 p-3 space-y-3">
                <div>
                  <h3 className="text-base font-bold text-amber-400 mb-1 flex items-center gap-2">
                    <Sparkles className="h-5 w-5" /> Grafik Kalitesi
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Takılma olursa oyun kaliteyi kendisi düşürür. Akıcılık için "Performans" seçin.
                  </p>
                  <div className="grid grid-cols-4 gap-3 mt-4">
                    {[
                      { id: "ultra", title: "Ultra", sub: "Gölge + Yüksek Çözünürlük" },
                      { id: "high", title: "Yüksek", sub: "Detaylı Gölgeler" },
                      { id: "medium", title: "Orta", sub: "Dengeli 60 FPS" },
                      { id: "low", title: "Performans", sub: "Hafif Cihazlar" },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => onChangeGraphicsQuality(preset.id as any)}
                        className={`p-3 rounded-xl border text-center transition-all ${
                          graphicsQuality === preset.id
                            ? "bg-amber-500 text-black border-amber-400 font-extrabold shadow-lg"
                            : "bg-black/40 border-white/10 text-neutral-300 hover:border-white/30"
                        }`}
                      >
                        <div className="text-xs font-bold">{preset.title}</div>
                        <div className="text-[10px] opacity-75 mt-0.5">{preset.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-neutral-300 flex items-center gap-2">
                      <Sun className="h-4 w-4 text-amber-400" /> Gün Döngüsü & Atmosfer Zamanı: {Math.floor(timeOfDay)}:00
                    </label>
                    <span className="text-xs text-amber-400 font-mono">
                      {timeOfDay >= 6 && timeOfDay < 11
                        ? "Altın Sabah Işığı"
                        : timeOfDay >= 11 && timeOfDay < 18
                        ? "Öğlen Güneşi"
                        : timeOfDay >= 18 && timeOfDay < 21
                        ? "Turuncu Gün Batımı (Sunset)"
                        : "Siberpunk Neon Gece"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="24"
                    step="0.5"
                    value={timeOfDay}
                    onChange={(e) => onChangeTimeOfDay(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 bg-neutral-800 h-2 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-500 mt-1">
                    <span>00:00 Gece</span>
                    <span>06:00 Şafak</span>
                    <span>12:00 Öğlen</span>
                    <span>18:00 Gün Batımı</span>
                    <span>23:59 Gece</span>
                  </div>
                </div>

                {/* Database Save Button */}
                <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">PostgreSQL Veritabanı Kaydı</div>
                    <div className="text-[11px] text-neutral-400">Nakit, sağlık, silahlar ve konumunuz kaydedilir.</div>
                    {saveMessage && (
                      <div className="text-xs text-emerald-400 font-bold mt-1">{saveMessage}</div>
                    )}
                  </div>
                  <button
                    onClick={onSaveGame}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs transition shadow-lg disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" /> {isSaving ? "Kaydediliyor..." : "Oyunu Kaydet"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 5. LEADERBOARD TAB */}
          {activeTab === "leaderboard" && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="bg-black/60 rounded-2xl border border-white/10 p-3">
                <h3 className="text-base font-bold text-amber-400 mb-4 flex items-center gap-2">
                  <Trophy className="h-5 w-5" /> En İyi Suç Liderleri & Skor Tablosu
                </h3>

                <div className="divide-y divide-white/10">
                  {leaderboardList.map((entry, idx) => (
                    <div key={idx} className="py-3 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-black ${
                            idx === 0
                              ? "bg-amber-400 text-black"
                              : idx === 1
                              ? "bg-neutral-300 text-black"
                              : idx === 2
                              ? "bg-amber-700 text-white"
                              : "bg-white/10 text-neutral-400"
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-bold text-white">{entry.playerName}</div>
                          <div className="text-neutral-400 text-[10px]">{entry.details}</div>
                        </div>
                      </div>
                      <div className="font-mono font-black text-emerald-400 text-sm">
                        {entry.score.toLocaleString()} PTS
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --- FOOTER CONTROLS GUIDE --- */}
        <div className="px-8 py-3.5 border-t border-white/10 bg-neutral-900/60 flex items-center justify-between text-[11px] text-neutral-400 font-mono">
          <div className="flex items-center gap-4">
            <span><strong className="text-white">W,A,S,D:</strong> Hareket / Sürüş</span>
            <span><strong className="text-white">SHIFT:</strong> Koş / Nitro</span>
            <span><strong className="text-white">SPACE:</strong> Zıpla / El Freni</span>
            <span><strong className="text-white">E / F:</strong> Araca Bin / İletişim</span>
            <span><strong className="text-white">Sol Tık:</strong> Ateş / Yumruk</span>
            <span><strong className="text-white">1-5:</strong> Silah Değiştir</span>
            <span><strong className="text-white">V:</strong> Kamera Açısı</span>
          </div>
          <span className="text-amber-400 font-bold font-sans">GTA Vice Metropolis v2.5</span>
        </div>
      </div>
    </div>
  );
};
