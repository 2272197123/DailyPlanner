import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/avatars': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../server/static',
    emptyOutDir: true,
    assetsDir: 'assets',
    // 老内核浏览器兼容（夸克/UC 等 Chromium <104 不支持媒体查询 range 语法
    // `@media (width<=768px)`，会被整条丢弃导致移动端适配失效）
    target: 'es2020',
    cssTarget: 'chrome80'
  }
})
