import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 前后端分离：前端 dev server 通过代理访问后端 API（生产环境同域部署）
// 后端端口 5311：本机 8787/8899 被平台代理占用（请求会被吞掉），故避开
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5199,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:5311', changeOrigin: true },
    },
  },
  build: { outDir: 'dist' },
});
