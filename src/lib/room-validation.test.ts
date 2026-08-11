import { describe, expect, it } from 'vitest'
import { emptyDB } from './store'
import { parseDB, parseGame, parseRoomSnapshot, parseRoomState } from './room-validation'

const players = [
  { id: 'p-1', name: '東' },
  { id: 'p-2', name: '南' },
  { id: 'p-3', name: '西' },
  { id: 'p-4', name: '北' },
]

const rules = {
  startPoints: 25_000,
  returnPoints: 30_000,
  uma: [30, 10, -10, -30],
  tiebreak: 'shimocha',
}

const validGame = {
  id: 'g-1',
  date: '2026-08-11',
  note: '',
  playerIds: players.map((player) => player.id),
  hands: [],
  finalPoints: {
    'p-1': 25_000,
    'p-2': 25_000,
    'p-3': 25_000,
    'p-4': 25_000,
  },
}

describe('room runtime validation', () => {
  it('accepts a valid empty room and valid game', () => {
    expect(parseRoomState({ players, rules, draft: null })).toEqual({ players, rules, draft: null })
    expect(parseGame(validGame)).toMatchObject({ id: 'g-1', playerIds: players.map((p) => p.id) })
  })

  it('accepts legacy DB rules with omitted default fields', () => {
    const db = emptyDB()
    expect(parseDB({ ...db, rules: {} }).rules).toEqual(rules)
  })

  it.each([
    ['players is not an array', { players: null, rules, draft: null }],
    [
      'player count exceeds four',
      { players: [...players, { id: 'p-5', name: '五' }], rules, draft: null },
    ],
    ['rules has null uma', { players, rules: { ...rules, uma: null }, draft: null }],
    ['draft has invalid playerIds', { players, rules, draft: { playerIds: 'bad', hands: [] } }],
  ])('rejects malformed room state: %s', (_name, value) => {
    expect(() => parseRoomState(value)).toThrow()
  })

  it.each([
    ['invalid date', { ...validGame, date: 'not-a-date' }],
    ['duplicate seats', { ...validGame, playerIds: ['p-1', 'p-1', 'p-3', 'p-4'] }],
    ['missing final point', { ...validGame, finalPoints: { 'p-1': 25_000 } }],
    [
      'invalid hand',
      {
        ...validGame,
        hands: [
          {
            id: 'h-1',
            type: 'ron',
            riichi: [],
            wins: [{ winner: 'unknown', han: 3, fu: 30 }],
            loser: 'p-2',
          },
        ],
      },
    ],
  ])('rejects malformed game: %s', (_name, value) => {
    expect(() => parseGame(value)).toThrow()
  })

  it('rejects malformed snapshots before the UI consumes them', () => {
    expect(() =>
      parseRoomSnapshot({
        roomCode: 'ABCD2345',
        revision: 1,
        state: {
          players: [null],
          rules,
          draft: null,
        },
        games: [],
      }),
    ).toThrow()
  })

  it('rejects a backup whose game references a deleted player', () => {
    expect(() =>
      parseDB({
        ...emptyDB(),
        players,
        games: [{ ...validGame, playerIds: [...validGame.playerIds.slice(0, 3), 'deleted'] }],
      }),
    ).toThrow()
  })
})
