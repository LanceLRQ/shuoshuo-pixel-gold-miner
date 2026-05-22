import { useCallback, useMemo, useState } from 'react';

import classicJson from '../../assets/themes/classic.json';
import shuoshuoCrystalJson from '../../assets/themes/shuoshuo-crystal.json';
import type { ThemeJson, SpriteJson } from '../../assets/themeLoader';
import { SYSTEM_THEME_IDS, ThemeStore } from '../ThemeStore';
import { applyDisplayPreset } from '../spritePresets';

const SYSTEM_THEMES: ThemeJson[] = [
  shuoshuoCrystalJson as ThemeJson,
  classicJson as ThemeJson,
];

/** 响应式封装 ThemeStore：暴露 system/custom 主题数组与 mutation actions */
export function useThemeStore() {
  const storeRef = useState(() => new ThemeStore())[0];
  const [customThemes, setCustomThemes] = useState<ThemeJson[]>(() =>
    storeRef.loadCustom()
  );

  /** 写回 store 并同步本地状态 */
  const refresh = useCallback(() => {
    setCustomThemes(storeRef.loadCustom());
  }, [storeRef]);

  const allThemes = useMemo<ThemeJson[]>(
    () => [...SYSTEM_THEMES, ...customThemes],
    [customThemes]
  );

  const isReadonly = useCallback(
    (id: string) => SYSTEM_THEME_IDS.includes(id),
    []
  );

  const addOrUpdate = useCallback(
    (theme: ThemeJson) => {
      storeRef.addOrUpdate(theme);
      refresh();
    },
    [storeRef, refresh]
  );

  const remove = useCallback(
    (id: string) => {
      storeRef.remove(id);
      refresh();
    },
    [storeRef, refresh]
  );

  /** 在指定主题上替换单个 sprite，并持久化（缺 displayWidth/Height 时按预设兜底） */
  const commitSprite = useCallback(
    (theme: ThemeJson, name: string, sprite: SpriteJson) => {
      if (isReadonly(theme.id)) return;
      const safeSprite = applyDisplayPreset(name, sprite);
      addOrUpdate({
        ...theme,
        sprites: { ...theme.sprites, [name]: safeSprite },
      });
    },
    [addOrUpdate, isReadonly]
  );

  /**
   * 一次性替换多个 sprite，并持久化。
   *
   * 单次提交避免连续调用 commitSprite 时闭包覆盖：循环调 commitSprite 时每次都基于
   * 闭包里的旧 theme.sprites 拼新对象，前 N-1 次的更新会被最后一次的"...旧 sprites"覆盖。
   */
  const commitSprites = useCallback(
    (theme: ThemeJson, updates: Record<string, SpriteJson>) => {
      if (isReadonly(theme.id)) return;
      const newSprites = { ...theme.sprites };
      for (const [name, sprite] of Object.entries(updates)) {
        newSprites[name] = applyDisplayPreset(name, sprite);
      }
      addOrUpdate({ ...theme, sprites: newSprites });
    },
    [addOrUpdate, isReadonly]
  );

  /** 替换主题背景色，并持久化 */
  const commitBackground = useCallback(
    (theme: ThemeJson, background: ThemeJson['background']) => {
      if (isReadonly(theme.id)) return;
      addOrUpdate({ ...theme, background: { ...background } });
    },
    [addOrUpdate, isReadonly]
  );

  return {
    store: storeRef,
    systemThemes: SYSTEM_THEMES,
    customThemes,
    allThemes,
    isReadonly,
    addOrUpdate,
    remove,
    commitSprite,
    commitSprites,
    commitBackground,
  };
}

export type UseThemeStoreReturn = ReturnType<typeof useThemeStore>;
