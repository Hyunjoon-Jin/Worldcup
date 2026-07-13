import type { Confederation, Team } from '../types/team'
import { ratingsFromRank, resolveStyleBias } from './teams'

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

  // --- CONCACAF 추가(실제 35개 회원국 채우기 — 1·2차 예비예선 대상 포함) ---
  { id: 'DOM', nameKo: '도미니카공화국', nameEn: 'Dominican Republic', code: 'DOM', iso2: 'DO', confederation: 'CONCACAF', rank: 140 },
  { id: 'GUY', nameKo: '가이아나', nameEn: 'Guyana', code: 'GUY', iso2: 'GY', confederation: 'CONCACAF', rank: 150 },
  { id: 'SKN', nameKo: '세인트키츠네비스', nameEn: 'St Kitts and Nevis', code: 'SKN', iso2: 'KN', confederation: 'CONCACAF', rank: 153 },
  { id: 'PUR', nameKo: '푸에르토리코', nameEn: 'Puerto Rico', code: 'PUR', iso2: 'PR', confederation: 'CONCACAF', rank: 156 },
  { id: 'GRN', nameKo: '그레나다', nameEn: 'Grenada', code: 'GRN', iso2: 'GD', confederation: 'CONCACAF', rank: 160 },
  { id: 'ATG', nameKo: '앤티가바부다', nameEn: 'Antigua and Barbuda', code: 'ATG', iso2: 'AG', confederation: 'CONCACAF', rank: 165 },
  { id: 'VIN', nameKo: '세인트빈센트그레나딘', nameEn: 'St Vincent and the Grenadines', code: 'VIN', iso2: 'VC', confederation: 'CONCACAF', rank: 168 },
  { id: 'BER', nameKo: '버뮤다', nameEn: 'Bermuda', code: 'BER', iso2: 'BM', confederation: 'CONCACAF', rank: 170 },
  { id: 'BRB', nameKo: '바베이도스', nameEn: 'Barbados', code: 'BRB', iso2: 'BB', confederation: 'CONCACAF', rank: 172 },
  { id: 'BLZ', nameKo: '벨리즈', nameEn: 'Belize', code: 'BLZ', iso2: 'BZ', confederation: 'CONCACAF', rank: 174 },
  { id: 'LCA', nameKo: '세인트루시아', nameEn: 'St Lucia', code: 'LCA', iso2: 'LC', confederation: 'CONCACAF', rank: 176 },
  { id: 'ARU', nameKo: '아루바', nameEn: 'Aruba', code: 'ARU', iso2: 'AW', confederation: 'CONCACAF', rank: 180 },
  { id: 'DMA', nameKo: '도미니카', nameEn: 'Dominica', code: 'DMA', iso2: 'DM', confederation: 'CONCACAF', rank: 183 },
  { id: 'BAH', nameKo: '바하마', nameEn: 'Bahamas', code: 'BAH', iso2: 'BS', confederation: 'CONCACAF', rank: 186 },
  { id: 'CAY', nameKo: '케이맨제도', nameEn: 'Cayman Islands', code: 'CAY', iso2: 'KY', confederation: 'CONCACAF', rank: 190 },
  { id: 'VGB', nameKo: '영국령버진아일랜드', nameEn: 'British Virgin Islands', code: 'VGB', iso2: 'VG', confederation: 'CONCACAF', rank: 194 },
  { id: 'TCA', nameKo: '터크스케이커스', nameEn: 'Turks and Caicos Islands', code: 'TCA', iso2: 'TC', confederation: 'CONCACAF', rank: 196 },
  { id: 'VIR', nameKo: '미국령버진아일랜드', nameEn: 'US Virgin Islands', code: 'VIR', iso2: 'VI', confederation: 'CONCACAF', rank: 199 },
  { id: 'AIA', nameKo: '앵귈라', nameEn: 'Anguilla', code: 'AIA', iso2: 'AI', confederation: 'CONCACAF', rank: 201 },
  { id: 'MSR', nameKo: '몬트세랫', nameEn: 'Montserrat', code: 'MSR', iso2: 'MS', confederation: 'CONCACAF', rank: 203 },
  { id: 'SMA', nameKo: '신트마르턴', nameEn: 'Sint Maarten', code: 'SMA', iso2: 'SX', confederation: 'CONCACAF', rank: 206 },

  // --- AFC 추가(실제 47개 회원국 채우기 — 1·2차 예비예선 대상 포함) ---
  { id: 'SYR', nameKo: '시리아', nameEn: 'Syria', code: 'SYR', iso2: 'SY', confederation: 'AFC', rank: 90 },
  { id: 'TJK', nameKo: '타지키스탄', nameEn: 'Tajikistan', code: 'TJK', iso2: 'TJ', confederation: 'AFC', rank: 100 },
  { id: 'PRK', nameKo: '북한', nameEn: 'North Korea', code: 'PRK', iso2: 'KP', confederation: 'AFC', rank: 110 },
  { id: 'IDN', nameKo: '인도네시아', nameEn: 'Indonesia', code: 'IDN', iso2: 'ID', confederation: 'AFC', rank: 130 },
  { id: 'TKM', nameKo: '투르크메니스탄', nameEn: 'Turkmenistan', code: 'TKM', iso2: 'TM', confederation: 'AFC', rank: 135 },
  { id: 'MAS', nameKo: '말레이시아', nameEn: 'Malaysia', code: 'MAS', iso2: 'MY', confederation: 'AFC', rank: 138 },
  { id: 'PHI', nameKo: '필리핀', nameEn: 'Philippines', code: 'PHI', iso2: 'PH', confederation: 'AFC', rank: 145 },
  { id: 'HKG', nameKo: '홍콩', nameEn: 'Hong Kong', code: 'HKG', iso2: 'HK', confederation: 'AFC', rank: 150 },
  { id: 'SGP', nameKo: '싱가포르', nameEn: 'Singapore', code: 'SGP', iso2: 'SG', confederation: 'AFC', rank: 155 },
  { id: 'AFG', nameKo: '아프가니스탄', nameEn: 'Afghanistan', code: 'AFG', iso2: 'AF', confederation: 'AFC', rank: 158 },
  { id: 'MYA', nameKo: '미얀마', nameEn: 'Myanmar', code: 'MYA', iso2: 'MM', confederation: 'AFC', rank: 160 },
  { id: 'YEM', nameKo: '예멘', nameEn: 'Yemen', code: 'YEM', iso2: 'YE', confederation: 'AFC', rank: 162 },
  { id: 'TPE', nameKo: '대만', nameEn: 'Chinese Taipei', code: 'TPE', iso2: 'TW', confederation: 'AFC', rank: 164 },
  { id: 'MDV', nameKo: '몰디브', nameEn: 'Maldives', code: 'MDV', iso2: 'MV', confederation: 'AFC', rank: 166 },
  { id: 'NEP', nameKo: '네팔', nameEn: 'Nepal', code: 'NEP', iso2: 'NP', confederation: 'AFC', rank: 176 },
  { id: 'CAM', nameKo: '캄보디아', nameEn: 'Cambodia', code: 'CAM', iso2: 'KH', confederation: 'AFC', rank: 180 },
  { id: 'BAN', nameKo: '방글라데시', nameEn: 'Bangladesh', code: 'BAN', iso2: 'BD', confederation: 'AFC', rank: 184 },
  { id: 'MNG', nameKo: '몽골', nameEn: 'Mongolia', code: 'MNG', iso2: 'MN', confederation: 'AFC', rank: 186 },
  { id: 'BHU', nameKo: '부탄', nameEn: 'Bhutan', code: 'BHU', iso2: 'BT', confederation: 'AFC', rank: 188 },
  { id: 'LAO', nameKo: '라오스', nameEn: 'Laos', code: 'LAO', iso2: 'LA', confederation: 'AFC', rank: 190 },
  { id: 'BRU', nameKo: '브루나이', nameEn: 'Brunei', code: 'BRU', iso2: 'BN', confederation: 'AFC', rank: 193 },
  { id: 'MAC', nameKo: '마카오', nameEn: 'Macau', code: 'MAC', iso2: 'MO', confederation: 'AFC', rank: 195 },
  { id: 'PAK', nameKo: '파키스탄', nameEn: 'Pakistan', code: 'PAK', iso2: 'PK', confederation: 'AFC', rank: 197 },
  { id: 'SRI', nameKo: '스리랑카', nameEn: 'Sri Lanka', code: 'SRI', iso2: 'LK', confederation: 'AFC', rank: 199 },
  { id: 'GUM', nameKo: '괌', nameEn: 'Guam', code: 'GUM', iso2: 'GU', confederation: 'AFC', rank: 202 },
  { id: 'TLS', nameKo: '동티모르', nameEn: 'Timor-Leste', code: 'TLS', iso2: 'TL', confederation: 'AFC', rank: 205 },

  // --- UEFA 추가(실제 55개 회원국 채우기, 러시아 제외) ---
  { id: 'IRL', nameKo: '아일랜드', nameEn: 'Republic of Ireland', code: 'IRL', iso2: 'IE', confederation: 'UEFA', rank: 60 },
  { id: 'MNE', nameKo: '몬테네그로', nameEn: 'Montenegro', code: 'MNE', iso2: 'ME', confederation: 'UEFA', rank: 68 },
  { id: 'ISR', nameKo: '이스라엘', nameEn: 'Israel', code: 'ISR', iso2: 'IL', confederation: 'UEFA', rank: 75 },
  { id: 'NIR', nameKo: '북아일랜드', nameEn: 'Northern Ireland', code: 'NIR', iso2: 'GB_NIR', confederation: 'UEFA', rank: 78 },
  { id: 'FRO', nameKo: '페로제도', nameEn: 'Faroe Islands', code: 'FRO', iso2: 'FO', confederation: 'UEFA', rank: 136 },
  { id: 'LIE', nameKo: '리히텐슈타인', nameEn: 'Liechtenstein', code: 'LIE', iso2: 'LI', confederation: 'UEFA', rank: 200 },

  // --- CAF 추가(실제 54개 회원국 채우기) ---
  { id: 'MTN', nameKo: '모리타니', nameEn: 'Mauritania', code: 'MTN', iso2: 'MR', confederation: 'CAF', rank: 105 },
  { id: 'NIG', nameKo: '니제르', nameEn: 'Niger', code: 'NIG', iso2: 'NE', confederation: 'CAF', rank: 112 },
  { id: 'ZIM', nameKo: '짐바브웨', nameEn: 'Zimbabwe', code: 'ZIM', iso2: 'ZW', confederation: 'CAF', rank: 121 },
  { id: 'GAM', nameKo: '감비아', nameEn: 'Gambia', code: 'GAM', iso2: 'GM', confederation: 'CAF', rank: 125 },
  { id: 'RWA', nameKo: '르완다', nameEn: 'Rwanda', code: 'RWA', iso2: 'RW', confederation: 'CAF', rank: 133 },
  { id: 'BDI', nameKo: '부룬디', nameEn: 'Burundi', code: 'BDI', iso2: 'BI', confederation: 'CAF', rank: 140 },
  { id: 'LBR', nameKo: '라이베리아', nameEn: 'Liberia', code: 'LBR', iso2: 'LR', confederation: 'CAF', rank: 145 },
  { id: 'BOT', nameKo: '보츠와나', nameEn: 'Botswana', code: 'BOT', iso2: 'BW', confederation: 'CAF', rank: 150 },
  { id: 'LES', nameKo: '레소토', nameEn: 'Lesotho', code: 'LES', iso2: 'LS', confederation: 'CAF', rank: 152 },
  { id: 'SWZ', nameKo: '에스와티니', nameEn: 'Eswatini', code: 'SWZ', iso2: 'SZ', confederation: 'CAF', rank: 155 },
  { id: 'SSD', nameKo: '남수단', nameEn: 'South Sudan', code: 'SSD', iso2: 'SS', confederation: 'CAF', rank: 168 },
  { id: 'MRI', nameKo: '모리셔스', nameEn: 'Mauritius', code: 'MRI', iso2: 'MU', confederation: 'CAF', rank: 175 },
  { id: 'CHA', nameKo: '차드', nameEn: 'Chad', code: 'CHA', iso2: 'TD', confederation: 'CAF', rank: 185 },
  { id: 'STP', nameKo: '상투메프린시페', nameEn: 'Sao Tome and Principe', code: 'STP', iso2: 'ST', confederation: 'CAF', rank: 188 },
  { id: 'DJI', nameKo: '지부티', nameEn: 'Djibouti', code: 'DJI', iso2: 'DJ', confederation: 'CAF', rank: 192 },
  { id: 'SOM', nameKo: '소말리아', nameEn: 'Somalia', code: 'SOM', iso2: 'SO', confederation: 'CAF', rank: 196 },
  { id: 'SEY', nameKo: '세이셸', nameEn: 'Seychelles', code: 'SEY', iso2: 'SC', confederation: 'CAF', rank: 199 },
  { id: 'ERI', nameKo: '에리트레아', nameEn: 'Eritrea', code: 'ERI', iso2: 'ER', confederation: 'CAF', rank: 204 },

  // --- OFC 추가(오세아니아 회원국 채우기) ---
  { id: 'PNG', nameKo: '파푸아뉴기니', nameEn: 'Papua New Guinea', code: 'PNG', iso2: 'PG', confederation: 'OFC', rank: 165 },
  { id: 'SAM', nameKo: '사모아', nameEn: 'Samoa', code: 'SAM', iso2: 'WS', confederation: 'OFC', rank: 185 },
  { id: 'TGA', nameKo: '통가', nameEn: 'Tonga', code: 'TGA', iso2: 'TO', confederation: 'OFC', rank: 190 },
  { id: 'COK', nameKo: '쿡제도', nameEn: 'Cook Islands', code: 'COK', iso2: 'CK', confederation: 'OFC', rank: 200 },
  { id: 'ASA', nameKo: '아메리칸사모아', nameEn: 'American Samoa', code: 'ASA', iso2: 'AS', confederation: 'OFC', rank: 205 },
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
  baseRatings: ratingsFromRank(raw.rank, resolveStyleBias(raw.id, raw.confederation, raw.styleBias)),
}))
