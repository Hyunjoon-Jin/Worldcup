import type { Confederation, Pot, Team, TeamRatings } from '../types/team'
import { RATINGS_FROM_RANK as R, clamp } from '../engine/config'

interface RawTeam {
  id: string
  nameKo: string
  nameEn: string
  code: string
  /** country-flag-icons react/3x2 component key */
  iso2: string
  confederation: Confederation
  pot: Pot
  rank: number
  isHost?: boolean
  /** -10..10 style bias: positive = more attacking, negative = more defensive */
  styleBias?: number
}

// 2026 북중미 월드컵 실제 본선 진출 48개국. pot(1-4)은 2025.12.5 실제 드로우의 포트 구성을 따른다.
// fifaRankApprox(rank)는 본 시뮬레이터용 근사치이며, 샌드박스 모드에서 조정 가능하다.
const RAW_TEAMS: RawTeam[] = [
  // --- Pot 1: 개최국 3팀 + 랭킹 상위 9팀 ---
  { id: 'ARG', nameKo: '아르헨티나', nameEn: 'Argentina', code: 'ARG', iso2: 'AR', confederation: 'CONMEBOL', pot: 1, rank: 1, styleBias: 6 },
  { id: 'ESP', nameKo: '스페인', nameEn: 'Spain', code: 'ESP', iso2: 'ES', confederation: 'UEFA', pot: 1, rank: 2, styleBias: 5 },
  { id: 'FRA', nameKo: '프랑스', nameEn: 'France', code: 'FRA', iso2: 'FR', confederation: 'UEFA', pot: 1, rank: 3, styleBias: 4 },
  { id: 'ENG', nameKo: '잉글랜드', nameEn: 'England', code: 'ENG', iso2: 'GB_ENG', confederation: 'UEFA', pot: 1, rank: 4, styleBias: 2 },
  { id: 'POR', nameKo: '포르투갈', nameEn: 'Portugal', code: 'POR', iso2: 'PT', confederation: 'UEFA', pot: 1, rank: 5, styleBias: 4 },
  { id: 'BRA', nameKo: '브라질', nameEn: 'Brazil', code: 'BRA', iso2: 'BR', confederation: 'CONMEBOL', pot: 1, rank: 6, styleBias: 7 },
  { id: 'NED', nameKo: '네덜란드', nameEn: 'Netherlands', code: 'NED', iso2: 'NL', confederation: 'UEFA', pot: 1, rank: 7, styleBias: 3 },
  { id: 'BEL', nameKo: '벨기에', nameEn: 'Belgium', code: 'BEL', iso2: 'BE', confederation: 'UEFA', pot: 1, rank: 8, styleBias: 2 },
  { id: 'GER', nameKo: '독일', nameEn: 'Germany', code: 'GER', iso2: 'DE', confederation: 'UEFA', pot: 1, rank: 9, styleBias: 1 },
  { id: 'MEX', nameKo: '멕시코', nameEn: 'Mexico', code: 'MEX', iso2: 'MX', confederation: 'CONCACAF', pot: 1, rank: 17, isHost: true, styleBias: 3 },
  { id: 'USA', nameKo: '미국', nameEn: 'USA', code: 'USA', iso2: 'US', confederation: 'CONCACAF', pot: 1, rank: 13, isHost: true, styleBias: 1 },
  { id: 'CAN', nameKo: '캐나다', nameEn: 'Canada', code: 'CAN', iso2: 'CA', confederation: 'CONCACAF', pot: 1, rank: 31, isHost: true, styleBias: 0 },

  // --- Pot 2: 랭킹 13-24위 ---
  { id: 'CRO', nameKo: '크로아티아', nameEn: 'Croatia', code: 'CRO', iso2: 'HR', confederation: 'UEFA', pot: 2, rank: 10, styleBias: -1 },
  { id: 'MAR', nameKo: '모로코', nameEn: 'Morocco', code: 'MAR', iso2: 'MA', confederation: 'CAF', pot: 2, rank: 11, styleBias: -2 },
  { id: 'COL', nameKo: '콜롬비아', nameEn: 'Colombia', code: 'COL', iso2: 'CO', confederation: 'CONMEBOL', pot: 2, rank: 12, styleBias: 4 },
  { id: 'URU', nameKo: '우루과이', nameEn: 'Uruguay', code: 'URU', iso2: 'UY', confederation: 'CONMEBOL', pot: 2, rank: 14, styleBias: -3 },
  { id: 'SUI', nameKo: '스위스', nameEn: 'Switzerland', code: 'SUI', iso2: 'CH', confederation: 'UEFA', pot: 2, rank: 15, styleBias: -2 },
  { id: 'JPN', nameKo: '일본', nameEn: 'Japan', code: 'JPN', iso2: 'JP', confederation: 'AFC', pot: 2, rank: 16, styleBias: 1 },
  { id: 'SEN', nameKo: '세네갈', nameEn: 'Senegal', code: 'SEN', iso2: 'SN', confederation: 'CAF', pot: 2, rank: 18, styleBias: 1 },
  { id: 'IRN', nameKo: '이란', nameEn: 'IR Iran', code: 'IRN', iso2: 'IR', confederation: 'AFC', pot: 2, rank: 19, styleBias: -3 },
  { id: 'KOR', nameKo: '대한민국', nameEn: 'Korea Republic', code: 'KOR', iso2: 'KR', confederation: 'AFC', pot: 2, rank: 20, styleBias: 2 },
  { id: 'ECU', nameKo: '에콰도르', nameEn: 'Ecuador', code: 'ECU', iso2: 'EC', confederation: 'CONMEBOL', pot: 2, rank: 21, styleBias: -3 },
  { id: 'AUT', nameKo: '오스트리아', nameEn: 'Austria', code: 'AUT', iso2: 'AT', confederation: 'UEFA', pot: 2, rank: 22, styleBias: 1 },
  { id: 'AUS', nameKo: '호주', nameEn: 'Australia', code: 'AUS', iso2: 'AU', confederation: 'AFC', pot: 2, rank: 23, styleBias: -2 },

  // --- Pot 3: 랭킹 25-36위 ---
  { id: 'NOR', nameKo: '노르웨이', nameEn: 'Norway', code: 'NOR', iso2: 'NO', confederation: 'UEFA', pot: 3, rank: 24, styleBias: 3 },
  { id: 'EGY', nameKo: '이집트', nameEn: 'Egypt', code: 'EGY', iso2: 'EG', confederation: 'CAF', pot: 3, rank: 25, styleBias: -1 },
  { id: 'ALG', nameKo: '알제리', nameEn: 'Algeria', code: 'ALG', iso2: 'DZ', confederation: 'CAF', pot: 3, rank: 26, styleBias: 1 },
  { id: 'SCO', nameKo: '스코틀랜드', nameEn: 'Scotland', code: 'SCO', iso2: 'GB_SCT', confederation: 'UEFA', pot: 3, rank: 27, styleBias: -2 },
  { id: 'PAR', nameKo: '파라과이', nameEn: 'Paraguay', code: 'PAR', iso2: 'PY', confederation: 'CONMEBOL', pot: 3, rank: 28, styleBias: -4 },
  { id: 'TUN', nameKo: '튀니지', nameEn: 'Tunisia', code: 'TUN', iso2: 'TN', confederation: 'CAF', pot: 3, rank: 29, styleBias: -3 },
  { id: 'CIV', nameKo: '코트디부아르', nameEn: "Côte d'Ivoire", code: 'CIV', iso2: 'CI', confederation: 'CAF', pot: 3, rank: 30, styleBias: 2 },
  { id: 'PAN', nameKo: '파나마', nameEn: 'Panama', code: 'PAN', iso2: 'PA', confederation: 'CONCACAF', pot: 3, rank: 32, styleBias: -2 },
  { id: 'UZB', nameKo: '우즈베키스탄', nameEn: 'Uzbekistan', code: 'UZB', iso2: 'UZ', confederation: 'AFC', pot: 3, rank: 33, styleBias: -1 },
  { id: 'RSA', nameKo: '남아프리카공화국', nameEn: 'South Africa', code: 'RSA', iso2: 'ZA', confederation: 'CAF', pot: 3, rank: 34, styleBias: 1 },
  { id: 'QAT', nameKo: '카타르', nameEn: 'Qatar', code: 'QAT', iso2: 'QA', confederation: 'AFC', pot: 3, rank: 35, styleBias: 0 },
  { id: 'KSA', nameKo: '사우디아라비아', nameEn: 'Saudi Arabia', code: 'KSA', iso2: 'SA', confederation: 'AFC', pot: 3, rank: 36, styleBias: -1 },

  // --- Pot 4: 랭킹 37위 이하 + 대륙간/유럽 플레이오프 최종 통과팀 ---
  { id: 'TUR', nameKo: '튀르키예', nameEn: 'Türkiye', code: 'TUR', iso2: 'TR', confederation: 'UEFA', pot: 4, rank: 37, styleBias: 1 },
  { id: 'SWE', nameKo: '스웨덴', nameEn: 'Sweden', code: 'SWE', iso2: 'SE', confederation: 'UEFA', pot: 4, rank: 38, styleBias: 1 },
  { id: 'CZE', nameKo: '체코', nameEn: 'Czechia', code: 'CZE', iso2: 'CZ', confederation: 'UEFA', pot: 4, rank: 39, styleBias: -1 },
  { id: 'BIH', nameKo: '보스니아 헤르체고비나', nameEn: 'Bosnia and Herzegovina', code: 'BIH', iso2: 'BA', confederation: 'UEFA', pot: 4, rank: 40, styleBias: 0 },
  { id: 'JOR', nameKo: '요르단', nameEn: 'Jordan', code: 'JOR', iso2: 'JO', confederation: 'AFC', pot: 4, rank: 41, styleBias: -2 },
  { id: 'GHA', nameKo: '가나', nameEn: 'Ghana', code: 'GHA', iso2: 'GH', confederation: 'CAF', pot: 4, rank: 42, styleBias: 2 },
  { id: 'IRQ', nameKo: '이라크', nameEn: 'Iraq', code: 'IRQ', iso2: 'IQ', confederation: 'AFC', pot: 4, rank: 43, styleBias: -1 },
  { id: 'COD', nameKo: '콩고민주공화국', nameEn: 'DR Congo', code: 'COD', iso2: 'CD', confederation: 'CAF', pot: 4, rank: 44, styleBias: 1 },
  { id: 'CPV', nameKo: '카보베르데', nameEn: 'Cabo Verde', code: 'CPV', iso2: 'CV', confederation: 'CAF', pot: 4, rank: 45, styleBias: -2 },
  { id: 'NZL', nameKo: '뉴질랜드', nameEn: 'New Zealand', code: 'NZL', iso2: 'NZ', confederation: 'OFC', pot: 4, rank: 46, styleBias: -1 },
  { id: 'HAI', nameKo: '아이티', nameEn: 'Haiti', code: 'HAI', iso2: 'HT', confederation: 'CONCACAF', pot: 4, rank: 47, styleBias: 0 },
  { id: 'CUW', nameKo: '퀴라소', nameEn: 'Curaçao', code: 'CUW', iso2: 'CW', confederation: 'CONCACAF', pot: 4, rank: 48, styleBias: -1 },
]

