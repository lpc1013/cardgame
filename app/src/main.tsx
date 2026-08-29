import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// 横屏策略：PWA 由 manifest orientation:landscape 锁横屏（不依赖陀螺仪）；
// 浏览器竖屏不做拦截遮罩（部分手机陀螺仪不灵敏，拦截会卡死玩家），回落竖屏适配样式保底可玩。
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
