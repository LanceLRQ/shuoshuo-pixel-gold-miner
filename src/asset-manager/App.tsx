import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, Lock, Moon, Sun } from 'lucide-react';

import type { ThemeJson } from '../assets/themeLoader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SYSTEM_THEME_IDS } from './ThemeStore';
import { useColorScheme } from './hooks/useColorScheme';
import { useThemeStore } from './hooks/useThemeStore';
import { ThemeSidebar } from './components/ThemeSidebar';
import { SpriteGrid } from './components/SpriteGrid';
import { BackgroundEditor } from './components/BackgroundEditor';

type Tab = 'sprites' | 'background';

export function App() {
  const themeStore = useThemeStore();
  const { scheme, toggle: toggleScheme } = useColorScheme();
  const [currentThemeId, setCurrentThemeIdRaw] = useState<string>(
    SYSTEM_THEME_IDS[0]!
  );
  const [currentTab, setCurrentTab] = useState<Tab>('sprites');

  // 跨标签场景：本地选中的主题在另一标签被删除 → 回退到首个系统主题
  const currentTheme = useMemo<ThemeJson>(() => {
    const found = themeStore.allThemes.find((t) => t.id === currentThemeId);
    return found ?? themeStore.allThemes[0]!;
  }, [themeStore.allThemes, currentThemeId]);

  const setCurrentThemeId = useCallback(
    (id: string) => {
      setCurrentThemeIdRaw(id);
    },
    []
  );

  const readonly = themeStore.isReadonly(currentTheme.id);

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="flex flex-shrink-0 items-center gap-4 border-b bg-card px-5 py-2.5">
        <Button asChild variant="outline" size="sm">
          <a href="./index.html">
            <ArrowLeft />
            返回游戏
          </a>
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-base font-semibold">素材管理</h1>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto"
          onClick={toggleScheme}
          aria-label={scheme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
          title={scheme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
        >
          {scheme === 'dark' ? <Sun /> : <Moon />}
        </Button>
      </header>

      <div className="grid flex-1 grid-cols-[260px_1fr] overflow-hidden">
        <aside className="flex flex-col overflow-hidden border-r bg-card/30">
          <ThemeSidebar
            store={themeStore}
            currentThemeId={currentTheme.id}
            currentTheme={currentTheme}
            onSelect={setCurrentThemeId}
          />
        </aside>

        <section className="flex flex-col overflow-hidden">
          <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b bg-card/40 px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">{currentTheme.name}</span>
              <code className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {currentTheme.id}
              </code>
              {readonly && (
                <Badge variant="secondary" className="gap-1">
                  <Lock className="h-3 w-3" />
                  系统主题（只读）
                </Badge>
              )}
            </div>
            <Tabs
              value={currentTab}
              onValueChange={(v) => setCurrentTab(v as Tab)}
            >
              <TabsList>
                <TabsTrigger value="sprites">Sprites</TabsTrigger>
                <TabsTrigger value="background">背景色</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex-1 overflow-auto p-5">
            {currentTab === 'sprites' ? (
              <SpriteGrid
                theme={currentTheme}
                readonly={readonly}
                onCommitSprite={(name, sprite) =>
                  themeStore.commitSprite(currentTheme, name, sprite)
                }
              />
            ) : (
              <BackgroundEditor
                theme={currentTheme}
                readonly={readonly}
                onCommit={(bg) =>
                  themeStore.commitBackground(currentTheme, bg)
                }
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
