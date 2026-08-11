import { describe, it, expect } from 'vitest'
import { computeStats, filterGamesByPeriod } from './stats'
import { emptyDB } from './store'
import type { Game } from './domain'

function game(over: Partial<Game>): Game {
  return {
    id: 'g',
    date: '2026-07-25',
    note: '',
    playerIds: ['a', 'b', 'c', 'd'],
    hands: [],
    finalPoints: {},
    ...over,
  }
}

describe('filterGamesByPeriod', () => {
  const games = [game({ id: 'g1', date: '2026-07-25' }), game({ id: 'g2', date: '2026-06-01' })]

  it('all のときは全件そのまま', () => {
    expect(filterGamesByPeriod(games, 'all', '2026-07-25')).toEqual(games)
  })

  it('today のときは today と date が一致する対局だけ残す', () => {
    const result = filterGamesByPeriod(games, 'today', '2026-07-25')
    expect(result.map((g) => g.id)).toEqual(['g1'])
  })

  it('today に一致する対局が無ければ空配列', () => {
    expect(filterGamesByPeriod(games, 'today', '2026-01-01')).toEqual([])
  })
})

describe('computeStats', () => {
  it('点数修正を参加局数に含めない', () => {
    const db = emptyDB()
    db.players = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
      { id: 'd', name: 'D' },
    ]
    db.games = [
      {
        id: 'g1',
        date: '2026-07-25',
        note: '',
        playerIds: ['a', 'b', 'c', 'd'],
        hands: [
          { id: 'adjust', type: 'adjust', riichi: [], delta: { a: 500, b: -500 } },
          { id: 'tsumo', type: 'tsumo', winner: 'a', han: 1, fu: 30, riichi: [] },
        ],
        finalPoints: {},
      },
    ]

    const stats = computeStats(db)
    expect(stats.find((stat) => stat.playerId === 'a')?.handsPlayed).toBe(1)
  })
})
