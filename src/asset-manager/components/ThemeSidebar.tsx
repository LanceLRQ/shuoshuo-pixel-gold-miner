import { useCallback, useState } from 'react';
import {
  Copy,
  Download,
  Lock,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';

import type { ThemeJson } from '../../assets/themeLoader';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { UseThemeStoreReturn } from '../hooks/useThemeStore';
import { ThemeFormDialog } from './ThemeFormDialog';
import { ImportConflictDialog } from './ImportConflictDialog';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  store: UseThemeStoreReturn;
  currentThemeId: string;
  currentTheme: ThemeJson;
  onSelect: (id: string) => void;
}

type FormMode =
  | { kind: 'create' }
  | { kind: 'duplicate'; source: ThemeJson }
  | null;

export function ThemeSidebar({
  store,
  currentThemeId,
  currentTheme,
  onSelect,
}: Props) {
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [conflictTheme, setConflictTheme] = useState<ThemeJson | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /** 在主题集合内查找 ID 冲突 */
  const findConflict = useCallback(
    (id: string): 'system' | 'custom' | null => {
      if (store.systemThemes.some((t) => t.id === id)) return 'system';
      if (store.customThemes.some((t) => t.id === id)) return 'custom';
      return null;
    },
    [store.systemThemes, store.customThemes]
  );

  /** 在 prefix 基础上找最小未占用后缀：prefix / prefix_2 / prefix_3 … */
  const suggestId = useCallback(
    (prefix: string): string => {
      if (!findConflict(prefix)) return prefix;
      for (let i = 2; i < 1000; i++) {
        const candidate = `${prefix}_${i}`;
        if (!findConflict(candidate)) return candidate;
      }
      return `${prefix}_${Date.now()}`;
    },
    [findConflict]
  );

  const handleConfirmForm = useCallback(
    (id: string, name: string) => {
      if (!formMode) return;
      const source =
        formMode.kind === 'create'
          ? store.systemThemes.find((t) => t.id === 'classic')!
          : formMode.source;
      const description =
        formMode.kind === 'create'
          ? '基于 classic 的自定义主题'
          : source.description;
      const copy: ThemeJson = JSON.parse(JSON.stringify(source));
      copy.id = id;
      copy.name = name;
      copy.description = description;
      store.addOrUpdate(copy);
      onSelect(id);
      setFormMode(null);
    },
    [formMode, store, onSelect]
  );

  const handleExport = useCallback(() => {
    const json = store.store.exportThemeJson(currentTheme);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${currentTheme.id}.theme.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [store.store, currentTheme]);

  const handleImport = useCallback(() => {
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
        theme = store.store.importThemeJson(raw);
      } catch (e) {
        alert(
          `导入失败（文件损坏或格式错误）：\n${e instanceof Error ? e.message : String(e)}`
        );
        return;
      }
      const conflict = findConflict(theme.id);
      if (conflict === 'system') {
        alert(`主题 ID "${theme.id}" 与系统主题冲突，请修改后重新导入`);
        return;
      }
      if (conflict === 'custom') {
        setConflictTheme(theme);
        return;
      }
      store.addOrUpdate(theme);
      onSelect(theme.id);
    });
    input.click();
  }, [store, findConflict, onSelect]);

  const handleConflictResolve = useCallback(
    (action: 'overwrite' | 'duplicate' | 'cancel') => {
      const theme = conflictTheme;
      setConflictTheme(null);
      if (!theme || action === 'cancel') return;
      if (action === 'overwrite') {
        store.addOrUpdate(theme);
        onSelect(theme.id);
        return;
      }
      // duplicate
      let suffix = 2;
      while (findConflict(`${theme.id}_${suffix}`)) suffix++;
      const cloned: ThemeJson = {
        ...theme,
        id: `${theme.id}_${suffix}`,
        name: `${theme.name} (副本)`,
      };
      store.addOrUpdate(cloned);
      onSelect(cloned.id);
    },
    [conflictTheme, store, findConflict, onSelect]
  );

  const handleDelete = useCallback(() => {
    if (store.isReadonly(currentTheme.id)) {
      alert('系统主题不能删除');
      return;
    }
    setConfirmDelete(true);
  }, [store, currentTheme.id]);

  const handleConfirmDelete = useCallback(() => {
    setConfirmDelete(false);
    store.remove(currentTheme.id);
    onSelect(store.systemThemes[0]!.id);
  }, [store, currentTheme.id, onSelect]);

  const readonlyCurrent = store.isReadonly(currentTheme.id);

  return (
    <>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          <ThemeGroup title="系统主题">
            {store.systemThemes.length === 0 ? (
              <Empty />
            ) : (
              store.systemThemes.map((t) => (
                <ThemeItem
                  key={t.id}
                  theme={t}
                  active={t.id === currentThemeId}
                  system
                  onClick={() => onSelect(t.id)}
                />
              ))
            )}
          </ThemeGroup>

          <ThemeGroup title="自定义主题">
            {store.customThemes.length === 0 ? (
              <Empty />
            ) : (
              store.customThemes.map((t) => (
                <ThemeItem
                  key={t.id}
                  theme={t}
                  active={t.id === currentThemeId}
                  onClick={() => onSelect(t.id)}
                />
              ))
            )}
          </ThemeGroup>
        </div>
      </ScrollArea>

      <Separator />

      <div className="flex flex-col gap-2 p-3">
        <Button
          variant="default"
          size="sm"
          className="justify-start"
          onClick={() => setFormMode({ kind: 'create' })}
        >
          <Plus />
          新建主题
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="justify-start"
          onClick={() => setFormMode({ kind: 'duplicate', source: currentTheme })}
        >
          <Copy />
          复制当前
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="justify-start"
          onClick={handleExport}
        >
          <Download />
          导出
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="justify-start"
          onClick={handleImport}
        >
          <Upload />
          导入
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="justify-start"
          disabled={readonlyCurrent}
          onClick={handleDelete}
        >
          <Trash2 />
          删除
        </Button>
      </div>

      <ThemeFormDialog
        mode={formMode}
        suggestId={suggestId}
        findConflict={findConflict}
        onCancel={() => setFormMode(null)}
        onConfirm={handleConfirmForm}
      />

      <ImportConflictDialog
        theme={conflictTheme}
        onResolve={handleConflictResolve}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="删除主题"
        description={`确认删除主题 "${currentTheme.name}"（${currentTheme.id}）？此操作不可撤销。`}
        confirmLabel="删除"
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

function ThemeGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Empty() {
  return (
    <div className="px-2 py-1 text-xs text-muted-foreground/60">（无）</div>
  );
}

function ThemeItem({
  theme,
  active,
  system,
  onClick,
}: {
  theme: ThemeJson;
  active: boolean;
  system?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full flex-col items-start gap-0.5 rounded-md border border-transparent px-2.5 py-1.5 text-left transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        active && 'border-border bg-accent text-accent-foreground'
      )}
    >
      <span className="text-[13px] font-medium leading-tight">{theme.name}</span>
      <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
        {theme.id}
        {system && <Lock className="h-3 w-3" />}
      </span>
    </button>
  );
}
