/**
 * 左侧主题列表 + 操作面板
 */

import type { AssetsApp } from './AssetsApp';
import type { ThemeJson } from '../assets/themeLoader';
import { escapeHtml } from './domUtils';

const ID_REGEX = /^[a-z0-9_]{1,40}$/i;

export class ThemeListPanel {
  constructor(private app: AssetsApp) {}

  render(root: HTMLElement): void {
    root.innerHTML = '';

    const system = this.app.getSystemThemes();
    const custom = this.app.getCustomThemes();
    const currentId = this.app.getCurrentThemeId();

    root.appendChild(this.renderGroup('系统主题', system, currentId, true));
    root.appendChild(this.renderGroup('自定义主题', custom, currentId, false));

    const actions = document.createElement('div');
    actions.className = 'am-list-actions';
    actions.appendChild(this.makeButton('+ 新建主题', () => this.handleCreate()));
    actions.appendChild(this.makeButton('复制当前', () => this.handleDuplicate()));
    actions.appendChild(this.makeButton('导出', () => this.handleExport()));
    actions.appendChild(this.makeButton('导入', () => this.handleImport()));
    actions.appendChild(this.makeButton('删除', () => this.handleDelete(), 'danger'));
    root.appendChild(actions);
  }

  private renderGroup(
    title: string,
    themes: ThemeJson[],
    currentId: string,
    isSystem: boolean
  ): HTMLElement {
    const group = document.createElement('div');
    group.className = 'am-list-group';
    const titleEl = document.createElement('div');
    titleEl.className = 'am-list-group-title';
    titleEl.textContent = title;
    group.appendChild(titleEl);

    if (themes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'am-list-empty';
      empty.textContent = '（无）';
      group.appendChild(empty);
      return group;
    }

    for (const theme of themes) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `am-list-item ${theme.id === currentId ? 'active' : ''} ${isSystem ? 'system' : ''}`;
      item.innerHTML = `
        <span class="am-list-item-name">${escapeHtml(theme.name)}</span>
        <span class="am-list-item-id">${escapeHtml(theme.id)}${isSystem ? ' 🔒' : ''}</span>
      `;
      item.addEventListener('click', () => this.app.setCurrentThemeId(theme.id));
      group.appendChild(item);
    }

