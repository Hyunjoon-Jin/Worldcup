import type { Team } from '../../types/team'

/**
 * 대륙컵 개최국 자동 선정용 데이터. 실제 데이터셋에 GDP/인구가 없으므로, 개최 적합도(경제규모·축구
 * 인프라 프록시)를 국가별로 큐레이션한 가중치로 표현하고, 미기재국은 FIFA 랭킹 기반 기본값을 쓴다.
 * 또 지리적으로 인접해 실제 공동개최가 이뤄지는 국가 쌍을 함께 정의해, 공동개최가 자연스러운 조합으로만
 * 일어나게 한다(예: 네덜란드-벨기에, 오스트리아-스위스, 미국-캐나다-멕시코, 일본-한국).
 */

/** 개최 적합도 가중치(높을수록 개최 확률↑). 경제규모·인프라 프록시. 미기재국은 hostWeight의 랭킹 기반 기본값. */
export const HOST_WEIGHT: Record<string, number> = {
  // UEFA
  GER: 100, ENG: 100, FRA: 96, ESP: 95, ITA: 90, TUR: 68, NED: 74, POL: 62, POR: 60,
  BEL: 55, SUI: 54, AUT: 52, SWE: 55, NOR: 50, DEN: 50, FIN: 40, GRE: 45, CRO: 42,
  UKR: 44, ROU: 42, HUN: 44, CZE: 46, SRB: 40, SCO: 55, WAL: 45, IRL: 50, NIR: 38,
  // CONMEBOL
  BRA: 100, ARG: 88, COL: 60, CHI: 60, URU: 46, PER: 46, ECU: 42, PAR: 42, BOL: 30, VEN: 40,
  // AFC
  CHN: 100, JPN: 95, KSA: 96, KOR: 86, AUS: 82, QAT: 82, UAE: 76, IRN: 56, IND: 62, THA: 52,
  IDN: 50, MAS: 44, VIE: 44, UZB: 42, BHR: 48, KUW: 44, OMA: 42, JOR: 40,
  // CAF
  RSA: 90, MAR: 86, EGY: 80, ALG: 70, NGA: 70, CIV: 62, TUN: 56, CMR: 54, SEN: 52, GHA: 50,
  KEN: 44, TAN: 40, UGA: 40, ANG: 44, GAB: 40,
  // CONCACAF
  USA: 100, MEX: 90, CAN: 84, CRC: 48, JAM: 44, PAN: 46, HON: 38, TRI: 38, SLV: 34, GUA: 34,
  // OFC
  NZL: 72, FIJ: 42, TAH: 36, PNG: 32, SOL: 30, NCL: 34, VAN: 26,
}

/**
 * 지리적으로 인접해 공동개최가 자연스러운 국가 쌍(무방향; 파트너는 같은 대회 참가 연맹 풀에 있을 때만 채택).
 * 실제 공동개최 사례(EURO 2000/2008/2012/2028, WC 2002/2026 등)와 인접성을 근거로 큐레이션.
 */
export const CO_HOST_AFFINITY: Record<string, string[]> = {
  // CONCACAF (북중미 3국)
  USA: ['CAN', 'MEX'], CAN: ['USA'], MEX: ['USA'],
  // UEFO 저지대·알프스·발틱·이베리아·스칸디나비아·브리튼
  NED: ['BEL'], BEL: ['NED'],
  AUT: ['SUI'], SUI: ['AUT'],
  POL: ['UKR'], UKR: ['POL'],
  ESP: ['POR'], POR: ['ESP'],
  SWE: ['NOR', 'DEN', 'FIN'], NOR: ['SWE', 'DEN'], DEN: ['SWE', 'NOR'], FIN: ['SWE'],
  ENG: ['WAL', 'SCO', 'IRL'], WAL: ['ENG'], SCO: ['ENG'], IRL: ['NIR', 'ENG'], NIR: ['IRL'],
  GER: ['AUT', 'NED'], CZE: ['SVK'], SVK: ['CZE'], CRO: ['SVN', 'SRB'], HUN: ['AUT'],
  // AFC (걸프·동아시아)
  KSA: ['BHR', 'UAE'], UAE: ['QAT', 'OMA', 'BHR'], QAT: ['UAE', 'BHR'], BHR: ['KSA', 'QAT'], OMA: ['UAE'],
  JPN: ['KOR'], KOR: ['JPN'],
  // CONMEBOL (남미 콘 수르)
  ARG: ['URU', 'PAR', 'CHI'], URU: ['ARG', 'PAR'], PAR: ['ARG', 'URU'], CHI: ['ARG'],
  // CAF (남부·동부 아프리카)
  RSA: ['BOT', 'SWZ', 'LES'], KEN: ['UGA', 'TAN'], UGA: ['KEN', 'TAN'], TAN: ['KEN', 'UGA'], NGA: ['GHA'],
}

/**
 * 국가의 개최 적합도 가중치. 큐레이션된 주요 개최국(경제·인프라 상위)이 압도적으로 우세하도록,
 * 미기재국은 아주 낮은 기본값(랭킹이 좋을수록 소폭↑)만 준다 — 연맹당 국가 수가 많아도(아프리카·아시아 ~50국)
 * 무명국이 개최를 독식하지 않게 한다. 그래도 0은 아니라 아주 드물게 이변 개최가 가능하다.
 */
export function hostWeight(team: Team): number {
  return HOST_WEIGHT[team.id] ?? Math.max(1, 5 - team.fifaRankApprox * 0.02)
}
