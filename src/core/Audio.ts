/**
 * 音效管理器
 * 基于 Web Audio API 的音效系统
 * 使用程序生成简单音效，无需外部音频文件
 */

/** 音效类型 */
export enum SoundType {
  HOOK_FIRE = 'HOOK_FIRE',       // 发射
  HOOK_REEL = 'HOOK_REEL',       // 收回
  GRAB_GOLD = 'GRAB_GOLD',       // 抓到金块
  GRAB_STONE = 'GRAB_STONE',     // 抓到石头
  GRAB_DIAMOND = 'GRAB_DIAMOND', // 抓到钻石
  GRAB_BOMB = 'GRAB_BOMB',       // 抓到炸弹
  COIN = 'COIN',                 // 金币
  LEVEL_CLEAR = 'LEVEL_CLEAR',   // 关卡通过
  LEVEL_FAIL = 'LEVEL_FAIL',     // 关卡失败
  TICK = 'TICK',                 // 倒计时滴答
  CLICK = 'CLICK',               // UI 点击
  MINER_HAPPY = 'MINER_HAPPY',   // 矿工语音：高兴（抓到值钱物）"Oooh~"
  MINER_NORMAL = 'MINER_NORMAL', // 矿工语音：平淡（普通物）"Hmm"
  MINER_SAD = 'MINER_SAD',       // 矿工语音：失望（石头/炸弹）"Aaah..."
}

/** 矿工语音参数（供 playVoice 使用） */
interface VoiceEnvelope {
  waveType: OscillatorType;
  /** 频率包络：t=相对开始秒数，hz=目标频率 */
  freqs: Array<{ t: number; hz: number }>;
  /** 总时长（秒） */
  duration: number;
  /** 峰值音量（0-1，会再乘 this.volume） */
  peak: number;
  /** 起音时间（默认 0.05） */
  attackTime?: number;
  /** 持续段起点（达到此时刻仍保持 peak），不传则起音后立即衰减 */
  sustainStart?: number;
  /** 可选颤音：rate=频率Hz，depth=频偏Hz */
  lfo?: { rate: number; depth: number };
}

export class Audio {
  private audioCtx: AudioContext | null = null;
  private volume: number = 0.5;
  private muted: boolean = false;
  /** BGM 总开关 */
  private bgmEnabled: boolean = true;
  /** 当前 BGM 调度器（停止时清除） */
  private bgmScheduler: number | null = null;
  /** BGM 循环时累计的下一个音符播放时间（AudioContext 时钟） */
  private bgmNextNoteTime: number = 0;
  /** BGM 序列指针 */
  private bgmIndex: number = 0;