    return group;
  }

  private makeButton(label: string, onClick: () => void, variant?: 'danger'): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `am-btn ${variant ?? ''}`.trim();
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // ===== 操作 =====

  /** 新建主题：基于 classic 模板复制 */
  private async handleCreate(): Promise<void> {
    const baseTemplate = this.app.getSystemThemes().find((t) => t.id === 'classic');
    if (!baseTemplate) return;
    await this.cloneAs(baseTemplate, {
      title: '新建主题',
      hint: '将基于「经典版」模板复制一份',
      defaultId: this.suggestId('my_theme'),
      defaultName: (id) => id,
      description: () => '基于 classic 的自定义主题',
    });
  }

  /** 复制当前主题为新主题 */
  private async handleDuplicate(): Promise<void> {
    const current = this.app.getCurrentTheme();
    await this.cloneAs(current, {
      title: '复制当前主题',
      hint: `将基于「${current.name}」（${current.id}）复制一份`,
      defaultId: this.suggestId(`${current.id}_copy`),
      defaultName: () => `${current.name} 副本`,
      description: (src) => src.description,
    });
  }

  /** 在 prefix 基础上找最小未占用后缀：prefix / prefix_2 / prefix_3 … */
  private suggestId(prefix: string): string {
    if (!this.findConflict(prefix)) return prefix;
    for (let i = 2; i < 1000; i++) {
      const candidate = `${prefix}_${i}`;
      if (!this.findConflict(candidate)) return candidate;
    }
    return `${prefix}_${Date.now()}`;
  }

  /** 共享：拷贝 source 主题，弹窗取新 id/name 并写入 store */
  private async cloneAs(
    source: ThemeJson,
    opts: {
      title: string;
      hint: string;
      defaultId: string;
      defaultName: (newId: string) => string;
      description: (src: ThemeJson) => string;
    }
  ): Promise<void> {
    const result = await this.openThemeDialog({
      title: opts.title,
      hint: opts.hint,
      defaultId: opts.defaultId,
      defaultName: opts.defaultName,
    });
    if (!result) return;
    const copy = deepClone(source);
    copy.id = result.id;
    copy.name = result.name;
    copy.description = opts.description(source);
    this.app.getStore().addOrUpdate(copy);
    this.app.setCurrentThemeId(result.id);
  }

  /** UI 弹窗：填写主题 ID + 显示名，返回 null 表示取消 */
  private openThemeDialog(opts: {
    title: string;
    hint: string;
    defaultId: string;
    defaultName: (newId: string) => string;
  }): Promise<{ id: string; name: string } | null> {
    return new Promise((resolve) => {
      const mask = document.createElement('div');
      mask.className = 'am-dialog-mask';
      mask.innerHTML = `
        <div class="am-dialog" role="dialog" aria-modal="true">
          <div class="am-dialog-title">${escapeHtml(opts.title)}</div>
          <div class="am-dialog-hint">${escapeHtml(opts.hint)}</div>
          <label class="am-dialog-field">
            <span>主题 ID</span>
            <input class="am-dialog-id" type="text" maxlength="40" autocomplete="off"
                   placeholder="小写字母 / 数字 / 下划线，1-40 字符">
          </label>
          <label class="am-dialog-field">
            <span>显示名</span>
            <input class="am-dialog-name" type="text" maxlength="60" autocomplete="off"
                   placeholder="显示在主题列表的中文名">
          </label>
          <div class="am-dialog-error" aria-live="polite"></div>
          <div class="am-dialog-actions">
            <button type="button" class="am-btn am-dialog-cancel">取消</button>
            <button type="button" class="am-btn primary am-dialog-confirm">确定</button>
          </div>
        </div>
      `;
      document.body.appendChild(mask);

      const idInput = mask.querySelector<HTMLInputElement>('.am-dialog-id')!;
      const nameInput = mask.querySelector<HTMLInputElement>('.am-dialog-name')!;
      const errorEl = mask.querySelector<HTMLDivElement>('.am-dialog-error')!;
      const confirmBtn = mask.querySelector<HTMLButtonElement>('.am-dialog-confirm')!;
      const cancelBtn = mask.querySelector<HTMLButtonElement>('.am-dialog-cancel')!;

      // 预填默认 ID + 同步显示名
      idInput.value = opts.defaultId;
      nameInput.value = opts.defaultName(opts.defaultId);

      const showError = (msg: string) => { errorEl.textContent = msg; };
      // ID 变化时联动同步显示名占位
      idInput.addEventListener('input', () => {
        if (!nameInput.dataset.dirty) nameInput.value = opts.defaultName(idInput.value.trim());
        showError('');
      });
      nameInput.addEventListener('input', () => { nameInput.dataset.dirty = '1'; });

      const close = (value: { id: string; name: string } | null) => {
        mask.remove();
        resolve(value);
      };
      const onSubmit = () => {
        const id = idInput.value.trim();
        const name = nameInput.value.trim();
        if (!id) return showError('请输入主题 ID');
        if (!ID_REGEX.test(id)) return showError('ID 必须由小写字母、数字、下划线组成，长度 1-40');
        if (this.findConflict(id)) return showError(`主题 ID "${id}" 已存在`);
        if (!name) return showError('请输入显示名');
        close({ id, name });
      };

      confirmBtn.addEventListener('click', onSubmit);
      cancelBtn.addEventListener('click', () => close(null));
      mask.addEventListener('click', (e) => { if (e.target === mask) close(null); });
      mask.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close(null);
        else if (e.key === 'Enter') onSubmit();
      });
      setTimeout(() => { idInput.focus(); idInput.select(); }, 0);
    });
  }

  private handleExport(): void {
    const theme = this.app.getCurrentTheme();
    const json = this.app.getStore().exportThemeJson(theme);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${theme.id}.theme.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private handleImport(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      let raw: string;
      try {
        raw = await file.text();
      } catch (e) {
        alert(`读取失败：${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      let theme: ThemeJson;
      try {
        theme = this.app.getStore().importThemeJson(raw);
      } catch (e) {
        alert(`导入失败（文件损坏或格式错误）：\n${e instanceof Error ? e.message : String(e)}`);
        return;
      }

      const conflict = this.findConflict(theme.id);
      if (conflict === 'system') {
        alert(`主题 ID "${theme.id}" 与系统主题冲突，请修改后重新导入`);
        return;
      }
      if (conflict === 'custom') {
        const choice = window.prompt(
          `已存在自定义主题 "${theme.id}"，请输入：\n  o = 覆盖\n  c = 导入为副本\n  其他 = 取消`,
          'o'
        );
        if (choice === 'o') {
          this.app.getStore().addOrUpdate(theme);
        } else if (choice === 'c') {
          let suffix = 2;
          while (this.findConflict(`${theme.id}_${suffix}`)) suffix++;
          theme.id = `${theme.id}_${suffix}`;
          theme.name = `${theme.name} (副本)`;
          this.app.getStore().addOrUpdate(theme);
        } else {
          return;
        }
      } else {
        this.app.getStore().addOrUpdate(theme);
      }
      this.app.setCurrentThemeId(theme.id);
    });
    input.click();
  }

  private handleDelete(): void {
    const current = this.app.getCurrentTheme();
    if (this.app.isReadonly(current.id)) {
      alert('系统主题不能删除');
      return;
    }
    if (!confirm(`确认删除主题 "${current.name}"（${current.id}）？此操作不可撤销。`)) return;
    this.app.getStore().remove(current.id);
    const fallback = this.app.getSystemThemes()[0]!.id;
    this.app.setCurrentThemeId(fallback);
  }

  private findConflict(id: string): 'system' | 'custom' | null {
    if (this.app.getSystemThemes().some((t) => t.id === id)) return 'system';
    if (this.app.getCustomThemes().some((t) => t.id === id)) return 'custom';
    return null;
  }

}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
