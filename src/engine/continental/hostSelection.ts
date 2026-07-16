import type { CupFormat } from '../../data/continental/formats'
import { nationsByConfederation } from '../../data/nations'
import { createSeededRandom, shuffleWith, type RandomFn } from '../rng'
import { CO_HOST_AFFINITY, hostWeight } from '../../data/continental/hosts'
import type { Team } from '../../types/team'

/** 공동개최가 발생할 확률(인접 파트너가 있을 때). */
const CO_HOST_PROB = 0.35
/** 두 번째 공동개최국(3국 개최, 미국 등)을 추가할 확률. */
const THIRD_HOST_PROB = 0.5

/** 가중치에 비례해 한 팀을 뽑는다(개최 적합도 = 경제규모·인프라 프록시). */
function weightedPick(pool: Team[], rand: RandomFn): Team {
  const weights = pool.map(hostWeight)
  const total = weights.reduce((s, w) => s + w, 0)
  let r = rand() * total
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

/**
 * 대륙컵 한 에디션의 개최국(들)을 결정론적으로 자동 선정한다. 시드가 같으면 항상 같은 개최국이 나오므로,
 * 개최국은 대회 에디션(cupId+연도)의 고정 속성이 된다. 개최 적합도(경제규모·인프라 프록시) 가중 랜덤으로
 * 주개최국을 뽑고, 지리적으로 인접한 파트너가 있으면 일정 확률로 공동개최(2~3국)한다.
 */
export function selectCupHosts(format: CupFormat, seed: string): string[] {
  const pool = [...new Map(format.confeds.flatMap((c) => nationsByConfederation(c)).map((t) => [t.id, t])).values()]
  if (pool.length === 0) return []
  const rand = createSeededRandom(`${seed}-cuphost`)
  const primary = weightedPick(pool, rand)
  const hosts = [primary.id]

  const inPool = (id: string) => pool.some((t) => t.id === id)
  const partners = shuffleWith((CO_HOST_AFFINITY[primary.id] ?? []).filter(inPool), rand)
  if (partners.length > 0 && rand() < CO_HOST_PROB) {
    hosts.push(partners[0])
    // 3국 공동개최(미국-캐나다-멕시코 등)는 추가 확률 게이트로만.
    if (partners.length > 1 && rand() < THIRD_HOST_PROB) hosts.push(partners[1])
  }
  return hosts
}
