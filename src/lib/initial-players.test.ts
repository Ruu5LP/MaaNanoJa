import { describe, expect, it } from 'vitest'
import { emptyDB } from './store'
import { prepareInitialPlayers } from './initial-players'

describe('initial players', () => {
  it('prepares four editable placeholder players for first use', () => {
    expect(prepareInitialPlayers(emptyDB()).players).toEqual([
      { id: 'p-1', name: 'ユーザー1' },
      { id: 'p-2', name: 'ユーザー2' },
      { id: 'p-3', name: 'ユーザー3' },
      { id: 'p-4', name: 'ユーザー4' },
    ])
  })

  it('does not replace existing players or data', () => {
    const db = emptyDB()
    db.players = [{ id: 'p-1', name: 'Ruu' }]

    expect(prepareInitialPlayers(db)).toBe(db)
  })
})