function ratingsFromRank(rank: number, styleBias = 0): TeamRatings {
  // rank 1 -> ~97, rank 48 -> ~46, roughly linear with a soft floor
  const overall = clamp(Math.round(R.overallTop - (rank - 1) * R.overallSlope), R.overallFloor, R.overallCap)
  const styleShift = Math.round(styleBias * R.styleFactor)
  const attack = clamp(overall + styleShift, R.attackFloor, R.attackCap)
  const defense = clamp(overall - styleShift, R.attackFloor, R.attackCap)
  const form = clamp(overall + Math.round(((rank * 37) % 11) - 5), R.formFloor, R.formCap)
  return { attack, defense, form, overall }
}

export const TEAMS: Team[] = RAW_TEAMS.map((raw) => ({
  id: raw.id,
  nameKo: raw.nameKo,
  nameEn: raw.nameEn,
  code: raw.code,
  iso2: raw.iso2,
  confederation: raw.confederation,
  pot: raw.pot,
  fifaRankApprox: raw.rank,
  isHost: raw.isHost ?? false,
  baseRatings: ratingsFromRank(raw.rank, raw.styleBias),
}))

export const TEAMS_BY_ID: Record<string, Team> = Object.fromEntries(TEAMS.map((t) => [t.id, t]))

export function getTeamsByPot(pot: Pot): Team[] {
  return TEAMS.filter((t) => t.pot === pot)
}

export const CONFEDERATION_LABEL_KO: Record<Confederation, string> = {
  UEFA: '유럽(UEFA)',
  CONMEBOL: '남미(CONMEBOL)',
  AFC: '아시아(AFC)',
  CAF: '아프리카(CAF)',
  CONCACAF: '북중미(CONCACAF)',
  OFC: '오세아니아(OFC)',
}
