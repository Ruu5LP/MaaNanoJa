import { describe, it, expect } from 'vitest'
import { computeScoreTrend, computeStats, filterGamesByPeriod } from './stats'
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

  it('和了の内訳、翻符平均、立直和了、親和了を集計する', () => {
    const db = emptyDB()
    db.players = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
      { id: 'd', name: 'D' },
    ]
    db.games = [
      game({
        hands: [
          { id: 'h1', type: 'tsumo', winner: 'a', han: 3, fu: 30, riichi: ['a'] },
          {
            id: 'h2',
            type: 'ron',
            wins: [{ winner: 'b', han: 2, fu: 40 }],
            loser: 'c',
            riichi: [],
          },
        ],
      }),
    ]

    const stats = computeStats(db)
    const a = stats.find((stat) => stat.playerId === 'a')!
    const b = stats.find((stat) => stat.playerId === 'b')!

    expect(a).toMatchObject({
      agari: 1,
      ron: 0,
      tsumo: 1,
      avgHan: 3,
      avgFu: 30,
      riichi: 1,
      riichiAgari: 1,
      riichiAgariRate: 1,
      dealerHands: 2,
      dealerAgari: 1,
      dealerAgariRate: 0.5,
    })
    expect(b).toMatchObject({
      agari: 1,
      ron: 1,
      tsumo: 0,
      avgHan: 2,
      avgFu: 40,
      dealerHands: 0,
      dealerAgariRate: null,
    })
  })

  it('ダブロンは和了者ごと、放銃は1回として集計する', () => {
    const db = emptyDB()
    db.players = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
      { id: 'd', name: 'D' },
    ]
    db.games = [
      game({
        hands: [
          {
            id: 'h1',
            type: 'ron',
            wins: [
              { winner: 'a', han: 1, fu: 30 },
              { winner: 'b', han: 2, fu: 30 },
            ],
            loser: 'd',
            riichi: [],
          },
        ],
      }),
    ]

    const stats = computeStats(db)
    expect(stats.find((stat) => stat.playerId === 'a')).toMatchObject({ agari: 1, ron: 1 })
    expect(stats.find((stat) => stat.playerId === 'b')).toMatchObject({ agari: 1, ron: 1 })
    expect(stats.find((stat) => stat.playerId === 'd')).toMatchObject({ houju: 1 })
  })
})

describe('computeScoreTrend', () => {
  it('対局ごとのスコアと累計スコアを表示順に返す', () => {
    const db = emptyDB()
    db.players = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
      { id: 'd', name: 'D' },
    ]
    db.games = [
      game({ id: 'g1', finalPoints: { a: 35000, b: 25000, c: 20000, d: 20000 } }),
      game({ id: 'g2', finalPoints: { a: 25000, b: 35000, c: 20000, d: 20000 } }),
    ]

    const trend = computeScoreTrend(db)
    expect(trend).toHaveLength(2)
    expect(trend[0]!.gameId).toBe('g1')
    expect(trend[0]!.scores.a).toBe(55)
    expect(trend[0]!.cumulativeScores.a).toBe(55)
    expect(trend[1]!.scores.b).toBe(55)
    expect(trend[1]!.cumulativeScores.a).toBe(60)
    expect(trend[1]!.cumulativeScores.b).toBe(60)
  })
})
