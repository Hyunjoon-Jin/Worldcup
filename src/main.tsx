import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// PWA 서비스 워커 등록 (v2 #41). 프로덕션 빌드에서만 활성화한다.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // 기존 SW가 제어 중이면, 새 SW가 활성화되며 제어를 넘겨받을 때 한 번만 새로고침해
  // 최신 앱 셸을 로드한다(재배포 후 stale 캐시로 인한 흰 화면 복구). 최초 방문(컨트롤러
  // 없음)에는 리로드하지 않아 무한 새로고침을 방지한다.
  if (navigator.serviceWorker.controller) {
    let reloaded = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    })
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* 등록 실패는 조용히 무시(앱은 정상 동작) */
    })
  })
}
