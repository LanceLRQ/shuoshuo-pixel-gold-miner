/**
 * 章节背景装饰图层
 *
 * 承载两类动画装饰：
 *  - 粒子型：通过独立 ParticleSystem 实例发射（火把火星、气泡、花瓣）
 *  - 循环型：DecorAnimator 接口，自行 update + render（海草摆动、远景小鱼、旗帜）
 *
 * 渲染顺序：背景之后、矿物之前（GameScene 中调用 render）。
 * 暂停时 update 被跳过，render 正常，与 ParticleSystem 行为一致。
 *
 * 独立 ParticleSystem 池：避免和击中特效池 (GameScene.particles) 互相挤占。
 */

import type { Renderer } from '../core/Renderer';
import { ParticleSystem } from './Particle';

/**
 * 循环动画器接口
 *  - update 阶段允许向外部 particles 发射（如旗帜末端冒火星），通常不需要
 *  - render 阶段直接画到主画布
 */
export interface DecorAnimator {
  update(dt: number, particles: ParticleSystem): void;
  render(ctx: CanvasRenderingContext2D): void;
}

export class DecorationLayer {
  private readonly particles: ParticleSystem;
  private readonly animators: readonly DecorAnimator[];

  constructor(animators: readonly DecorAnimator[]) {
    this.particles = new ParticleSystem();
    this.animators = animators;
  }

  update(dt: number): void {
    for (const a of this.animators) a.update(dt, this.particles);
    this.particles.update(dt);
  }

  render(renderer: Renderer): void {
    const ctx = renderer.getContext();
    // 循环动画先画（作为粒子的背景层）
    for (const a of this.animators) a.render(ctx);
    // 粒子盖在上面
    this.particles.render(renderer);
  }

  /** 关卡切换 / 场景退出时清理状态 */
  clear(): void {
    this.particles.clear();
  }
}
