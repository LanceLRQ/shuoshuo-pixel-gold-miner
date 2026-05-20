import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

import {
  pixelMapToSpriteJson,
  spriteJsonToPixelMap,
  type SpriteJson,
  type ThemeJson,
} from '../../assets/themeLoader';
import { createSpriteCache } from '../../assets/types';
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
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="搜索 sprite 名（如 GOLD、MINER）"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-9"
        />
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
        onApply={(pixels) => {
          if (!editing || !editingSprite) return;
          try {
            const next = pixelMapToSpriteJson(pixels, editingSprite.scale);
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
      const scale = Math.min(
        THUMBNAIL_SIZE / cached.width,
        THUMBNAIL_SIZE / cached.height
      );
      const drawW = cached.width * scale;
      const drawH = cached.height * scale;
      const dx = (THUMBNAIL_SIZE - drawW) / 2;
      const dy = (THUMBNAIL_SIZE - drawH) / 2;
      ctx.drawImage(cached, dx, dy, drawW, drawH);
    } catch (e) {
      console.warn(`sprite "${name}" 缩略图生成失败`, e);
    }
  }, [name, sprite]);

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
      <div className="bg-checkerboard flex h-24 w-24 items-center justify-center rounded">
        <canvas
          ref={canvasRef}
          width={THUMBNAIL_SIZE}
          height={THUMBNAIL_SIZE}
          className="pixelated"
        />
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
