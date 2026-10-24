import { describe, expect, it } from 'vitest'
import type { Game, Hand } from './domain'
import { computeOpponentStats } from './opponent-stats'
import { filterGamesByPeriod } from './stats'
import { emptyDB } from './store'

function fixture(hands: Hand[]) {
  const db = emptyDB()
  db.players = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }))
  db.games = [
    {
      id: 'g1',
      date: '2026-10-24',
      note: '',
      playerIds: ['a', 'b', 'c', 'd'],
      hands,
      finalPoints: {},
    },
  ]
  return db
}

describe('computeOpponentStats', () => {
  it('選択者を替えても放銃者と和了者の方向は変えず、供託を支払に含めない', () => {
    const db = fixture([
      { id: 'draw', type: 'draw', riichi: ['c'], tenpai: ['a'] },
      {
        id: 'ron',
        type: 'ron',
        loser: 'b',
        wins: [{ winner: 'a', han: 2, fu: 30 }],
        riichi: ['a'],
        honbaOverride: 2,
      },
    ])
    const winner = computeOpponentStats(db, 'a')
    const loser = computeOpponentStats(db, 'b')
    expect(winner.details[0]).toMatchObject({
      loserId: 'b',
      winnerId: 'a',
      base: 2900,
      honba: 600,
      pot: 2000,
      total: 5500,
      direction: 'ron',
    })
    expect(loser.details[0]).toMatchObject({
      loserId: 'b',
      winnerId: 'a',
      base: 2900,
      honba: 600,
      pot: 2000,
      total: 3500,
      direction: 'houju',
    })
    expect(winner.opponents.find((row) => row.opponent.id === 'b')?.netBase).toBe(2900)
    expect(loser.opponents.find((row) => row.opponent.id === 'a')?.netBase).toBe(-2900)
    expect(computeOpponentStats(db, 'c').details).toEqual([])
  })

  it('ダブロンの本場を各和了者へ配り、供託は最初の和了者だけに配る', () => {
    const db = fixture([
      {
        id: 'double',
        type: 'ron',
        loser: 'd',
        wins: [
          { winner: 'b', han: 1, fu: 30 },
          { winner: 'a', han: 1, fu: 30 },
        ],
        riichi: ['c'],
        honbaOverride: 1,
      },
    ])
    const result = computeOpponentStats(db, 'd')
    expect(result.details).toHaveLength(2)
    expect(
      result.details.map(({ winnerId, base, honba, pot, total }) => ({
        winnerId,
        base,
        honba,
        pot,
        total,
      })),
    ).toEqual([
      { winnerId: 'b', base: 1000, honba: 300, pot: 1000, total: 1300 },
      { winnerId: 'a', base: 1500, honba: 300, pot: 0, total: 1800 },
    ])
    expect(computeOpponentStats(db, 'a').details[0]?.total).toBe(1800)
    expect(computeOpponentStats(db, 'b').details[0]?.total).toBe(2300)
  })

  it('ツモで受け取った供託を次のロンに再計上せず、点数修正を集計しない', () => {
    const db = fixture([
      { id: 'draw', type: 'draw', riichi: ['b'], tenpai: [] },
      { id: 'tsumo', type: 'tsumo', winner: 'c', han: 1, fu: 30, riichi: [] },
      { id: 'adjust', type: 'adjust', delta: { a: 1000 }, riichi: [] },
      {
        id: 'ron',
        type: 'ron',
        loser: 'd',
        wins: [{ winner: 'b', han: 1, fu: 30 }],
        riichi: [],
      },
    ])
    const result = computeOpponentStats(db, 'b')
    expect(result.details).toHaveLength(1)
    expect(result.details[0]?.pot).toBe(0)
  })

  it('表示期間と参加者で絞り込み、局の識別情報と削除済みメンバーを保持する', () => {
    const db = fixture([
      { id: 'ron', type: 'ron', loser: 'b', wins: [{ winner: 'a', han: 1, fu: 30 }], riichi: [] },
    ])
    const original = db.games[0]!
    const previous: Game = { ...original, id: 'g0', date: '2026-10-23' }
    db.games.unshift(previous)
    db.players = db.players.filter((player) => player.id !== 'b')
    const result = computeOpponentStats(
      { ...db, games: filterGamesByPeriod(db.games, 'today', '2026-10-24') },
      'a',
    )
    expect(result.details).toHaveLength(1)
    expect(result.details[0]).toMatchObject({
      gameId: 'g1',
      gameNumber: 1,
      date: '2026-10-24',
      handId: 'ron',
      label: '東1局',
    })
    expect(result.opponents.find((row) => row.opponent.id === 'b')?.opponent.name).toBe(
      '削除されたメンバー',
    )
    expect(computeOpponentStats(db, 'unknown')).toEqual({ opponents: [], details: [] })
  })
})
