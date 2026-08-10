import { afterEach, describe, expect, it } from 'vitest'
import { clearLegacyLocalDB, readLegacyLocalDB } from './legacy-local-data'
import { emptyDB, STORAGE_KEY } from './store'

function fakeStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => data.delete(key),
    setItem: (key: string, value: string) => data.set(key, value),
  }
}

const originalLocalStorage = globalThis.localStorage

function installLocalStorage(value?: string) {
  const storage = fakeStorage()
  if (value) storage.setItem(STORAGE_KEY, value)
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })
}

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  })
})

describe('legacy-local-data', () => {
  it('旧localStorageにゲームがあるときだけDBを返す', () => {
    const db = emptyDB()
    db.games.push({
      id: 'game-1',
      date: '2026-08-10',
      note: '',
      playerIds: [],
      finalPoints: {},
      hands: [],
    })
    installLocalStorage(JSON.stringify(db))

    expect(readLegacyLocalDB()?.games).toHaveLength(1)
  })

  it('旧localStorageが空またはゲームなしならnullを返す', () => {
    installLocalStorage(JSON.stringify(emptyDB()))
    expect(readLegacyLocalDB()).toBeNull()
  })

  it('明示的な移行完了後に旧キーを削除できる', () => {
    installLocalStorage(JSON.stringify(emptyDB()))
    clearLegacyLocalDB()
    expect(readLegacyLocalDB()).toBeNull()
  })
})
