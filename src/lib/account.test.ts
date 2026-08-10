import { describe, expect, it } from 'vitest'
import { isAccountRoom, isAccountState } from './account'

describe('account helpers', () => {
  it('validates the authenticated account response', () => {
    expect(
      isAccountState({
        loginEnabled: true,
        authenticated: true,
        user: { id: 'u-1', email: 'user@example.com', displayName: 'User' },
      }),
    ).toBe(true)
    expect(isAccountState({ loginEnabled: false, authenticated: false, user: null })).toBe(true)
    expect(isAccountState({ loginEnabled: true, authenticated: true, user: null })).toBe(true)
    expect(isAccountState({ loginEnabled: true, authenticated: 'yes', user: null })).toBe(false)
  })

  it('validates room list entries', () => {
    expect(
      isAccountRoom({
        roomCode: 'ABCD2345',
        role: 'owner',
        createdAt: 1,
        updatedAt: 2,
        gameCount: 3,
      }),
    ).toBe(true)
    expect(
      isAccountRoom({
        roomCode: 'ABCD2345',
        role: 'admin',
        createdAt: 1,
        updatedAt: 2,
        gameCount: 3,
      }),
    ).toBe(false)
  })
})
