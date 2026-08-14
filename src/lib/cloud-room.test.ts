import { describe, expect, it } from 'vitest'
import { emptyDB } from './store'
import {
  fromRoomSnapshot,
  isNewerRoomSnapshot,
  isRoomCode,
  normalizeRoomCode,
  toRoomCreationPayload,
  toRoomState,
} from './cloud-room'

describe('cloud room helpers', () => {
  it('normalizes a room code and rejects ambiguous or invalid codes', () => {
    expect(normalizeRoomCode(' abcd2345 ')).toBe('ABCD2345')
    expect(isRoomCode('ABCD2345')).toBe(true)
    expect(normalizeRoomCode('abcde234')).toBe('ABCDE234')
    expect(normalizeRoomCode('ABCDO345')).toBe(null)
    expect(normalizeRoomCode('ABCD234')).toBe(null)
  })

  it('round-trips the cloud-owned room state without changing games', () => {
    const db = emptyDB()
    db.players = [{ id: 'p-1', name: 'Ruu' }]
    const snapshot = {
      roomCode: 'ABCD2345',
      revision: 3,
      state: toRoomState(db),
      games: [],
    }

    expect(fromRoomSnapshot(snapshot, db.version)).toEqual(db)
  })

  it('only adopts a snapshot with a newer revision', () => {
    const snapshot = {
      roomCode: 'ABCD2345',
      revision: 4,
      state: toRoomState(emptyDB()),
      games: [],
    }

    expect(isNewerRoomSnapshot(snapshot, 3)).toBe(true)
    expect(isNewerRoomSnapshot(snapshot, 4)).toBe(false)
    expect(isNewerRoomSnapshot(snapshot, 5)).toBe(false)
  })

  it('includes local games only when migration is explicitly enabled', () => {
    const db = emptyDB()
    db.games = [
      {
        id: 'g-1',
        date: '2026-08-10',
        note: '過去対局',
        playerIds: ['p-1', 'p-2', 'p-3', 'p-4'],
        hands: [],
        finalPoints: { 'p-1': 25000 },
      },
    ]

    expect(toRoomCreationPayload(db, { migrateGames: false }).games).toEqual([])
    expect(toRoomCreationPayload(db, { migrateGames: true }).games).toEqual(db.games)
  })

  it('prepares four placeholder players for a new room', () => {
    expect(toRoomCreationPayload(emptyDB(), { migrateGames: false }).state.players).toEqual([
      { id: 'p-1', name: 'ユーザー1' },
      { id: 'p-2', name: 'ユーザー2' },
      { id: 'p-3', name: 'ユーザー3' },
      { id: 'p-4', name: 'ユーザー4' },
    ])
  })

  it('keeps existing room members and data unchanged', () => {
    const db = emptyDB()
    db.players = [{ id: 'p-1', name: 'Ruu' }]
    db.games = [
      {
        id: 'g-1',
        date: '2026-08-10',
        note: '',
        playerIds: ['p-1'],
        hands: [],
        finalPoints: {},
      },
    ]

    expect(toRoomCreationPayload(db, { migrateGames: true }).state.players).toEqual(db.players)
    expect(toRoomCreationPayload(db, { migrateGames: true }).games).toEqual(db.games)
  })
})
