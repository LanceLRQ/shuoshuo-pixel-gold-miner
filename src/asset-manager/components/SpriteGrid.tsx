import { useEffect, useMemo, useRef, useState } from 'react';
import { Film, ImageUp, Search } from 'lucide-react';

import {
  pixelMapToSpriteJson,
  spriteJsonToPixelMap,
  type SpriteJson,
  type ThemeJson,
} from '../../assets/themeLoader';
import { createSpriteCache } from '../../assets/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getSpriteLabel } from '../spriteLabels';
import { PixelEditorDialog } from './PixelEditorDialog';

const THUMBNAIL_SIZE = 96;

interface Props {
  theme: ThemeJson;
  readonly: boolean;
  onCommitSprite: (name: string, sprite: SpriteJson) => void;
}

export function SpriteGrid({ theme, readonly, onCommitSprite }: Props) {
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const names = useMemo(() => Object.keys(theme.sprites).sort(), [theme]);
  const keyword = filter.trim().toLowerCase();
  const visible = useMemo(
    () =>
      keyword
        ? names.filter((n) => n.toLowerCase().includes(keyword))
        : names,
    [names, keyword]
  );

  const handleClick = (name: string) => {
    if (readonly) {
      alert('系统主题只读，请先「复制」或「新建」一个自定义主题再编辑');
      return;
    }
    setEditing(name);
  };

  const editingSprite =
    editing !== null ? (theme.sprites[editing] ?? null) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="搜索 sprite 名（如 GOLD、MINER）"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5 rounded-md border border-dashed border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          <ImageUp className="h-3.5 w-3.5" />
          <span>点击 sprite 卡片可上传图片/GIF 替换；GIF 自动解帧为动画 sprite</span>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {keyword ? '没有匹配的 sprite' : '当前主题没有 sprite'}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
          {visible.map((name) => (
            <SpriteCard
              key={`${theme.id}-${name}`}
              name={name}
              sprite={theme.sprites[name]!}
              readonly={readonly}
              onClick={() => handleClick(name)}
            />
          ))}
        </div>
      )}

      <PixelEditorDialog
        open={editing !== null}
        spriteName={editing ?? ''}
        sprite={editingSprite}
        onClose={() => setEditing(null)}
        onApply={(pixels, meta) => {
          if (!editing || !editingSprite) return;
          try {
            const next = pixelMapToSpriteJson(pixels, editingSprite.scale, meta);
            onCommitSprite(editing, next);
          } catch (e) {
            alert(
              `应用失败：${e instanceof Error ? e.message : String(e)}`
            );
          }
          setEditing(null);
        }}
      />
    </div>
  );
}

interface CardProps {
  name: string;
  sprite: SpriteJson;
  readonly: boolean;
  onClick: () => void;
}

function SpriteCard({ name, sprite, readonly, onClick }: CardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const label = getSpriteLabel(name);
  const frameCount = sprite.frameCount && sprite.frameCount > 1 ? sprite.frameCount : 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const pixels = spriteJsonToPixelMap(name, sprite);
      const cached = createSpriteCache(pixels, sprite.scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      // 动画 sprite 只渲染第一帧（cached 是横向拼接 spritesheet）
      const frameW = cached.width / frameCount;
      const sourceW = frameW;
      const sourceH = cached.height;
      const scale = Math.min(THUMBNAIL_SIZE / sourceW, THUMBNAIL_SIZE / sourceH);
      const drawW = sourceW * scale;
      const drawH = sourceH * scale;
      const dx = (THUMBNAIL_SIZE - drawW) / 2;
      const dy = (THUMBNAIL_SIZE - drawH) / 2;
      ctx.drawImage(cached, 0, 0, sourceW, sourceH, dx, dy, drawW, drawH);
    } catch (e) {
      console.warn(`sprite "${name}" 缩略图生成失败`, e);
    }
  }, [name, sprite, frameCount]);

  return (
    <Card
      role="button"
      tabIndex={readonly ? -1 : 0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!readonly && (e.key === 'Enter' || e.key === ' ')) onClick();
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-2 p-3 transition-colors',
        'hover:border-ring hover:bg-accent/40',
        readonly && 'cursor-not-allowed opacity-70 hover:border-border hover:bg-card'
      )}
    >
      <div className="bg-checkerboard relative flex h-24 w-24 items-center justify-center rounded">
        <canvas
          ref={canvasRef}
          width={THUMBNAIL_SIZE}
          height={THUMBNAIL_SIZE}
          className="pixelated"
        />
        {frameCount > 1 && (
          <Badge
            variant="secondary"
            className="absolute right-1 top-1 gap-1 px-1.5 py-0 text-[10px]"
            title={`动画 sprite — ${frameCount} 帧`}
          >
            <Film className="h-3 w-3" />
            {frameCount}
          </Badge>
        )}
      </div>
      <div className="w-full break-all text-center font-mono text-[11px] text-foreground">
        {name}
      </div>
      {label && (
        <div className="text-center text-xs text-muted-foreground">
          {label}
        </div>
      )}
    </Card>
  );
}
