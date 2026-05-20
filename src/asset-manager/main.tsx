import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './globals.css';

const root = document.getElementById('asset-manager-root');
if (!root) {
  throw new Error('找不到 #asset-manager-root 容器节点');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
