import type { Confederation, Team } from '../types/team'
import { ratingsFromRank } from './teams'

interface RawQualifier {
  id: string
  nameKo: string
  nameEn: string
  code: string
  iso2: string
  confederation: Confederation
  rank: number
  styleBias?: number
}

/**
 * 비(非)본선 예선 참가국 (지역예선 Q1). 본선 진출 48국은 teams.ts에 있고, 여기엔 예선에서
 * 본선과 경쟁하는 나머지 국가를 둔다. 능력치는 teams.ts와 동일한 ratingsFromRank 곡선으로 산출.
 *
 * [수직 슬라이스] 우선 CONMEBOL(남미)만 채운다. 남미는 10개국 단일리그이며, 그중 6국(ARG·BRA·
 * URU·COL·ECU·PAR)은 이미 본선 데이터에 있으므로 여기에는 나머지 4국만 추가한다.
 * rank는 시뮬레이터용 근사치(기준 2025-12, 실제 대회 결과와 무관).
 */
const RAW_QUALIFIERS: RawQualifier[] = [
  // --- CONMEBOL 비본선 4국 ---
  { id: 'CHI', nameKo: '칠레', nameEn: 'Chile', code: 'CHI', iso2: 'CL', confederation: 'CONMEBOL', rank: 40, styleBias: -1 },
  { id: 'PER', nameKo: '페루', nameEn: 'Peru', code: 'PER', iso2: 'PE', confederation: 'CONMEBOL', rank: 43, styleBias: -3 },
  { id: 'VEN', nameKo: '베네수엘라', nameEn: 'Venezuela', code: 'VEN', iso2: 'VE', confederation: 'CONMEBOL', rank: 46, styleBias: 0 },
  { id: 'BOL', nameKo: '볼리비아', nameEn: 'Bolivia', code: 'BOL', iso2: 'BO', confederation: 'CONMEBOL', rank: 58, styleBias: -2 },
]

export const QUALIFIER_TEAMS: Team[] = RAW_QUALIFIERS.map((raw) => ({
  id: raw.id,
  nameKo: raw.nameKo,
  nameEn: raw.nameEn,
  code: raw.code,
  iso2: raw.iso2,
  confederation: raw.confederation,
  pot: 4, // 예선 전용(본선 포트와 무관, 형식상 값)
  fifaRankApprox: raw.rank,
  isHost: false,
  baseRatings: ratingsFromRank(raw.rank, raw.styleBias),
}))
