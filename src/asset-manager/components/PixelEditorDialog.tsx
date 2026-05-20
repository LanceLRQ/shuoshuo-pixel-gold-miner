import { useEffect, useMemo, useRef } from 'react';

import {
  spriteJsonToPixelMap,
  type SpriteJson,
} from '../../assets/themeLoader';
import type { PixelMap } from '../../assets/types';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { getSpriteLabel } from '../spriteLabels';
import { SPRITE_DEFAULT_DISPLAY, applyDisplayPreset } from '../spritePresets';

/** sprite 元信息（可选；frameCount 缺省/=1 表示静态 sprite；displayWidth/Height 缺省 = 源帧 1:1 显示） */
export interface AnimationMeta {
  frameCount?: number;
  frameDurationMs?: number;
  frameLoop?: boolean;
  displayWidth?: number;
  displayHeight?: number;
}

interface Props {
  open: boolean;
  spriteName: string;
  sprite: SpriteJson | null;
  onClose: () => void;
  onApply: (pixels: PixelMap, meta?: AnimationMeta) => void;
}

/** 嵌入 pixel-converter.html 的全屏 iframe 编辑器，通过 postMessage 双向通信 */
export function PixelEditorDialog({
  open,
  spriteName,
  sprite,
  onClose,
  onApply,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const initialPixels = useMemo<PixelMap | null>(() => {
    if (!sprite || !spriteName) return null;
    try {
      return spriteJsonToPixelMap(spriteName, sprite);
    } catch (e) {
      console.warn('sprite 解析失败，跳过初始像素', e);
      return null;
    }
  }, [sprite, spriteName]);

  const label = getSpriteLabel(spriteName);

  /** 监听 iframe → 外部 的 postMessage */
  useEffect(() => {
    if (!open) return;
    const handler = (ev: MessageEvent) => {
      if (ev.origin !== location.origin) return;
      const msg = ev.data;
      if (!msg || typeof msg.type !== 'string') return;
      switch (msg.type) {
        case 'ready': {
          if (initialPixels && iframeRef.current?.contentWindow) {
            // 把旧 sprite 的动画元信息 + 显示尺寸一并 init 推给 iframe，便于用户 apply 时带回去
            const initMsg: Record<string, unknown> = { type: 'init', pixels: initialPixels };
            if (sprite?.frameCount && sprite.frameCount > 1) {
              initMsg.frameCount = sprite.frameCount;
              if (typeof sprite.frameDurationMs === 'number') initMsg.frameDurationMs = sprite.frameDurationMs;
              if (typeof sprite.frameLoop === 'boolean') initMsg.frameLoop = sprite.frameLoop;
            }
            if (typeof sprite?.displayWidth === 'number') initMsg.displayWidth = sprite.displayWidth;
            if (typeof sprite?.displayHeight === 'number') initMsg.displayHeight = sprite.displayHeight;
            // 系统预设尺寸（独立于 sprite 自身字段）：pixel-converter 用作比例约束 + 默认填充值
            const preset = SPRITE_DEFAULT_DISPLAY[spriteName];
            if (preset) {
              initMsg.presetDisplayWidth = preset.displayWidth;
              initMsg.presetDisplayHeight = preset.displayHeight;
            }
            iframeRef.current.contentWindow.postMessage(initMsg, location.origin);
          }
          break;
        }
        case 'apply': {
          if (Array.isArray(msg.pixels)) {
            const hasAnim = typeof msg.frameCount === 'number' && msg.frameCount > 1;
            let meta: AnimationMeta = {};
            if (hasAnim) {
              meta.frameCount = msg.frameCount;
              if (typeof msg.frameDurationMs === 'number') meta.frameDurationMs = msg.frameDurationMs;
              if (typeof msg.frameLoop === 'boolean') meta.frameLoop = msg.frameLoop;
            }
            if (typeof msg.displayWidth === 'number' && msg.displayWidth > 0) {
              meta.displayWidth = msg.displayWidth;
            }
            if (typeof msg.displayHeight === 'number' && msg.displayHeight > 0) {
              meta.displayHeight = msg.displayHeight;
            }
            // 兜底：缺 displayWidth/Height 时按系统预设自动填充
            meta = applyDisplayPreset(spriteName, meta);
            const hasMeta = Object.keys(meta).length > 0;
            onApply(msg.pixels as PixelMap, hasMeta ? meta : undefined);
          }
          break;
        }
        case 'cancel': {
          onClose();
          break;
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [open, initialPixels, sprite, onApply, onClose]);

  const src = useMemo(() => {
    if (!spriteName) return '';
    const params = new URLSearchParams({ embed: '1', sprite: spriteName });
    if (label) params.set('label', label);
    return `/tools/pixel-converter.html?${params.toString()}`;
  }, [spriteName, label]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="flex h-[92vh] w-[96vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-lg"
      >
        <div className="flex flex-shrink-0 items-center gap-2 border-b bg-card/60 px-4 py-2.5 text-sm">
          <span>编辑 sprite:</span>
          <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
            {spriteName}
          </code>
          {label && (
            <span className="text-xs text-muted-foreground">（{label}）</span>
          )}
          <DialogTitle className="sr-only">编辑 sprite {spriteName}</DialogTitle>
        </div>
        {open && (
          <iframe
            ref={iframeRef}
            title="像素编辑器"
            src={src}
            className="flex-1 border-0 bg-white"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
