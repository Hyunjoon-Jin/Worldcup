import { GlassCard } from './GlassCard'

interface RuleItem {
  q: string
  a: string
}

const RULES: RuleItem[] = [
  {
    q: '32강에는 몇 팀이 진출하나요?',
    a: '12개 조의 1·2위 24팀 + 각 조 3위 중 성적 상위 8팀 = 총 32팀이 진출합니다.',
  },
  {
    q: '조 3위는 어떻게 진출 팀을 가리나요?',
    a: '12개 조 3위팀을 승점 → 골득실 → 다득점 → 페어플레이 → FIFA 랭킹 순으로 횡단 비교해 상위 8팀이 진출합니다.',
  },
  {
    q: '조별리그 동률은 어떻게 정렬되나요?',
    a: '2026 대회부터 승점 다음 기준이 "동률팀 간 상호전적(승점 → 골득실 → 다득점)"입니다. 그 다음에야 조 전체 골득실·다득점·페어플레이·FIFA 랭킹을 봅니다.',
  },
  {
    q: '조추첨 제약은 무엇인가요?',
    a: '개최국 3팀(멕시코 A1·캐나다 B1·미국 D1)은 사전 고정되고, 같은 대륙연맹은 한 조에 1팀까지(유럽 UEFA만 최대 2팀) 배정됩니다.',
  },
  {
    q: '능력치/확률은 어떻게 계산되나요?',
    a: '팀별 공격·수비·컨디션 능력치를 바탕으로 포아송 분포로 득점을 시뮬레이션하고, 남은 경기를 수천 번 반복(몬테카를로)해 진출·우승 확률을 산출합니다. 조추첨 이후 결과는 모두 가상입니다.',
  },
]

/** 대회 규정 요약 도움말 (G3). 네이티브 details로 접근성/키보드 조작을 확보한다. */
export function RulesHelp() {
  return (
    <GlassCard className="p-4">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-gray-200">
          <span>📖 대회 규정 도움말</span>
          <span className="text-xs text-gray-500 transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-3 space-y-2.5">
          {RULES.map((r, i) => (
            <div key={i} className="rounded-lg bg-white/5 p-2.5">
              <p className="text-xs font-semibold text-emerald-300">{r.q}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{r.a}</p>
            </div>
          ))}
        </div>
      </details>
    </GlassCard>
  )
}