  /** 懒初始化 AudioContext（需要用户交互后才能创建） */
  private ensureContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    return this.audioCtx;
  }

  /** 播放指定音效 */
  play(type: SoundType): void {
    if (this.muted) return;

    const ctx = this.ensureContext();
    switch (type) {
      case SoundType.HOOK_FIRE:
        this.playSweep(ctx, 300, 100, 0.15);
        break;
      case SoundType.HOOK_REEL:
        this.playSweep(ctx, 200, 400, 0.1);
        break;
      case SoundType.GRAB_GOLD:
        this.playCoinSound(ctx);
        break;
      case SoundType.GRAB_STONE:
        this.playSweep(ctx, 150, 100, 0.1);
        break;
      case SoundType.GRAB_DIAMOND:
        this.playDiamondSound(ctx);
        break;
      case SoundType.GRAB_BOMB:
        this.playBombSound(ctx);
        break;
      case SoundType.COIN:
        this.playCoinSound(ctx);
        break;
      case SoundType.LEVEL_CLEAR:
        this.playFanfare(ctx);
        break;
      case SoundType.LEVEL_FAIL:
        this.playSweep(ctx, 400, 100, 0.4);
        break;
      case SoundType.TICK:
        this.playBeep(ctx, 800, 0.05, 0.3);
        break;
      case SoundType.CLICK:
        this.playBeep(ctx, 600, 0.05, 0.2);
        break;
      case SoundType.MINER_HAPPY:
        this.playMinerHappy(ctx);
        break;
      case SoundType.MINER_NORMAL:
        this.playMinerNormal(ctx);
        break;
      case SoundType.MINER_SAD:
        this.playMinerSad(ctx);
        break;
    }
  }

  /** 矿工拟人语音：高兴 "Oooh~"（三角波 + 颤音上扬） */
  private playMinerHappy(ctx: AudioContext): void {
    this.playVoice(ctx, {
      waveType: 'triangle',
      freqs: [{ t: 0, hz: 280 }, { t: 0.15, hz: 420 }, { t: 0.45, hz: 380 }],
      duration: 0.45,
      peak: 0.22,
      attackTime: 0.05,
      sustainStart: 0.35,
      lfo: { rate: 5, depth: 15 },
    });
  }

  /** 矿工拟人语音：平淡 "Hmm"（鼻音短促） */
  private playMinerNormal(ctx: AudioContext): void {
    this.playVoice(ctx, {
      waveType: 'triangle',
      freqs: [{ t: 0, hz: 220 }, { t: 0.18, hz: 200 }],
      duration: 0.18,
      peak: 0.18,
      attackTime: 0.03,
    });
  }

  /** 矿工拟人语音：失望 "Aaah..."（锯齿波下降） */
  private playMinerSad(ctx: AudioContext): void {
    this.playVoice(ctx, {
      waveType: 'sawtooth',
      freqs: [{ t: 0, hz: 320 }, { t: 0.55, hz: 160 }],
      duration: 0.55,
      peak: 0.18,
      attackTime: 0.05,
      sustainStart: 0.3,
    });
  }

  /**
   * 通用拟人语音合成
   * 抽取自三种 playMiner* 的公共 osc+gain+ADSR 样板
   * 节点在 osc.onended 时统一 disconnect，防止 LFO/lfoGain 在低端设备累积引用
   */
  private playVoice(ctx: AudioContext, env: VoiceEnvelope): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime;
    const peakVol = env.peak * this.volume;

    osc.type = env.waveType;
    for (const point of env.freqs) {
      if (point.t === 0) {
        osc.frequency.setValueAtTime(point.hz, start);
      } else {
        osc.frequency.linearRampToValueAtTime(point.hz, start + point.t);
      }
    }

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peakVol, start + (env.attackTime ?? 0.05));
    if (env.sustainStart !== undefined) {
      gain.gain.setValueAtTime(peakVol, start + env.sustainStart);
    }
    gain.gain.exponentialRampToValueAtTime(0.001, start + env.duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    // 可选 LFO 颤音（modulates osc.frequency）
    let lfo: OscillatorNode | null = null;
    let lfoGain: GainNode | null = null;
    if (env.lfo) {
      lfo = ctx.createOscillator();
      lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = env.lfo.rate;
      lfoGain.gain.value = env.lfo.depth;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(start);
      lfo.stop(start + env.duration);
    }

    osc.start(start);
    osc.stop(start + env.duration);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      lfo?.disconnect();
      lfoGain?.disconnect();
    };
  }

  /** 播放蜂鸣音 */
  private playBeep(ctx: AudioContext, freq: number, duration: number, vol: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.value = vol * this.volume;

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.stop(ctx.currentTime + duration);
  }

  /** 播放扫频音（频率渐变） */
  private playSweep(ctx: AudioContext, startFreq: number, endFreq: number, duration: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(endFreq, ctx.currentTime + duration);
    gain.gain.value = 0.15 * this.volume;

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.stop(ctx.currentTime + duration);
  }

  /** 金币音效（短促上升音，使用精确调度） */
  private playCoinSound(ctx: AudioContext): void {
    this.scheduleBeep(ctx, 880, 0.08, 0.2, 0);
    this.scheduleBeep(ctx, 1100, 0.1, 0.2, 0.08);
  }

  /** 钻石音效（清脆高音，使用精确调度） */
  private playDiamondSound(ctx: AudioContext): void {
    this.scheduleBeep(ctx, 1200, 0.05, 0.2, 0);
    this.scheduleBeep(ctx, 1500, 0.05, 0.2, 0.05);
    this.scheduleBeep(ctx, 1800, 0.1, 0.15, 0.1);
  }

  /** 精确调度的蜂鸣音（替代 setTimeout，避免标签页失焦时跑调） */
  private scheduleBeep(ctx: AudioContext, freq: number, duration: number, vol: number, delay: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol * this.volume, start);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.stop(start + duration);
  }

  /** 炸弹音效（低频爆炸） */
  private playBombSound(ctx: AudioContext): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3 * this.volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }

  /** 胜利号角音效（精确调度） */
  private playFanfare(ctx: AudioContext): void {
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      this.scheduleBeep(ctx, freq, 0.15, 0.2, i * 0.12);
    });
  }

  /** 设置音量 (0-1) */
  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  /** 获取当前音量 */
  getVolume(): number {
    return this.volume;
  }

  /** 静音/取消静音 */
  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted) this.stopBgm();
    return this.muted;
  }

  /** 是否静音 */
  isMuted(): boolean {
    return this.muted;
  }

  /** 设置静音状态 */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stopBgm();
  }

  /** BGM 是否启用 */
  isBgmEnabled(): boolean {
    return this.bgmEnabled;
  }

  /** 设置 BGM 启用状态 */
  setBgmEnabled(enabled: boolean): void {
    this.bgmEnabled = enabled;
    if (!enabled) this.stopBgm();
  }

  // ====== BGM 8-bit 风格背景音乐 ======

  /** 8-bit 风格主旋律（C 大调循环，频率 Hz + 时长秒） */
  private readonly BGM_MELODY: Array<{ freq: number; dur: number }> = [
    // 第一小节
    { freq: 523, dur: 0.2 }, // C5
    { freq: 659, dur: 0.2 }, // E5
    { freq: 784, dur: 0.2 }, // G5
    { freq: 659, dur: 0.2 }, // E5
    // 第二小节
    { freq: 440, dur: 0.2 }, // A4
    { freq: 523, dur: 0.2 }, // C5
    { freq: 659, dur: 0.2 }, // E5
    { freq: 523, dur: 0.2 }, // C5
    // 第三小节
    { freq: 349, dur: 0.2 }, // F4
    { freq: 440, dur: 0.2 }, // A4
    { freq: 523, dur: 0.2 }, // C5
    { freq: 440, dur: 0.2 }, // A4
    // 第四小节
    { freq: 392, dur: 0.2 }, // G4
    { freq: 494, dur: 0.2 }, // B4
    { freq: 587, dur: 0.4 }, // D5（长音收尾）
  ];

  /** 启动 BGM 循环播放 */
  startBgm(): void {
    if (!this.bgmEnabled || this.muted) return;
    if (this.bgmScheduler !== null) return; // 已在播放

    const ctx = this.ensureContext();
    this.bgmIndex = 0;
    this.bgmNextNoteTime = ctx.currentTime + 0.05;

    // 调度器：每 100ms 检查并排入未来 0.3s 内的音符
    const lookAhead = 0.3;
    const interval = 100;
    this.bgmScheduler = window.setInterval(() => {
      const now = this.audioCtx!.currentTime;
      while (this.bgmNextNoteTime < now + lookAhead) {
        const note = this.BGM_MELODY[this.bgmIndex]!;
        this.scheduleBgmNote(note.freq, this.bgmNextNoteTime, note.dur);
        this.bgmNextNoteTime += note.dur;
        this.bgmIndex = (this.bgmIndex + 1) % this.BGM_MELODY.length;
      }
    }, interval);
  }

  /** 停止 BGM 播放 */
  stopBgm(): void {
    if (this.bgmScheduler !== null) {
      clearInterval(this.bgmScheduler);
      this.bgmScheduler = null;
    }
  }

  /** 排入单个 BGM 音符（精确时间调度） */
  private scheduleBgmNote(freq: number, startTime: number, duration: number): void {
    const ctx = this.audioCtx;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // 8-bit 风格用方波
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, startTime);

    // ADSR 简化：快速起音 + 衰减
    const peakVol = 0.06 * this.volume; // BGM 音量低于音效
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peakVol, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.95);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }
}
