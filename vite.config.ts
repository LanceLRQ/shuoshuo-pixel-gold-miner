import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

// 部署根路径：https://shuoshuo.sikong.ren/game/gold-miner/（与开放平台 seed entry_url 一致）
// dev 与 build 统一使用该前缀：本地 nginx 以 /game/gold-miner/ 子路径反代 dev 服务器（端口 15715），
// base 一致才能保证模块请求 / HMR ws 不漏到主站
export default defineConfig(() => ({
  base: '/game/gold-miner/',
  define: {
    // 注入 package.json version，运行时作为排行榜协议的 client_version 上报
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
    host: '127.0.0.1', // 强制 IPv4：Node 在 localhost 下可能只监听 ::1，导致 nginx 反代 127.0.0.1 时 502
    port: 15715,
    strictPort: true, // 端口被占用时直接报错，不自动漂移（nginx 反代依赖固定端口）
    open: true,
    allowedHosts: ['shuoshuo.sikong.ren'], // 放行本地 nginx 反代的 Host 头
  },
}));
