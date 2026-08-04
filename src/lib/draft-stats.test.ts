import { describe, expect, it } from 'vitest'
import { currentDraftPoints } from './draft-stats'
import type { Draft, Player, Rules } from './domain'

const players: Player[] = [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
  { id: 'c', name: 'C' },
  { id: 'd', name: 'D' },
]

const rules: Rules = {
  startPoints: 25000,
  returnPoints: 30000,
  uma: [15, 5, -5, -15],
  tiebreak: 'shimocha',
}

function draft(patch: Partial<Draft>): Draft {
  return {
    mode: 'quick',
    date: '2026-08-05',
    note: '',
    playerIds: ['a', 'b', 'c', 'd'],
    hands: [],
    finalPoints: {},
    form: null,
    ...patch,
  }
}

describe('currentDraftPoints', () => {
  it('uses quick mode values and sorts by current points', () => {
    const result = currentDraftPoints(
      draft({ quickPoints: { a: '24000', b: '31000', c: '25000', d: '' } }),
      players,
      rules,
    )
    expect(result.map((item) => [item.playerId, item.points])).toEqual([
      ['b', 31000],
      ['c', 25000],
      ['d', 25000],
      ['a', 24000],
    ])
  })

  it('replays live mode hands', () => {
    const result = currentDraftPoints(
      draft({
        mode: 'live',
        hands: [{ id: 'h1', type: 'tsumo', winner: 'a', han: 1, fu: 30, riichi: [] }],
      }),
      players,
      rules,
    )
    expect(result[0]?.playerId).toBe('a')
    expect(result.reduce((sum, item) => sum + item.points, 0)).toBe(100000)
  })

  it('falls back to finalPoints for older quick drafts', () => {
    const result = currentDraftPoints(
      draft({ finalPoints: { a: 26000, b: 24000, c: 25000, d: 25000 } }),
      players,
      rules,
    )
    expect(result[0]?.points).toBe(26000)
  })
})
