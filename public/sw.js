/*
 * 서비스 워커 (v2 #41, 재작성). 재배포 후 흰 화면 방지가 핵심.
 *
 * 이전 버전은 내비게이션(index.html)까지 cache-first로 처리해, 새 배포가 나가도
 * 옛 index.html을 계속 서빙 → 옛 index.html이 참조하는 해시 번들이 서버에 없어 404 →
 * 실패 시 index.html(HTML)을 JS 자리에 반환 → 모듈 파싱 에러 → 흰 화면이 발생했다.
 *
 * 수정:
 *  - 내비게이션(HTML)은 network-first: 항상 최신 앱 셸 → 최신 번들 참조. 오프라인만 캐시 폴백.
 *  - 해시된 정적 자산(/assets/*)만 cache-first(불변). 나머지는 네트워크 우선.
 *  - 실패한 "자산" 요청에 절대 HTML을 반환하지 않는다(흰 화면의 직접 원인 제거).
 *  - CACHE 이름을 올려 activate에서 오염된 옛 캐시를 전부 삭제한다.
 */
const CACHE = 'wc2026-v2'

self.addEventListener('install', () => {
  // 즉시 활성화(대기 없이 새 SW로 교체)
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // 외부(폰트 CDN 등)는 그대로 통과

  // 1) 내비게이션(HTML): network-first → 항상 최신 앱 셸. 오프라인이면 캐시 폴백.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put('/index.html', clone))
          return res
        })
        .catch(() => caches.match('/index.html').then((c) => c || Response.error())),
    )
    return
  }

  // 2) 해시된 불변 자산(/assets/*): cache-first(빠름·안전, 이름이 바뀌면 새로 받음).
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const clone = res.clone()
              caches.open(CACHE).then((c) => c.put(req, clone))
            }
            return res
          }),
      ),
    )
    return
  }

  // 3) 그 외 동일 출처 자원: network-first, 실패 시에만 캐시(있으면). HTML 폴백은 절대 안 함.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(req, clone))
        }
        return res
      })
      .catch(() => caches.match(req).then((c) => c || Response.error())),
  )
})
