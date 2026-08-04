import { describe, expect, it } from 'vitest'
import { emptyDB } from './store'
import {
  fromRoomSnapshot,
  isNewerRoomSnapshot,
  isRoomCode,
  normalizeRoomCode,
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
})
