/**
 * 素材管理页面入口
 * 独立路由：/assets.html，与游戏页面共享 localStorage 持久化自定义主题
 */

import { AssetsApp } from './AssetsApp';

const root = document.getElementById('asset-manager-root');
if (!root) {
  throw new Error('找不到 #asset-manager-root 容器节点');
}

new AssetsApp().mount(root);
