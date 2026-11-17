// High-fidelity Web Audio API synthesizer for GTA-style soundscape
// No external asset loading required - 100% reliable, zero latency

class SoundManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private masterGain: GainNode | null = null;

  // Engine audio nodes
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private isEngineRunning: boolean = false;

  // Tire screech audio
  private screechGain: GainNode | null = null;
  private screechNoise: AudioBufferSourceNode | null = null;

  // Siren audio
  private sirenOsc: OscillatorNode | null = null;
  private sirenLfo: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private isSirenPlaying: boolean = false;

  // Radio station synthesizer
  private currentRadioStation: number = 0; // 0: Off, 1: Synthwave FM, 2: West Coast Beats, 3: Radio X Rock
  private radioInterval: any = null;
  private radioGain: GainNode | null = null;

  // Cached noise buffers: generating these per shot froze the main thread on phones
  private noiseCache = new Map<string, AudioBuffer>();
  private lastScreechAt = 0;

  constructor() {
    // Lazily initialized on first user interaction
  }

  private getNoise(key: string, dur: number, shape: (i: number, size: number) => number): AudioBuffer | null {
    if (!this.ctx) return null;
    const cached = this.noiseCache.get(key);
    if (cached) return cached;
    const size = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) {
      data[i] = (Math.random() * 2 - 1) * shape(i, size);
    }
    this.noiseCache.set(key, buffer);
    return buffer;
  }

  private initContext() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn("AudioContext init error:", e);
    }
  }

  public resume() {
    this.initContext();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  public suspend() {
    if (this.ctx && this.ctx.state === "running") this.ctx.suspend();
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 0.7, this.ctx.currentTime);
    }
  }

  public setMasterVolume(vol: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(Math.max(0, Math.min(1, vol)), this.ctx.currentTime);
    }
  }

  // --- VEHICLE ENGINE SOUND ---
  public startEngine() {
    if (this.isEngineRunning || !this.ctx) {
      this.initContext();
      if (!this.ctx) return;
    }
    try {
      this.isEngineRunning = true;
      const t = this.ctx.currentTime;

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.01, t);
      this.engineGain.gain.linearRampToValueAtTime(0.35, t + 0.3);

      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = "lowpass";
      this.engineFilter.frequency.setValueAtTime(350, t);
      this.engineFilter.Q.setValueAtTime(3.5, t);

      // Low rumble osc
      this.engineOsc1 = this.ctx.createOscillator();
      this.engineOsc1.type = "sawtooth";
      this.engineOsc1.frequency.setValueAtTime(55, t);

      // Sub harmonic osc
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc2.type = "triangle";
      this.engineOsc2.frequency.setValueAtTime(110, t);

      this.engineOsc1.connect(this.engineFilter);
      this.engineOsc2.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      if (this.masterGain) this.engineGain.connect(this.masterGain);

      this.engineOsc1.start();
      this.engineOsc2.start();
    } catch (e) {
      console.warn("Start engine error:", e);
    }
  }

  public updateEngine(speedNormalized: number, isAccelerating: boolean) {
    if (!this.isEngineRunning || !this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineFilter || !this.engineGain) return;
    try {
      const t = this.ctx.currentTime;
      // Simulated 5-speed transmission RPM curve
      const gearSpread = (speedNormalized * 4) % 1;
      const rpm = 50 + gearSpread * 85 + speedNormalized * 50;

      this.engineOsc1.frequency.setTargetAtTime(rpm, t, 0.08);
      this.engineOsc2.frequency.setTargetAtTime(rpm * 1.5, t, 0.08);

      const filterCutoff = 300 + speedNormalized * 1400 + (isAccelerating ? 300 : 0);
      this.engineFilter.frequency.setTargetAtTime(filterCutoff, t, 0.08);

      const vol = (isAccelerating ? 0.35 : 0.18) + speedNormalized * 0.2;
      this.engineGain.gain.setTargetAtTime(vol, t, 0.08);
    } catch (e) {}
  }

  public stopEngine() {
    if (!this.isEngineRunning || !this.ctx) return;
    this.isEngineRunning = false;
    try {
      if (this.engineGain) {
        this.engineGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.2);
      }
      setTimeout(() => {
        try {
          this.engineOsc1?.stop();
          this.engineOsc2?.stop();
          this.engineOsc1?.disconnect();
          this.engineOsc2?.disconnect();
        } catch (e) {}
      }, 250);
    } catch (e) {}
  }

  // --- CAR HORN ---
  public playHorn() {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = "sawtooth";
    osc2.type = "sawtooth";
    osc1.frequency.setValueAtTime(420, t); // F
    osc2.frequency.setValueAtTime(525, t); // A

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.45);
    osc2.stop(t + 0.45);
  }

  // --- TIRE DRIFT SCREECH ---
  public playTireScreech(intensity: number) {
    this.initContext();
    if (!this.ctx || !this.masterGain || intensity < 0.1) return;
    const t = this.ctx.currentTime;
    if (t - this.lastScreechAt < 0.18) return;
    this.lastScreechAt = t;
    const buffer = this.getNoise("screech", 0.2, () => 1);
    if (!buffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1400 + Math.random() * 400, t);
    filter.Q.setValueAtTime(4, t);

    const gain = this.ctx.createGain();
    const vol = Math.min(0.28, intensity * 0.28);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(t);
    noise.stop(t + 0.2);
  }

  // --- WEAPONS ---
  public playGunshot(type: "fist" | "pistol" | "smg" | "shotgun" | "rpg") {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;

    if (type === "fist") {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.15);
      return;
    }

    if (type === "rpg") {
      // Rocket whoosh then detonation
      this.playExplosion();
      return;
    }

    // Firearms: Noise burst + transient pitch drop
    const dur = type === "shotgun" ? 0.45 : type === "smg" ? 0.12 : 0.22;
    const buffer = this.getNoise(`gun-${type}`, dur, (i, size) => Math.exp(-i / (size * 0.2)));
    if (!buffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(type === "shotgun" ? 1800 : 3200, t);

    // Body thump
    const subOsc = this.ctx.createOscillator();
    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(type === "shotgun" ? 180 : 260, t);
    subOsc.frequency.exponentialRampToValueAtTime(30, t + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(filter);
    filter.connect(gain);
    subOsc.connect(gain);
    gain.connect(this.masterGain);

    noise.start(t);
    subOsc.start(t);
    noise.stop(t + dur);
    subOsc.stop(t + dur);
  }

  // --- EXPLOSION ---
  public playExplosion() {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const dur = 1.4;

    const buffer = this.getNoise("explosion", dur, (i, size) => Math.pow(1 - i / size, 1.8));
    if (!buffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + dur);

    const sub = this.ctx.createOscillator();
    sub.type = "triangle";
    sub.frequency.setValueAtTime(140, t);
    sub.frequency.exponentialRampToValueAtTime(20, t + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(filter);
    filter.connect(gain);
    sub.connect(gain);
    gain.connect(this.masterGain);

    noise.start(t);
    sub.start(t);
    noise.stop(t + dur);
    sub.stop(t + dur);
  }

  // --- POLICE SIREN ---
  public setPoliceSiren(active: boolean) {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    if (!active && this.isSirenPlaying) {
      try {
        this.sirenGain?.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
        setTimeout(() => {
          this.sirenOsc?.stop();
          this.sirenLfo?.stop();
          this.isSirenPlaying = false;
        }, 300);
      } catch (e) {}
      return;
    }

    if (active && !this.isSirenPlaying) {
      try {
        this.isSirenPlaying = true;
        const t = this.ctx.currentTime;

        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.setValueAtTime(0.01, t);
        this.sirenGain.gain.linearRampToValueAtTime(0.2, t + 0.5);

        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = "sawtooth";
        this.sirenOsc.frequency.setValueAtTime(750, t);

        this.sirenLfo = this.ctx.createOscillator();
        this.sirenLfo.frequency.setValueAtTime(0.7, t); // 0.7 Hz wail cycle

        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(220, t); // Modulates pitch between 530Hz and 970Hz

        this.sirenLfo.connect(lfoGain);
        lfoGain.connect(this.sirenOsc.frequency);

        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1800, t);

        this.sirenOsc.connect(filter);
        filter.connect(this.sirenGain);
        this.sirenGain.connect(this.masterGain);

        this.sirenOsc.start(t);
        this.sirenLfo.start(t);
      } catch (e) {}
    }
  }

  // --- RADIO STATIONS SYNTHESIZER ---
  public setRadioStation(stationIndex: number): string {
    this.initContext();
    if (!this.ctx || !this.masterGain) return "OFF";

    this.currentRadioStation = stationIndex;
    if (this.radioInterval) {
      clearInterval(this.radioInterval);
      this.radioInterval = null;
    }

    const stationNames = [
      "Radio Off",
      "Synthwave Vice 80s",
      "West Coast Hip Hop",
      "San Andreas Rock X"
    ];

    if (stationIndex === 0) return stationNames[0];

    // Procedural Music Loops using Web Audio
    let step = 0;
    this.radioInterval = setInterval(() => {
      if (!this.ctx || !this.masterGain || this.isMuted) return;
      const t = this.ctx.currentTime;
      step = (step + 1) % 16;

      if (stationIndex === 1) {
        // SYNTHWAVE: Driving arpeggio + 808 kick + bass
        // Bassline on every 2 beats:
        if (step % 4 === 0) {
          const bass = this.ctx.createOscillator();
          const bGain = this.ctx.createGain();
          bass.type = "sawtooth";
          const bassNotes = [65.41, 65.41, 58.27, 49.0]; // C2, C2, Bb1, G1
          bass.frequency.setValueAtTime(bassNotes[Math.floor(step / 4)], t);
          bGain.gain.setValueAtTime(0.2, t);
          bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          bass.connect(bGain);
          bGain.connect(this.masterGain);
          bass.start(t);
          bass.stop(t + 0.3);
        }

        // Arp notes every 16th
        const arpNotes = [261.63, 329.63, 392.0, 523.25, 493.88, 392.0, 329.63, 293.66];
        const note = arpNotes[step % arpNotes.length];
        const arp = this.ctx.createOscillator();
        const aGain = this.ctx.createGain();
        arp.type = "square";
        arp.frequency.setValueAtTime(note, t);
        aGain.gain.setValueAtTime(0.05, t);
        aGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        arp.connect(aGain);
        aGain.connect(this.masterGain);
        arp.start(t);
        arp.stop(t + 0.12);

      } else if (stationIndex === 2) {
        // HIP HOP: Punchy boom bap kick & snare + sine sub
        if (step === 0 || step === 10) {
          // Kick
          const kick = this.ctx.createOscillator();
          const kGain = this.ctx.createGain();
          kick.frequency.setValueAtTime(140, t);
          kick.frequency.exponentialRampToValueAtTime(35, t + 0.18);
          kGain.gain.setValueAtTime(0.35, t);
          kGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
          kick.connect(kGain);
          kGain.connect(this.masterGain);
          kick.start(t);
          kick.stop(t + 0.18);
        } else if (step === 4 || step === 12) {
          // Snare
          const sNoise = this.ctx.createOscillator();
          const sGain = this.ctx.createGain();
          sNoise.type = "triangle";
          sNoise.frequency.setValueAtTime(220, t);
          sGain.gain.setValueAtTime(0.25, t);
          sGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          sNoise.connect(sGain);
          sGain.connect(this.masterGain);
          sNoise.start(t);
          sNoise.stop(t + 0.15);
        }
      } else if (stationIndex === 3) {
        // ROCK X: Distorted power chord progression
        if (step % 8 === 0) {
          const chords = [
            [110, 164.8, 220], // A power chord
            [146.8, 220, 293.6], // D power chord
            [123.5, 185, 246.9], // B power chord
            [98, 146.8, 196]    // G power chord
          ];
          const c = chords[Math.floor(step / 4) % chords.length];
          c.forEach(freq => {
            if (!this.ctx || !this.masterGain) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(0.1, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(t);
            osc.stop(t + 0.7);
          });
        }
      }
    }, 125);

    return stationNames[stationIndex] || "Radio";
  }

  // --- UI JINGLES ---
  public playCashEarned() {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t + idx * 0.06);
      gain.gain.setValueAtTime(0.18, t + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.06 + 0.15);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + idx * 0.06);
      osc.stop(t + idx * 0.06 + 0.15);
    });
  }

  public playMissionPassed() {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const notes = [440, 440, 440, 554.37, 659.25, 880];
    const times = [0, 0.15, 0.3, 0.45, 0.65, 0.9];
    notes.forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t + times[i]);
      gain.gain.setValueAtTime(0.3, t + times[i]);
      gain.gain.exponentialRampToValueAtTime(0.001, t + times[i] + 0.35);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + times[i]);
      osc.stop(t + times[i] + 0.35);
    });
  }

  public playWasted() {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 2.5);
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 2.5);
  }

  public playHitMarker() {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.05);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }
}

export const soundManager = new SoundManager();
