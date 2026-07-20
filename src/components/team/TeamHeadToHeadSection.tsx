import { useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { TeamLink } from '../common/TeamLink'
import { useTeamHeadToHead } from './useTeamHeadToHead'
import { summarizeHeadToHead, H2H_COMPETITION_LABEL, type H2HResult, type H2HRecord } from '../../engine/h2h'

/** 승/무/패 컬러 스킴(앱 공통). */
const RESULT_STYLE: Record<H2HResult, string> = {
  W: 'bg-emerald-500/20 text-emerald-300',
  D: 'bg-white/10 text-gray-300',
  L: 'bg-red-500/20 text-red-300',
}
const RESULT_KO: Record<H2HResult, string> = { W: '승', D: '무', L: '패' }

/** 승·무·패 비율 누적 막대. */
function WdlBar({ w, d, l }: { w: number; d: number; l: number }) {
  const total = w + d + l
  if (total === 0) return null
  const pw = (w / total) * 100
  const pd = (d / total) * 100
  const pl = (l / total) * 100
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/5">
      {pw > 0 && <div className="bg-emerald-400/70" style={{ width: `${pw}%` }} />}
      {pd > 0 && <div className="bg-gray-400/50" style={{ width: `${pd}%` }} />}
      {pl > 0 && <div className="bg-red-400/70" style={{ width: `${pl}%` }} />}
    </div>
  )
}

function ResultPill({ result }: { result: H2HResult }) {
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${RESULT_STYLE[result]}`}>{RESULT_KO[result]}</span>
}

function OpponentRow({ rec }: { rec: H2HRecord }) {
  const [open, setOpen] = useState(false)
  const gd = rec.goalsFor - rec.goalsAgainst
  return (
    <div className="rounded-lg bg-white/5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-white/10">
        <span className="w-3 shrink-0 text-[10px] text-gray-500">{open ? '▾' : '▸'}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1"><TeamLink teamId={rec.opponentId} wrap className="min-w-0" /></span>
        <span className="shrink-0 tabular-nums text-gray-400">{rec.played}경기</span>
        <span className="shrink-0 tabular-nums">
          <span className="text-emerald-300">{rec.wins}</span>
          <span className="text-gray-600">·</span>
          <span className="text-gray-400">{rec.draws}</span>
          <span className="text-gray-600">·</span>
          <span className="text-red-300">{rec.losses}</span>
        </span>
        <span className="w-14 shrink-0 text-right tabular-nums text-gray-400">
          {rec.goalsFor}-{rec.goalsAgainst}
          <span className={`ml-1 ${gd > 0 ? 'text-emerald-400' : gd < 0 ? 'text-red-400' : 'text-gray-500'}`}>{gd > 0 ? `+${gd}` : gd}</span>
        </span>
        <span className="hidden w-16 shrink-0 sm:block"><WdlBar w={rec.wins} d={rec.draws} l={rec.losses} /></span>
      </button>
      {open && (
        <div className="space-y-1 px-2.5 pb-2 pt-0.5">
          {rec.games.map((g, i) => (
            <div key={i} className="flex items-center gap-2 rounded bg-black/20 px-2 py-1 text-[11px]">
              <span className="w-16 shrink-0 text-gray-500">{H2H_COMPETITION_LABEL[g.competition]}</span>
              <span className="shrink-0 text-[10px] text-gray-600">{g.isHome ? '홈' : '원정'}</span>
              <span className="min-w-0 flex-1 text-center font-bold tabular-nums text-white">
                {g.goalsFor} - {g.goalsAgainst}
                {g.wentToPenalties && <span className="ml-1 text-[9px] font-normal text-amber-300/80">(승부차기)</span>}
              </span>
              <ResultPill result={g.result} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 상대전적(맞대결 기록) 섹션 (E). 이번 사이클에 치른 모든 경기(예선·PO·친선·본선·대륙컵)를 상대별로
 * 묶어 통산 전적과 승·무·패 비율을 보여준다. 각 상대 행을 펼치면 개별 경기(대회·홈원정·스코어·결과)를 본다.
 */
export function TeamHeadToHeadSection({ teamId }: { teamId: string }) {
  const records = useTeamHeadToHead(teamId)
  const summary = useMemo(() => summarizeHeadToHead(records), [records])

  return (
    <GlassCard className="p-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-sky-300">⚔️ 상대전적 <span className="text-[10px] font-normal text-gray-500">이번 사이클 · 모든 대회</span></h3>
      {records.length === 0 ? (
        <p className="text-[11px] text-gray-500">아직 맞대결 기록이 없습니다. 예선·친선·본선·대륙컵을 진행하면 상대별 전적이 쌓입니다.</p>
      ) : (
        <>
          {/* 통산 요약 */}
          <div className="mb-2 rounded-lg bg-white/5 p-2.5">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-gray-400">{summary.opponents}개국 상대 · <span className="font-bold text-white">{summary.played}경기</span></span>
              <span className="tabular-nums">
                <span className="font-bold text-emerald-300">{summary.wins}승</span>{' '}
                <span className="font-bold text-gray-300">{summary.draws}무</span>{' '}
                <span className="font-bold text-red-300">{summary.losses}패</span>
                <span className="ml-1.5 text-gray-500">({summary.goalsFor}-{summary.goalsAgainst})</span>
              </span>
            </div>
            <WdlBar w={summary.wins} d={summary.draws} l={summary.losses} />
          </div>
          {/* 상대별 전적(맞대결 많은 순) */}
          <div className="space-y-1">
            {records.map((rec) => (
              <OpponentRow key={rec.opponentId} rec={rec} />
            ))}
          </div>
        </>
      )}
    </GlassCard>
  )
}
