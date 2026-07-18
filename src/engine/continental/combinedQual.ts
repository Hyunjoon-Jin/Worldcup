import type { QualificationResult } from '../../types/qualification'
import { stageNameOfGroup } from '../qualification/rules'

/**
 * 통합 예선(combinedWcq: AFC 아시안컵)에서 대륙컵 본선 '직행 자격'을 이미 확보한 팀 집합.
 *
 * 실제 규칙: 월드컵·아시안컵은 하나의 캠페인으로 치러지고, 월드컵 2차 예선 각 조 1·2위(= 3차 예선 진출팀,
 * 18개국)가 아시안컵 본선에 직행한다. 시뮬레이터의 AFC 구조에서 '3차 예선' 단계 경기에 참가한 팀이
 * 곧 2차 예선을 통과(각 조 1·2위)한 팀이므로, 3차 예선 도달 = 아시안컵 직행 자격으로 판정한다.
 *
 * 이 집합을 대륙컵 예선 랭킹/확률의 최상위 블록으로 삼아, '월드컵 2차 예선 통과 → 아시안컵 진출 확보'를
 * 정확히 반영한다(정적 FIFA 랭킹이 아니라 실제 캠페인 성적으로).
 */
export function combinedCupDirectQualified(r: QualificationResult): Set<string> {
  const set = new Set<string>()
  for (const m of r.matches) {
    if (stageNameOfGroup(r, m.group) === '3차 예선') {
      set.add(m.homeTeamId)
      set.add(m.awayTeamId)
    }
  }
  return set
}
