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
  // --- CONMEBOL 비본선 4국 (10개국 단일리그) ---
  { id: 'CHI', nameKo: '칠레', nameEn: 'Chile', code: 'CHI', iso2: 'CL', confederation: 'CONMEBOL', rank: 40, styleBias: -1 },
  { id: 'PER', nameKo: '페루', nameEn: 'Peru', code: 'PER', iso2: 'PE', confederation: 'CONMEBOL', rank: 43, styleBias: -3 },
  { id: 'VEN', nameKo: '베네수엘라', nameEn: 'Venezuela', code: 'VEN', iso2: 'VE', confederation: 'CONMEBOL', rank: 46, styleBias: 0 },
  { id: 'BOL', nameKo: '볼리비아', nameEn: 'Bolivia', code: 'BOL', iso2: 'BO', confederation: 'CONMEBOL', rank: 58, styleBias: -2 },

  // --- OFC(오세아니아) 비본선: NZL(본선) 외 경쟁국 ---
  { id: 'NCL', nameKo: '뉴칼레도니아', nameEn: 'New Caledonia', code: 'NCL', iso2: 'NC', confederation: 'OFC', rank: 62 },
  { id: 'TAH', nameKo: '타히티', nameEn: 'Tahiti', code: 'TAH', iso2: 'PF', confederation: 'OFC', rank: 68 },
  { id: 'SOL', nameKo: '솔로몬제도', nameEn: 'Solomon Islands', code: 'SOL', iso2: 'SB', confederation: 'OFC', rank: 66 },
  { id: 'FIJ', nameKo: '피지', nameEn: 'Fiji', code: 'FIJ', iso2: 'FJ', confederation: 'OFC', rank: 64 },
  { id: 'VAN', nameKo: '바누아투', nameEn: 'Vanuatu', code: 'VAN', iso2: 'VU', confederation: 'OFC', rank: 74 },

  // --- CAF(아프리카) 비본선 ---
  { id: 'NGA', nameKo: '나이지리아', nameEn: 'Nigeria', code: 'NGA', iso2: 'NG', confederation: 'CAF', rank: 38, styleBias: 3 },
  { id: 'CMR', nameKo: '카메룬', nameEn: 'Cameroon', code: 'CMR', iso2: 'CM', confederation: 'CAF', rank: 41, styleBias: 2 },
  { id: 'MLI', nameKo: '말리', nameEn: 'Mali', code: 'MLI', iso2: 'ML', confederation: 'CAF', rank: 47, styleBias: 1 },
  { id: 'BFA', nameKo: '부르키나파소', nameEn: 'Burkina Faso', code: 'BFA', iso2: 'BF', confederation: 'CAF', rank: 49, styleBias: 1 },
  { id: 'GIN', nameKo: '기니', nameEn: 'Guinea', code: 'GIN', iso2: 'GN', confederation: 'CAF', rank: 52 },
  { id: 'GAB', nameKo: '가봉', nameEn: 'Gabon', code: 'GAB', iso2: 'GA', confederation: 'CAF', rank: 54, styleBias: 1 },
  { id: 'BEN', nameKo: '베냉', nameEn: 'Benin', code: 'BEN', iso2: 'BJ', confederation: 'CAF', rank: 58 },
  { id: 'ZAM', nameKo: '잠비아', nameEn: 'Zambia', code: 'ZAM', iso2: 'ZM', confederation: 'CAF', rank: 61 },
  { id: 'ANG', nameKo: '앙골라', nameEn: 'Angola', code: 'ANG', iso2: 'AO', confederation: 'CAF', rank: 63 },
  { id: 'UGA', nameKo: '우간다', nameEn: 'Uganda', code: 'UGA', iso2: 'UG', confederation: 'CAF', rank: 67 },
  { id: 'MOZ', nameKo: '모잠비크', nameEn: 'Mozambique', code: 'MOZ', iso2: 'MZ', confederation: 'CAF', rank: 72 },
  { id: 'NAM', nameKo: '나미비아', nameEn: 'Namibia', code: 'NAM', iso2: 'NA', confederation: 'CAF', rank: 76 },
  // CAF 확장(실제 9개 조 편성용, C1/A2)
  { id: 'GNB', nameKo: '기니비사우', nameEn: 'Guinea-Bissau', code: 'GNB', iso2: 'GW', confederation: 'CAF', rank: 74 },
  { id: 'MAD', nameKo: '마다가스카르', nameEn: 'Madagascar', code: 'MAD', iso2: 'MG', confederation: 'CAF', rank: 78 },
  { id: 'EQG', nameKo: '적도기니', nameEn: 'Equatorial Guinea', code: 'EQG', iso2: 'GQ', confederation: 'CAF', rank: 80 },
  { id: 'CGO', nameKo: '콩고공화국', nameEn: 'Congo', code: 'CGO', iso2: 'CG', confederation: 'CAF', rank: 82 },
  { id: 'LBY', nameKo: '리비아', nameEn: 'Libya', code: 'LBY', iso2: 'LY', confederation: 'CAF', rank: 84 },
  { id: 'COM', nameKo: '코모로', nameEn: 'Comoros', code: 'COM', iso2: 'KM', confederation: 'CAF', rank: 86 },
  { id: 'KEN', nameKo: '케냐', nameEn: 'Kenya', code: 'KEN', iso2: 'KE', confederation: 'CAF', rank: 88 },
  { id: 'TOG', nameKo: '토고', nameEn: 'Togo', code: 'TOG', iso2: 'TG', confederation: 'CAF', rank: 90 },
  { id: 'TAN', nameKo: '탄자니아', nameEn: 'Tanzania', code: 'TAN', iso2: 'TZ', confederation: 'CAF', rank: 92 },
  { id: 'SDN', nameKo: '수단', nameEn: 'Sudan', code: 'SDN', iso2: 'SD', confederation: 'CAF', rank: 96 },
  { id: 'ETH', nameKo: '에티오피아', nameEn: 'Ethiopia', code: 'ETH', iso2: 'ET', confederation: 'CAF', rank: 98 },
  { id: 'SLE', nameKo: '시에라리온', nameEn: 'Sierra Leone', code: 'SLE', iso2: 'SL', confederation: 'CAF', rank: 100 },
  { id: 'MWI', nameKo: '말라위', nameEn: 'Malawi', code: 'MWI', iso2: 'MW', confederation: 'CAF', rank: 104 },
  { id: 'CTA', nameKo: '중앙아프리카공화국', nameEn: 'Central African Republic', code: 'CTA', iso2: 'CF', confederation: 'CAF', rank: 108 },

  // --- UEFA(유럽) 비본선 ---
  { id: 'ITA', nameKo: '이탈리아', nameEn: 'Italy', code: 'ITA', iso2: 'IT', confederation: 'UEFA', rank: 38, styleBias: 1 },
  { id: 'UKR', nameKo: '우크라이나', nameEn: 'Ukraine', code: 'UKR', iso2: 'UA', confederation: 'UEFA', rank: 40, styleBias: 1 },
  { id: 'SRB', nameKo: '세르비아', nameEn: 'Serbia', code: 'SRB', iso2: 'RS', confederation: 'UEFA', rank: 42, styleBias: 2 },
  { id: 'POL', nameKo: '폴란드', nameEn: 'Poland', code: 'POL', iso2: 'PL', confederation: 'UEFA', rank: 44, styleBias: 1 },
  { id: 'HUN', nameKo: '헝가리', nameEn: 'Hungary', code: 'HUN', iso2: 'HU', confederation: 'UEFA', rank: 46, styleBias: 0 },
  { id: 'SVK', nameKo: '슬로바키아', nameEn: 'Slovakia', code: 'SVK', iso2: 'SK', confederation: 'UEFA', rank: 48, styleBias: -1 },
  { id: 'ROU', nameKo: '루마니아', nameEn: 'Romania', code: 'ROU', iso2: 'RO', confederation: 'UEFA', rank: 50 },
  { id: 'GRE', nameKo: '그리스', nameEn: 'Greece', code: 'GRE', iso2: 'GR', confederation: 'UEFA', rank: 51, styleBias: -2 },
  { id: 'WAL', nameKo: '웨일스', nameEn: 'Wales', code: 'WAL', iso2: 'GB_WLS', confederation: 'UEFA', rank: 53 },
  { id: 'DEN', nameKo: '덴마크', nameEn: 'Denmark', code: 'DEN', iso2: 'DK', confederation: 'UEFA', rank: 39, styleBias: 0 },
  { id: 'SVN', nameKo: '슬로베니아', nameEn: 'Slovenia', code: 'SVN', iso2: 'SI', confederation: 'UEFA', rank: 55 },
  { id: 'GEO', nameKo: '조지아', nameEn: 'Georgia', code: 'GEO', iso2: 'GE', confederation: 'UEFA', rank: 57 },
  { id: 'ALB', nameKo: '알바니아', nameEn: 'Albania', code: 'ALB', iso2: 'AL', confederation: 'UEFA', rank: 59 },
  { id: 'MKD', nameKo: '북마케도니아', nameEn: 'North Macedonia', code: 'MKD', iso2: 'MK', confederation: 'UEFA', rank: 64 },
  { id: 'ISL', nameKo: '아이슬란드', nameEn: 'Iceland', code: 'ISL', iso2: 'IS', confederation: 'UEFA', rank: 66 },
  { id: 'FIN', nameKo: '핀란드', nameEn: 'Finland', code: 'FIN', iso2: 'FI', confederation: 'UEFA', rank: 62 },
  // UEFA 확장(실제 12개 조 편성용, C1/A1)
  { id: 'BUL', nameKo: '불가리아', nameEn: 'Bulgaria', code: 'BUL', iso2: 'BG', confederation: 'UEFA', rank: 54 },
  { id: 'MDA', nameKo: '몰도바', nameEn: 'Moldova', code: 'MDA', iso2: 'MD', confederation: 'UEFA', rank: 56 },
  { id: 'LUX', nameKo: '룩셈부르크', nameEn: 'Luxembourg', code: 'LUX', iso2: 'LU', confederation: 'UEFA', rank: 58 },
  { id: 'KVX', nameKo: '코소보', nameEn: 'Kosovo', code: 'KVX', iso2: 'XK', confederation: 'UEFA', rank: 60 },
  { id: 'CYP', nameKo: '키프로스', nameEn: 'Cyprus', code: 'CYP', iso2: 'CY', confederation: 'UEFA', rank: 63 },
  { id: 'BLR', nameKo: '벨라루스', nameEn: 'Belarus', code: 'BLR', iso2: 'BY', confederation: 'UEFA', rank: 65 },
  { id: 'KAZ', nameKo: '카자흐스탄', nameEn: 'Kazakhstan', code: 'KAZ', iso2: 'KZ', confederation: 'UEFA', rank: 67 },
  { id: 'ARM', nameKo: '아르메니아', nameEn: 'Armenia', code: 'ARM', iso2: 'AM', confederation: 'UEFA', rank: 69 },
  { id: 'EST', nameKo: '에스토니아', nameEn: 'Estonia', code: 'EST', iso2: 'EE', confederation: 'UEFA', rank: 71 },
  { id: 'LVA', nameKo: '라트비아', nameEn: 'Latvia', code: 'LVA', iso2: 'LV', confederation: 'UEFA', rank: 73 },
  { id: 'AZE', nameKo: '아제르바이잔', nameEn: 'Azerbaijan', code: 'AZE', iso2: 'AZ', confederation: 'UEFA', rank: 75 },
  { id: 'LTU', nameKo: '리투아니아', nameEn: 'Lithuania', code: 'LTU', iso2: 'LT', confederation: 'UEFA', rank: 77 },
  { id: 'MLT', nameKo: '몰타', nameEn: 'Malta', code: 'MLT', iso2: 'MT', confederation: 'UEFA', rank: 90 },
  { id: 'GIB', nameKo: '지브롤터', nameEn: 'Gibraltar', code: 'GIB', iso2: 'GI', confederation: 'UEFA', rank: 92 },
  { id: 'AND', nameKo: '안도라', nameEn: 'Andorra', code: 'AND', iso2: 'AD', confederation: 'UEFA', rank: 96 },
  { id: 'SMR', nameKo: '산마리노', nameEn: 'San Marino', code: 'SMR', iso2: 'SM', confederation: 'UEFA', rank: 100 },

  // --- CONCACAF(북중미) 비본선 (개최 3국 자동, 나머지 경쟁) ---
  { id: 'CRC', nameKo: '코스타리카', nameEn: 'Costa Rica', code: 'CRC', iso2: 'CR', confederation: 'CONCACAF', rank: 45, styleBias: -1 },
  { id: 'HON', nameKo: '온두라스', nameEn: 'Honduras', code: 'HON', iso2: 'HN', confederation: 'CONCACAF', rank: 55 },
  { id: 'JAM', nameKo: '자메이카', nameEn: 'Jamaica', code: 'JAM', iso2: 'JM', confederation: 'CONCACAF', rank: 56, styleBias: 1 },
  { id: 'SLV', nameKo: '엘살바도르', nameEn: 'El Salvador', code: 'SLV', iso2: 'SV', confederation: 'CONCACAF', rank: 69 },
  { id: 'GUA', nameKo: '과테말라', nameEn: 'Guatemala', code: 'GUA', iso2: 'GT', confederation: 'CONCACAF', rank: 71 },
  { id: 'TRI', nameKo: '트리니다드토바고', nameEn: 'Trinidad and Tobago', code: 'TRI', iso2: 'TT', confederation: 'CONCACAF', rank: 73 },
  { id: 'SUR', nameKo: '수리남', nameEn: 'Suriname', code: 'SUR', iso2: 'SR', confederation: 'CONCACAF', rank: 78 },
  { id: 'NCA', nameKo: '니카라과', nameEn: 'Nicaragua', code: 'NCA', iso2: 'NI', confederation: 'CONCACAF', rank: 84 },

  // --- AFC(아시아) 비본선 ---
  { id: 'UAE', nameKo: '아랍에미리트', nameEn: 'United Arab Emirates', code: 'UAE', iso2: 'AE', confederation: 'AFC', rank: 50 },
  { id: 'CHN', nameKo: '중국', nameEn: 'China PR', code: 'CHN', iso2: 'CN', confederation: 'AFC', rank: 60 },
  { id: 'BHR', nameKo: '바레인', nameEn: 'Bahrain', code: 'BHR', iso2: 'BH', confederation: 'AFC', rank: 65 },
  { id: 'OMA', nameKo: '오만', nameEn: 'Oman', code: 'OMA', iso2: 'OM', confederation: 'AFC', rank: 59 },
  { id: 'PLE', nameKo: '팔레스타인', nameEn: 'Palestine', code: 'PLE', iso2: 'PS', confederation: 'AFC', rank: 70 },
  { id: 'KUW', nameKo: '쿠웨이트', nameEn: 'Kuwait', code: 'KUW', iso2: 'KW', confederation: 'AFC', rank: 75 },
  { id: 'KGZ', nameKo: '키르기스스탄', nameEn: 'Kyrgyzstan', code: 'KGZ', iso2: 'KG', confederation: 'AFC', rank: 67 },
  { id: 'THA', nameKo: '태국', nameEn: 'Thailand', code: 'THA', iso2: 'TH', confederation: 'AFC', rank: 72 },
  { id: 'IND', nameKo: '인도', nameEn: 'India', code: 'IND', iso2: 'IN', confederation: 'AFC', rank: 80 },
  { id: 'VIE', nameKo: '베트남', nameEn: 'Vietnam', code: 'VIE', iso2: 'VN', confederation: 'AFC', rank: 63, styleBias: 1 },
  { id: 'LBN', nameKo: '레바논', nameEn: 'Lebanon', code: 'LBN', iso2: 'LB', confederation: 'AFC', rank: 82 },
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
