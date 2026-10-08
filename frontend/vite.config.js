import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 前后端分离：前端 dev server 通过代理访问后端 API（生产环境同域部署）
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5199,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8899', changeOrigin: true },
    },
  },
  build: { outDir: 'dist' },
});
