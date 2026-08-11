import { afterEach, describe, expect, it } from 'vitest'
import { emptyDB } from './store'
import {
  clearGuestSessionDB,
  GUEST_SESSION_KEY,
  readGuestSessionDB,
  writeGuestSessionDB,
} from './guest-session'

function createStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key) {
      return values.get(key) ?? null
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null
    },
    removeItem(key) {
      values.delete(key)
    },
    setItem(key, value) {
      values.set(key, value)
    },
  }
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'sessionStorage')
})

describe('guest-session', () => {
  it('writes and reads a validated DB from sessionStorage', () => {
    const storage = createStorage()
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage })
    const db = emptyDB()
    db.players = [{ id: 'p-1', name: '太郎' }]

    writeGuestSessionDB(db)

    expect(storage.getItem(GUEST_SESSION_KEY)).toBeTruthy()
    expect(readGuestSessionDB()).toEqual(db)
  })

  it('removes malformed data instead of returning it', () => {
    const storage = createStorage()
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage })
    storage.setItem(GUEST_SESSION_KEY, '{"players":"壊れたデータ"}')

    expect(readGuestSessionDB()).toBeNull()
    expect(storage.getItem(GUEST_SESSION_KEY)).toBeNull()
  })

  it('clears the guest session', () => {
    const storage = createStorage()
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage })
    writeGuestSessionDB(emptyDB())

    clearGuestSessionDB()

    expect(readGuestSessionDB()).toBeNull()
  })
})
