import { useEffect, useState } from 'react';

import type { ThemeJson } from '../../assets/themeLoader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ID_REGEX = /^[a-z0-9_]{1,40}$/i;

type Mode =
  | { kind: 'create' }
  | { kind: 'duplicate'; source: ThemeJson }
  | null;

interface Props {
  mode: Mode;
  suggestId: (prefix: string) => string;
  findConflict: (id: string) => 'system' | 'custom' | null;
  onCancel: () => void;
  onConfirm: (id: string, name: string) => void;
}

export function ThemeFormDialog({
  mode,
  suggestId,
  findConflict,
  onCancel,
  onConfirm,
}: Props) {
  const open = mode !== null;
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [nameDirty, setNameDirty] = useState(false);
  const [error, setError] = useState('');

  /** mode 变化时初始化默认值（避免清空再点开看到旧内容） */
  useEffect(() => {
    if (!mode) return;
    const defaultId =
      mode.kind === 'create'
        ? suggestId('my_theme')
        : suggestId(`${mode.source.id}_copy`);
    const defaultName =
      mode.kind === 'create' ? defaultId : `${mode.source.name} 副本`;
    setId(defaultId);
    setName(defaultName);
    setNameDirty(false);
    setError('');
  }, [mode, suggestId]);

  const title = !mode
    ? ''
    : mode.kind === 'create'
      ? '新建主题'
      : '复制当前主题';
  const hint = !mode
    ? ''
    : mode.kind === 'create'
      ? '将基于「经典版」模板复制一份'
      : `将基于「${mode.source.name}」（${mode.source.id}）复制一份`;

  const submit = () => {
    const trimId = id.trim();
    const trimName = name.trim();
    if (!trimId) return setError('请输入主题 ID');
    if (!ID_REGEX.test(trimId))
      return setError('ID 必须由小写字母、数字、下划线组成，长度 1-40');
    if (findConflict(trimId)) return setError(`主题 ID "${trimId}" 已存在`);
    if (!trimName) return setError('请输入显示名');
    onConfirm(trimId, trimName);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{hint}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="theme-id">主题 ID</Label>
            <Input
              id="theme-id"
              autoFocus
              placeholder="小写字母 / 数字 / 下划线，1-40 字符"
              maxLength={40}
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                if (!nameDirty) setName(e.target.value.trim());
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="theme-name">显示名</Label>
            <Input
              id="theme-name"
              placeholder="显示在主题列表的中文名"
              maxLength={60}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameDirty(true);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={submit}>确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
