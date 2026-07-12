/**
 * 2026 북중미 월드컵 개최 도시·경기장 (G2). 총 16개 도시(미국 11 · 멕시코 3 · 캐나다 2).
 * 경기별 배정은 예시적(결정론적 해시)이며 실제 대회 배정과는 무관하다.
 */
export interface Venue {
  id: string
  cityKo: string
  cityEn: string
  stadium: string
  country: 'USA' | 'MEX' | 'CAN'
}

export const VENUES: Venue[] = [
  { id: 'MEX-CDMX', cityKo: '멕시코시티', cityEn: 'Mexico City', stadium: '에스타디오 아즈테카', country: 'MEX' },
  { id: 'MEX-GDL', cityKo: '과달라하라', cityEn: 'Guadalajara', stadium: '에스타디오 아크론', country: 'MEX' },
  { id: 'MEX-MTY', cityKo: '몬테레이', cityEn: 'Monterrey', stadium: '에스타디오 BBVA', country: 'MEX' },
  { id: 'CAN-TOR', cityKo: '토론토', cityEn: 'Toronto', stadium: 'BMO 필드', country: 'CAN' },
  { id: 'CAN-VAN', cityKo: '밴쿠버', cityEn: 'Vancouver', stadium: 'BC 플레이스', country: 'CAN' },
  { id: 'USA-NY', cityKo: '뉴욕/뉴저지', cityEn: 'New York/New Jersey', stadium: '메트라이프 스타디움', country: 'USA' },
  { id: 'USA-LA', cityKo: '로스앤젤레스', cityEn: 'Los Angeles', stadium: 'SoFi 스타디움', country: 'USA' },
  { id: 'USA-DAL', cityKo: '댈러스', cityEn: 'Dallas', stadium: 'AT&T 스타디움', country: 'USA' },
  { id: 'USA-SF', cityKo: '샌프란시스코', cityEn: 'San Francisco Bay', stadium: '리바이스 스타디움', country: 'USA' },
  { id: 'USA-MIA', cityKo: '마이애미', cityEn: 'Miami', stadium: '하드록 스타디움', country: 'USA' },
  { id: 'USA-ATL', cityKo: '애틀랜타', cityEn: 'Atlanta', stadium: '메르세데스-벤츠 스타디움', country: 'USA' },
  { id: 'USA-SEA', cityKo: '시애틀', cityEn: 'Seattle', stadium: '루멘 필드', country: 'USA' },
  { id: 'USA-HOU', cityKo: '휴스턴', cityEn: 'Houston', stadium: 'NRG 스타디움', country: 'USA' },
  { id: 'USA-KC', cityKo: '캔자스시티', cityEn: 'Kansas City', stadium: '애로헤드 스타디움', country: 'USA' },
  { id: 'USA-PHI', cityKo: '필라델피아', cityEn: 'Philadelphia', stadium: '링컨 파이낸셜 필드', country: 'USA' },
  { id: 'USA-BOS', cityKo: '보스턴', cityEn: 'Boston', stadium: '질레트 스타디움', country: 'USA' },
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** 경기 식별자를 개최 도시에 결정론적으로 배정한다(같은 경기는 항상 같은 도시). */
export function venueForMatchId(matchId: string): Venue {
  return VENUES[hashString(matchId) % VENUES.length]
}
