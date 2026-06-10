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
    // 生产构建关闭 sourcemap：避免 .map 文件泄漏完整源码（含调试入口、认证/签名逻辑）。
    // 如需线上排查，临时改为 true 重新构建，排查完务必改回 false。
    sourcemap: false,
    // 超标 chunk 是主题精灵的 JSON 数据矩阵（非代码）：
    //   默认主题 shuoshuo_crystal（~1.2MB，gzip 90KB）首屏渲染必需，无法再拆/懒加载；
    //   经典主题 classic 已改按需懒加载（见 src/assets/theme/classic.ts）。
    // 数据 chunk 无法靠代码分割消除，gzip/brotli 后体积可接受，故调高阈值消除无意义告警。
    chunkSizeWarningLimit: 1500,
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
