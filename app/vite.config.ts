import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  // 端口固定 3000：dev/preview 同端口，strictPort 被占即报错，绝不自动换端口开出多个
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
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
        orientation: 'landscape',
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
              // C-6：maxEntries 200 < 全库卡图 ~338 张——提至 400（2026-08-27 审计）。
              // F-10（2026-08-29 审计）：全库图片实测 644 张（卡 383+结局 93+成就 90+场景 36+立绘 29+封面 13），
              // 400 仍会 LRU 淘汰，「完整离线」不成立——提至 720 全覆盖 + 余量
              expiration: { maxEntries: 720, maxAgeSeconds: 60 * 60 * 24 * 30 },
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
