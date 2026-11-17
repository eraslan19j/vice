// Fully procedural WebAudio: sound effects, engine, siren and a synthwave "radio".

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Station {
  name: string;
  bpm: number;
  prog: number[][];
  bass: number[];
  arp: number; // 0 none, 1 = 16ths, 2 = 8ths
  hat16: boolean;
  bell: boolean;
}
const STATIONS: Station[] = [
  { name: 'WAVE 84', bpm: 104, prog: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]], bass: [0, 3, 6, 8, 11, 14], arp: 1, hat16: false, bell: false },
  { name: 'NEON FM', bpm: 120, prog: [[62, 65, 69], [58, 62, 65], [53, 57, 60], [60, 64, 67]], bass: [0, 2, 4, 6, 8, 10, 12, 14], arp: 2, hat16: true, bell: false },
  { name: 'CORAL NIGHTS', bpm: 88, prog: [[64, 67, 71], [60, 64, 67], [55, 59, 62], [62, 66, 69]], bass: [0, 7, 10], arp: 0, hat16: false, bell: true },
];

export class AudioSys {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private musicBus!: GainNode;
  private delay!: DelayNode;
  private noiseBuf!: AudioBuffer;
  private engA!: OscillatorNode;
  private engB!: OscillatorNode;
  private engGain!: GainNode;
  private skidGain!: GainNode;
  private hornGain!: GainNode;
  private sirenOsc!: OscillatorNode;
  private sirenGain!: GainNode;
  station = -1; // -1 = off
  private lastStation = 0;
  private nextTime = 0;
  private step = 0;
  sfxVol = 0.8;
  musicVol = 0.6;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);
    this.musicBus = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    this.musicBus.connect(lp).connect(this.music);
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.32;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(this.musicBus);

    const buf = (this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate));
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // engine
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    const elp = ctx.createBiquadFilter();
    elp.type = 'lowpass';
    elp.frequency.value = 700;
    this.engA = ctx.createOscillator();
    this.engA.type = 'sawtooth';
    this.engB = ctx.createOscillator();
    this.engB.type = 'square';
    this.engA.connect(elp);
    this.engB.connect(elp);
    elp.connect(this.engGain).connect(this.sfx);
    this.engA.start();
    this.engB.start();
    // skid
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    const sk = ctx.createBufferSource();
    sk.buffer = buf;
    sk.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 3;
    sk.connect(bp).connect(this.skidGain).connect(this.sfx);
    sk.start();
    // horn
    this.hornGain = ctx.createGain();
    this.hornGain.gain.value = 0;
    for (const f of [370, 466]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(this.hornGain);
      o.start();
    }
    const hlp = ctx.createBiquadFilter();
    hlp.type = 'lowpass';
    hlp.frequency.value = 1800;
    this.hornGain.connect(hlp).connect(this.sfx);
    // siren
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.sfx);
    this.sirenOsc.start();
    this.setVolumes(this.sfxVol, this.musicVol);
  }

  setVolumes(sfx: number, music: number) {
    this.sfxVol = sfx;
    this.musicVol = music;
    if (!this.ctx) return;
    this.sfx.gain.value = sfx;
    this.music.gain.setTargetAtTime(this.station >= 0 ? music * 0.55 : 0, this.ctx.currentTime, 0.1);
  }
  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ------------------------------------------------------------ primitives
  private noise(dur: number, freq: number, gain: number, when = 0, type: BiquadFilterType = 'lowpass', dest?: AudioNode) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(dest || this.sfx);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }
  private tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo = 0, dest?: AudioNode, attack = 0.005) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------------ sfx
  shot(kind: string, vol = 1) {
    if (kind === 'shotgun') {
      this.noise(0.35, 1400, 0.9 * vol);
      this.tone(120, 0.25, 'square', 0.3 * vol, 0, 40);
    } else if (kind === 'smg') {
      this.noise(0.09, 2600, 0.45 * vol);
      this.tone(220, 0.06, 'square', 0.16 * vol, 0, 80);
    } else {
      this.noise(0.16, 2000, 0.6 * vol);
      this.tone(170, 0.11, 'square', 0.22 * vol, 0, 55);
    }
  }
  punch() {
    this.tone(130, 0.1, 'sine', 0.6, 0, 50);
    this.noise(0.06, 800, 0.3);
  }
  crash(i: number) {
    this.noise(0.28, 1000, Math.min(0.9, i));
    this.tone(90, 0.15, 'square', Math.min(0.3, i * 0.4), 0, 45);
  }
  explosion() {
    this.noise(1.5, 420, 1.2);
    this.tone(85, 1.0, 'sine', 0.9, 0, 24);
  }
  pickup() {
    this.tone(880, 0.09, 'square', 0.12);
    this.tone(1320, 0.14, 'square', 0.12, 0.08);
  }
  cash() {
    this.tone(1568, 0.07, 'triangle', 0.2);
    this.tone(2093, 0.16, 'triangle', 0.2, 0.07);
  }
  blip() {
    this.tone(660, 0.06, 'square', 0.08);
  }
  passed() {
    [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => this.tone(mtof(n), 0.5, 'sawtooth', 0.14, i * 0.11));
    this.tone(mtof(48), 1.4, 'triangle', 0.3, 0);
  }
  failed() {
    [64, 60, 57, 52].forEach((n, i) => this.tone(mtof(n), 0.5, 'sawtooth', 0.14, i * 0.22));
  }
  setHorn(on: boolean) {
    if (this.ctx) this.hornGain.gain.setTargetAtTime(on ? 0.12 : 0, this.ctx.currentTime, 0.01);
  }
  setEngine(on: boolean, rpm: number, load: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 42 + rpm * 150;
    this.engA.frequency.setTargetAtTime(f, t, 0.05);
    this.engB.frequency.setTargetAtTime(f * 0.502, t, 0.05);
    this.engGain.gain.setTargetAtTime(on ? 0.05 + load * 0.05 : 0, t, 0.08);
  }
  setSkid(a: number) {
    if (this.ctx) this.skidGain.gain.setTargetAtTime(a * 0.22, this.ctx.currentTime, 0.05);
  }
  setSiren(vol: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sirenOsc.frequency.setTargetAtTime(780 + Math.sin(t * 3.2) * 260, t, 0.03);
    this.sirenGain.gain.setTargetAtTime(vol * 0.09, t, 0.1);
  }
  silenceLoops() {
    this.setEngine(false, 0, 0);
    this.setSkid(0);
    this.setHorn(false);
    this.setSiren(0);
  }

  // ------------------------------------------------------------ radio
  get stationName() {
    return this.station < 0 ? 'RADIO OFF' : STATIONS[this.station].name;
  }
  radioOn(on: boolean) {
    if (on) this.setStation(this.lastStation);
    else {
      if (this.station >= 0) this.lastStation = this.station;
      this.setStation(-1);
    }
  }
  nextStation() {
    let n = this.station + 1;
    if (n >= STATIONS.length) n = -1;
    if (n >= 0) this.lastStation = n;
    this.setStation(n);
  }
  private setStation(n: number) {
    this.station = n;
    if (!this.ctx) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.music.gain.setTargetAtTime(n >= 0 ? this.musicVol * 0.55 : 0, this.ctx.currentTime, 0.15);
    if (n >= 0) this.noise(0.25, 3000, 0.12, 0, 'bandpass'); // tuning static
  }
  /** call every frame; schedules notes slightly ahead of time */
  update() {
    const ctx = this.ctx;
    if (!ctx || this.station < 0 || ctx.state !== 'running') return;
    const st = STATIONS[this.station];
    const sd = 60 / st.bpm / 4;
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05;
    let guard = 0;
    while (this.nextTime < ctx.currentTime + 0.18 && guard++ < 16) {
      this.schedule(st, this.step, this.nextTime - ctx.currentTime, sd);
      this.nextTime += sd;
      this.step++;
    }
  }
  private schedule(st: Station, i: number, when: number, sd: number) {
    const s = i % 16;
    const chord = st.prog[Math.floor(i / 16) % st.prog.length];
    const bus = this.musicBus;
    if (s % 4 === 0) {
      this.tone(150, 0.22, 'sine', 0.9, when, 42, bus, 0.002);
    }
    if (s === 4 || s === 12) {
      this.noise(0.22, 1800, 0.45, when, 'bandpass', bus);
      this.tone(190, 0.1, 'triangle', 0.25, when, 120, bus);
    }
    if (st.hat16 || s % 2 === 0) this.noise(0.04, 7000, s % 4 === 2 ? 0.16 : 0.08, when, 'highpass', bus);
    if (st.bass.includes(s)) {
      const n = chord[0] - 24 + (st.hat16 && s % 4 === 2 ? 12 : 0);
      this.bass(mtof(n), sd * 1.7, when);
    }
    if (st.arp === 1 || (st.arp === 2 && s % 2 === 0)) {
      const seq = st.arp === 1 ? [0, 1, 2, 1, 0, 2, 1, 2] : [0, 2, 1, 2];
      const k = st.arp === 1 ? s % 8 : (s / 2) % 4;
      const n = chord[seq[k]] + 12 + (s >= 12 ? 12 : 0);
      this.pluck(mtof(n), sd * 1.5, when);
    }
    if (st.bell && (s === 0 || s === 6 || s === 12)) {
      const n = chord[s === 0 ? 2 : s === 6 ? 1 : 0] + 24;
      this.tone(mtof(n), 0.9, 'sine', 0.11, when, 0, this.delay);
      this.tone(mtof(n) * 2, 0.3, 'sine', 0.04, when, 0, bus);
    }
    if (s === 0) for (const n of chord) this.pad(mtof(n), sd * 16, when);
  }
  private bass(freq: number, dur: number, when: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  private pluck(freq: number, dur: number, when: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g);
    g.connect(this.musicBus);
    g.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  private pad(freq: number, dur: number, when: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.05);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur * 1.1);
    }
    f.connect(g).connect(this.musicBus);
  }
}
