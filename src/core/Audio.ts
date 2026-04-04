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
}

export class Audio {
  private audioCtx: AudioContext | null = null;
  private volume: number = 0.5;
  private muted: boolean = false;

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
    }
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

  /** 金币音效（短促上升音） */
  private playCoinSound(ctx: AudioContext): void {
    this.playBeep(ctx, 880, 0.08, 0.2);
    setTimeout(() => this.playBeep(ctx, 1100, 0.1, 0.2), 80);
  }

  /** 钻石音效（清脆高音） */
  private playDiamondSound(ctx: AudioContext): void {
    this.playBeep(ctx, 1200, 0.05, 0.2);
    setTimeout(() => this.playBeep(ctx, 1500, 0.05, 0.2), 50);
    setTimeout(() => this.playBeep(ctx, 1800, 0.1, 0.15), 100);
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

  /** 胜利号角音效 */
  private playFanfare(ctx: AudioContext): void {
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      setTimeout(() => this.playBeep(ctx, freq, 0.15, 0.2), i * 120);
    });
  }

  /** 设置音量 (0-1) */
  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  /** 静音/取消静音 */
  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  /** 是否静音 */
  isMuted(): boolean {
    return this.muted;
  }
}
