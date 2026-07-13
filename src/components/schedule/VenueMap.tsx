import { useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { VENUES, COUNTRY_COLOR, COUNTRY_LABEL, type Venue } from '../../data/venues'

// 위/경도를 SVG 좌표로 정규화 (경도 -125~-70, 위도 18~50)
const LNG_MIN = -125
const LNG_MAX = -70
const LAT_MIN = 18
const LAT_MAX = 50
const W = 100
const H = 62

function project(v: Venue): { x: number; y: number } {
  const x = ((v.lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * W
  const y = (1 - (v.lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * H
  return { x, y }
}

/** 지도 기반 개최지 뷰 (v2 #34). 16개 도시를 근사 좌표에 점으로 표시(국가별 색). */
export function VenueMap() {
  const [active, setActive] = useState<Venue | null>(null)

  return (
    <GlassCard className="p-4">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-gray-200">
          <span>🗺 개최 도시 지도 <span className="text-gray-500">(16개 도시)</span></span>
          <span className="text-xs text-gray-500 transition-transform group-open:rotate-180">▾</span>
        </summary>

        <div className="mt-3">
          <div className="mb-2 flex gap-3 text-[11px]">
            {(Object.keys(COUNTRY_LABEL) as Venue['country'][]).map((c) => (
              <span key={c} className="flex items-center gap-1 text-gray-400">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: COUNTRY_COLOR[c] }} />
                {COUNTRY_LABEL[c]}
              </span>
            ))}
          </div>

          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full min-w-[360px] rounded-lg bg-white/5" role="img" aria-label="개최 도시 지도">
              {/* 위경도 격자 */}
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <g key={f} stroke="currentColor" strokeOpacity="0.06" strokeWidth="0.2">
                  <line x1={f * W} y1={0} x2={f * W} y2={H} />
                  <line x1={0} y1={f * H} x2={W} y2={f * H} />
                </g>
              ))}
              {VENUES.map((v) => {
                const { x, y } = project(v)
                const isActive = active?.id === v.id
                return (
                  <circle
                    key={v.id}
                    cx={x}
                    cy={y}
                    r={isActive ? 2.4 : 1.6}
                    fill={COUNTRY_COLOR[v.country]}
                    stroke="white"
                    strokeWidth={isActive ? 0.5 : 0.2}
                    strokeOpacity="0.8"
                    className="cursor-pointer"
                    onMouseEnter={() => setActive(v)}
                    onClick={() => setActive(v)}
                  />
                )
              })}
            </svg>
          </div>

          <p className="mt-2 text-center text-[11px] text-gray-400">
            {active ? (
              <>
                📍 <strong className="text-gray-200">{active.cityKo}</strong> · {active.stadium}
              </>
            ) : (
              '점 위에 마우스를 올리면 도시·경기장이 표시됩니다.'
            )}
          </p>
        </div>
      </details>
    </GlassCard>
  )
}
