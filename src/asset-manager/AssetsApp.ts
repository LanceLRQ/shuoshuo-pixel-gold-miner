/**
 * 素材管理页主应用
 *
 * 状态机：currentThemeId + currentTab。
 * 子面板（ThemeList / Sprite / Background）通过传入的 host 接口回调主应用。
 */

import classicJson from '../assets/themes/classic.json';
import shuoshuoCrystalJson from '../assets/themes/shuoshuo-crystal.json';
import type { ThemeJson, SpriteJson } from '../assets/themeLoader';
import { ThemeStore, SYSTEM_THEME_IDS } from './ThemeStore';
import { ThemeListPanel } from './ThemeListPanel';
import { SpritePanel } from './SpritePanel';
import { BackgroundPanel } from './BackgroundPanel';
import { escapeHtml } from './domUtils';

const SYSTEM_THEMES: ThemeJson[] = [
  classicJson as ThemeJson,
  shuoshuoCrystalJson as ThemeJson,
];

type Tab = 'sprites' | 'background';

/** AssetsApp 暴露给子面板的接口（避免直接拿到 this） */
export interface AssetsHost {
  getCurrentTheme(): ThemeJson;
  isReadonly(id?: string): boolean;
  /** 子面板修改单个 sprite 后调用：自动拼装新 ThemeJson + 持久化 + 重渲 */
  commitSprite(name: string, sprite: SpriteJson): void;
  /** 子面板修改背景色后调用 */
  commitBackground(background: ThemeJson['background']): void;
}

export class AssetsApp implements AssetsHost {
  private store = new ThemeStore();
  private root: HTMLElement | null = null;
  private currentThemeId: string = SYSTEM_THEME_IDS[0]!; // 默认 classic
  private currentTab: Tab = 'sprites';
  private themeListPanel = new ThemeListPanel(this);
  private spritePanel = new SpritePanel(this);
  private backgroundPanel = new BackgroundPanel(this);

  mount(root: HTMLElement): void {
    this.root = root;
    // 跨标签场景：本地选中的主题可能在另一标签被删除，校正回首个系统主题
    if (!this.getAllThemes().some((t) => t.id === this.currentThemeId)) {
      this.currentThemeId = SYSTEM_THEME_IDS[0]!;
    }
    this.render();
  }

  // ===== AssetsHost 接口 =====

  getCurrentTheme(): ThemeJson {
    const all = this.getAllThemes();
    return all.find((t) => t.id === this.currentThemeId) ?? all[0]!;
  }

  isReadonly(id?: string): boolean {
    return this.store.isSystemTheme(id ?? this.currentThemeId);
  }

  commitSprite(name: string, sprite: SpriteJson): void {
    const theme = this.getCurrentTheme();
    if (this.isReadonly(theme.id)) {
      console.warn('试图修改系统主题，已忽略', theme.id);
      return;
    }
    const updated: ThemeJson = {
      ...theme,
      sprites: { ...theme.sprites, [name]: sprite },
    };
    this.store.addOrUpdate(updated);
    this.render();
  }

  commitBackground(background: ThemeJson['background']): void {
    const theme = this.getCurrentTheme();
    if (this.isReadonly(theme.id)) {
      console.warn('试图修改系统主题，已忽略', theme.id);
      return;
    }
    const updated: ThemeJson = { ...theme, background: { ...background } };
    this.store.addOrUpdate(updated);
    this.render();
  }

  /** 主题列表 CRUD 完成后触发重渲（不带 commit 含义） */
  rerender(): void {
    this.render();
  }

  // ===== 主题列表用 API =====

  getStore(): ThemeStore {
    return this.store;
  }

  getAllThemes(): ThemeJson[] {
    return [...SYSTEM_THEMES, ...this.store.loadCustom()];
  }

  getCustomThemes(): ThemeJson[] {
    return this.store.loadCustom();
  }

  getSystemThemes(): ThemeJson[] {
    return SYSTEM_THEMES;
  }

  getCurrentThemeId(): string {
    return this.currentThemeId;
  }

  setCurrentThemeId(id: string): void {
    this.currentThemeId = id;
    this.render();
  }

  getCurrentTab(): Tab {
    return this.currentTab;
  }

  setCurrentTab(tab: Tab): void {
    this.currentTab = tab;
    this.render();
  }

  // ===== 渲染 =====

  private render(): void {
    if (!this.root) return;
    this.root.innerHTML = '';

    // 顶部 header
    const header = document.createElement('header');
    header.className = 'am-header';
    header.innerHTML = `
      <a class="am-back" href="./index.html">← 返回游戏</a>
      <h1 class="am-title">素材管理</h1>
      <span class="am-meta" id="am-meta"></span>
    `;
    this.root.appendChild(header);

    // 主体两栏布局
    const body = document.createElement('div');
    body.className = 'am-body';
    this.root.appendChild(body);

    const sidebar = document.createElement('aside');
    sidebar.className = 'am-sidebar';
    body.appendChild(sidebar);
    this.themeListPanel.render(sidebar);

    const main = document.createElement('section');
    main.className = 'am-main';
    body.appendChild(main);
    this.renderMain(main);
  }

  private renderMain(root: HTMLElement): void {
    const theme = this.getCurrentTheme();
    const readonly = this.isReadonly();

    const toolbar = document.createElement('div');
    toolbar.className = 'am-toolbar';
    toolbar.innerHTML = `
      <div class="am-toolbar-info">
        <span class="am-toolbar-name">${escapeHtml(theme.name)}</span>
        <span class="am-toolbar-id">${escapeHtml(theme.id)}</span>
        ${readonly ? '<span class="am-readonly">🔒 系统主题（只读）</span>' : ''}
      </div>
      <div class="am-tabs">
        <button class="am-tab ${this.currentTab === 'sprites' ? 'active' : ''}" data-tab="sprites">Sprites</button>
        <button class="am-tab ${this.currentTab === 'background' ? 'active' : ''}" data-tab="background">背景色</button>
      </div>
    `;
    toolbar.querySelectorAll<HTMLButtonElement>('.am-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setCurrentTab(btn.dataset.tab as Tab);
      });
    });
    root.appendChild(toolbar);

    const content = document.createElement('div');
    content.className = 'am-content';
    root.appendChild(content);

    if (this.currentTab === 'sprites') {
      this.spritePanel.render(content);
    } else {
      this.backgroundPanel.render(content);
    }
  }
}

