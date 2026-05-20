import { useEffect, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';

import type { ThemeJson, SpriteJson } from '../../assets/themeLoader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { getSpriteLabel } from '../spriteLabels';
import { SPRITE_DEFAULT_DISPLAY } from '../spritePresets';

interface Props {
  open: boolean;
  /** 源 sprite 名（被复制方） */
  sourceName: string;
  theme: ThemeJson;
  onCopy: (targets: string[], makeSprite: (targetName: string) => SpriteJson) => void;
  onClose: () => void;
}

/**
 * 把当前 sprite 的素材一键复制到其他 sprite。
 *
 * 经典场景：用户给 MINER_IDLE 上传了一张图，想同步到 MINER_PULL/HAPPY/SAD/STRAIN。
 * 复制时：
 *   - pixels / palette / scale / 动画字段 直接抄
 *   - displayWidth/Height 替换为**目标 sprite 的系统预设**（不同 sprite 显示尺寸不同）
 */
export function CopySpriteDialog({ open, sourceName, theme, onCopy, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 每次打开重置选中状态
  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open, sourceName]);

  const candidates = useMemo(
    () => Object.keys(theme.sprites).filter((n) => n !== sourceName).sort(),
    [theme, sourceName]
  );

  const allSelected = candidates.length > 0 && selected.size === candidates.length;
  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(candidates));
  };

  const source = theme.sprites[sourceName];

  const handleCopy = () => {
    if (!source || selected.size === 0) return;
    onCopy(Array.from(selected), (targetName: string) => {
      const targetPreset = SPRITE_DEFAULT_DISPLAY[targetName];
      const next: SpriteJson = {
        scale: source.scale,
        palette: { ...source.palette },
        pixels: [...source.pixels],
      };
      if (source.frameCount && source.frameCount > 1) {
        next.frameCount = source.frameCount;
        if (typeof source.frameDurationMs === 'number') next.frameDurationMs = source.frameDurationMs;
        if (typeof source.frameLoop === 'boolean') next.frameLoop = source.frameLoop;
      }
      // 显示尺寸：优先用目标的系统预设；若目标不在预设表，则保留源的显示尺寸
      if (targetPreset) {
        next.displayWidth = targetPreset.displayWidth;
        next.displayHeight = targetPreset.displayHeight;
      } else {
        if (typeof source.displayWidth === 'number') next.displayWidth = source.displayWidth;
        if (typeof source.displayHeight === 'number') next.displayHeight = source.displayHeight;
      }
      return next;
    });
  };

  const sourceLabel = getSpriteLabel(sourceName);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4" />
            复制素材到其他 sprite
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-foreground">{sourceName}</span>
            {sourceLabel && <span className="text-muted-foreground">（{sourceLabel}）</span>}
            <span className="text-muted-foreground"> 的像素 / 调色板 / 动画字段会被复制到所选 sprite；目标 sprite 的显示尺寸会按系统预设自动调整。</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-sm text-muted-foreground">
            已选 {selected.size} / {candidates.length}
          </span>
          <Button variant="ghost" size="sm" onClick={toggleAll}>
            {allSelected ? '全不选' : '全选'}
          </Button>
        </div>

        <ScrollArea className="h-64 pr-3">
          <div className="space-y-1">
            {candidates.map((name) => {
              const label = getSpriteLabel(name);
              const checked = selected.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors',
                    checked ? 'bg-primary/15 hover:bg-primary/20' : 'hover:bg-accent'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border',
                      checked
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input'
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm text-foreground">{name}</div>
                    {label && (
                      <div className="text-xs text-muted-foreground">{label}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={selected.size === 0} onClick={handleCopy}>
            复制到 {selected.size} 个 sprite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
