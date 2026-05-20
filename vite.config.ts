import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

// 生产部署根路径：https://xxx.com/game/gold_miner/
// dev 服务器仍走 '/'；只有 vite build 输出会注入 /game/gold_miner/ 前缀
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/game/gold_miner/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        assets: resolve(__dirname, 'tools/assets.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
}));
