import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '帝成观止',
        short_name: '帝成观止',
        description: '中式权谋叙事卡牌 · 剧本引擎',
        lang: 'zh-CN',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#171512',
        theme_color: '#171512',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 图片走运行时缓存，避免 service worker 安装时拉取 ~300 MB 素材
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|webp|gif)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'images',
              // C-6：maxEntries 200 < 全库卡图 ~338 张——提到 400 覆盖完整离线体验（含成就图标/结局图）
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        // C-6 分包：主 JS 1.3MB 单 chunk → 按依赖域拆分，PWA 缓存粒度变细（改 UI 不动数据 chunk）
        codeSplitting: {
          groups: [
            { name: 'vendor', test: /node_modules[\\/]/ },
            { name: 'scenario-data', test: /src[\\/]data[\\/]/ },
            { name: 'engine-core', test: /src[\\/]engine[\\/]/ },
          ],
        },
      },
    },
  },
})
