/**
 * 背景色 tab：编辑主题的 10 个背景色字段
 */

import type { AssetsApp } from './AssetsApp';
import type { BackgroundColors } from '../assets/theme/types';
import { BACKGROUND_COLOR_KEYS } from './ThemeStore';

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

const LABEL_MAP: Record<keyof BackgroundColors, string> = {
  skyTop: '天空顶部',
  skyBottom: '天空底部',
  groundColor: '地面主色',
  groundDark: '地面阴影',
  groundLight: '地面高光',
  dirtLight: '泥土亮',
  dirtMid: '泥土中',
  dirtDark: '泥土暗',
  rockColor: '岩石主色',
  rockDark: '岩石阴影',
};

export class BackgroundPanel {
  private draft: BackgroundColors | null = null;
  private lastThemeId: string | null = null;

  constructor(private app: AssetsApp) {}

  render(root: HTMLElement): void {
    const theme = this.app.getCurrentTheme();
    if (this.lastThemeId !== theme.id) {
      this.draft = { ...theme.background };
      this.lastThemeId = theme.id;
    }
    if (!this.draft) this.draft = { ...theme.background };

    root.innerHTML = '';

    const readonly = this.app.isReadonly();
    if (readonly) {
      const hint = document.createElement('div');
      hint.className = 'am-readonly-hint';
      hint.textContent = '系统主题只读：可查看背景色但不可修改，复制为自定义主题后再编辑';
      root.appendChild(hint);
    }

    const form = document.createElement('div');
    form.className = 'am-bg-form';
    root.appendChild(form);

    for (const key of BACKGROUND_COLOR_KEYS) {
      form.appendChild(this.renderField(key, readonly));
    }

    const actions = document.createElement('div');
    actions.className = 'am-bg-actions';
    const dirty = this.isDirty(theme.background);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'am-btn primary';
    saveBtn.textContent = dirty ? '保存（有未保存改动）' : '保存';
    saveBtn.disabled = readonly || !dirty;
    saveBtn.addEventListener('click', () => this.handleSave());
    actions.appendChild(saveBtn);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'am-btn';
    resetBtn.textContent = '放弃改动';
    resetBtn.disabled = readonly || !dirty;
    resetBtn.addEventListener('click', () => {
      this.draft = { ...theme.background };
      this.app.rerender();
    });
    actions.appendChild(resetBtn);

    root.appendChild(actions);
  }

  private renderField(key: keyof BackgroundColors, readonly: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = 'am-bg-row';

    const label = document.createElement('label');
    label.className = 'am-bg-label';
    label.textContent = `${LABEL_MAP[key]} (${key})`;
    row.appendChild(label);

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = this.normalizeHex(this.draft![key]);
    picker.disabled = readonly;
    row.appendChild(picker);

    const text = document.createElement('input');
    text.type = 'text';
    text.className = 'am-bg-hex';
    text.value = this.draft![key];
    text.maxLength = 7;
    text.disabled = readonly;
    row.appendChild(text);

    picker.addEventListener('input', () => {
      const hex = picker.value.toUpperCase();
      this.draft![key] = hex;
      text.value = hex;
      this.app.rerender();
    });
    text.addEventListener('change', () => {
      const v = text.value.trim();
      if (!HEX_REGEX.test(v)) {
        alert(`无效的 hex 颜色：${v}（需 #RRGGBB 格式）`);
        text.value = this.draft![key];
        return;
      }
      const hex = v.toUpperCase();
      this.draft![key] = hex;
      picker.value = hex;
      this.app.rerender();
    });

    return row;
  }

  private isDirty(committed: BackgroundColors): boolean {
    if (!this.draft) return false;
    return BACKGROUND_COLOR_KEYS.some((k) => this.draft![k] !== committed[k]);
  }

  private handleSave(): void {
    if (!this.draft) return;
    this.app.commitBackground(this.draft);
  }

  private normalizeHex(hex: string): string {
    return HEX_REGEX.test(hex) ? hex : '#000000';
  }
}
