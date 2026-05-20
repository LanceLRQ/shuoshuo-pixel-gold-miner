import { useCallback, useEffect, useState } from 'react';

export type ColorScheme = 'light' | 'dark';

const STORAGE_KEY = 'goldminer_asset_color_scheme';

function readInitial(): ColorScheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage 不可用（隐私模式 / 跨源 iframe）回退默认
  }
  return 'dark';
}

/** 同步 <html class="dark"> 与 localStorage 持久化的主题切换 hook */
export function useColorScheme() {
  const [scheme, setSchemeState] = useState<ColorScheme>(readInitial);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle('dark', scheme === 'dark');
    html.classList.toggle('light', scheme === 'light');
    html.style.colorScheme = scheme;
    try {
      localStorage.setItem(STORAGE_KEY, scheme);
    } catch {
      // 忽略写入失败
    }
  }, [scheme]);

  const toggle = useCallback(() => {
    setSchemeState((s) => (s === 'dark' ? 'light' : 'dark'));
  }, []);

  return { scheme, toggle, setScheme: setSchemeState };
}
