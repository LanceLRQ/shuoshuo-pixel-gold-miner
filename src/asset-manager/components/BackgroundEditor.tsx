import { useEffect, useMemo, useState } from 'react';
import { Save, Undo2 } from 'lucide-react';

import type { ThemeJson } from '../../assets/themeLoader';
import type { BackgroundColors } from '../../assets/theme/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BACKGROUND_COLOR_KEYS } from '../ThemeStore';

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

interface Props {
  theme: ThemeJson;
  readonly: boolean;
  onCommit: (background: BackgroundColors) => void;
}

export function BackgroundEditor({ theme, readonly, onCommit }: Props) {
  const [draft, setDraft] = useState<BackgroundColors>(() => ({
    ...theme.background,
  }));

  /** 切换主题时重置 draft */
  useEffect(() => {
    setDraft({ ...theme.background });
  }, [theme.id, theme.background]);

  const dirty = useMemo(
    () => BACKGROUND_COLOR_KEYS.some((k) => draft[k] !== theme.background[k]),
    [draft, theme.background]
  );

  const updateField = (key: keyof BackgroundColors, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  return (
    <div className="space-y-4">
      {readonly && (
        <Alert>
          <AlertDescription>
            系统主题只读：可查看背景色但不可修改，复制为自定义主题后再编辑。
          </AlertDescription>
        </Alert>
      )}

      <div className="grid max-w-3xl grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
        {BACKGROUND_COLOR_KEYS.map((key) => (
          <ColorField
            key={key}
            keyName={key}
            value={draft[key]}
            readonly={readonly}
            onChange={(v) => updateField(key, v)}
          />
        ))}
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => onCommit(draft)}
          disabled={readonly || !dirty}
        >
          <Save />
          {dirty ? '保存（有未保存改动）' : '保存'}
        </Button>
        <Button
          variant="outline"
          onClick={() => setDraft({ ...theme.background })}
          disabled={readonly || !dirty}
        >
          <Undo2 />
          放弃改动
        </Button>
      </div>
    </div>
  );
}

interface FieldProps {
  keyName: keyof BackgroundColors;
  value: string;
  readonly: boolean;
  onChange: (v: string) => void;
}

function ColorField({ keyName, value, readonly, onChange }: FieldProps) {
  const normalized = HEX_REGEX.test(value) ? value : '#000000';
  return (
    <div className="grid grid-cols-[1fr_44px_120px] items-center gap-2">
      <Label className="text-[13px] text-foreground">
        {LABEL_MAP[keyName]}{' '}
        <span className="font-mono text-[10px] text-muted-foreground">
          ({keyName})
        </span>
      </Label>
      <input
        type="color"
        value={normalized}
        disabled={readonly}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-9 w-11 cursor-pointer rounded border border-input bg-background disabled:cursor-not-allowed disabled:opacity-50"
      />
      <Input
        value={value}
        maxLength={7}
        disabled={readonly}
        className="h-9 font-mono text-xs"
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (!HEX_REGEX.test(v)) {
            alert(`无效的 hex 颜色：${v}（需 #RRGGBB 格式）`);
            onChange(normalized);
            return;
          }
          onChange(v.toUpperCase());
        }}
      />
    </div>
  );
}
