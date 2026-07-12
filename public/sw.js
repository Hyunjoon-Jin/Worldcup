/*
 * 서비스 워커 (v2 #41). 앱 셸과 같은 출처 자원을 런타임 캐시(cache-first)해 재방문/오프라인에서
 * 빠르게 뜨게 한다. 빌드마다 해시된 자산 이름이 바뀌므로 stale 캐시는 자연히 대체된다.
 */
const CACHE = 'wc2026-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html', '/manifest.webmanifest'])))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // 외부(폰트 CDN 등)는 그대로 통과

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(req, clone))
          }
          return res
        })
        .catch(() => caches.match('/index.html')) // 오프라인 내비게이션 폴백
    }),
  )
})
