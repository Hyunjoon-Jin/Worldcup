export type GroupLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L'

export interface GroupSlot {
  group: GroupLetter
  slot: 1 | 2 | 3 | 4
  teamId: string | null
}

export interface GroupStanding {
  teamId: string
  played: number
  win: number
  draw: number
  loss: number
  goalsFor: number
  goalsAgainst: number
  points: number
  fairPlayScore: number
}
