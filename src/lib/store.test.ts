import { describe, it, expect } from 'vitest'
import { normalizeDB, emptyDB, SCHEMA_VERSION } from './store'
import type { Draft } from './domain'

describe('normalizeDB（進行中の半荘 draft の後方互換）', () => {
  it('draft が無い旧データ（v1）は draft:null になる', () => {
    const v1 = { version: 1, players: [], rules: {}, games: [] }
    expect(normalizeDB(v1).draft).toBeNull()
    expect(normalizeDB(v1).version).toBe(SCHEMA_VERSION)
  })

  it('席と局ログを持つ draft はそのまま保持する', () => {
    const draft: Draft = {
      mode: 'live',
      date: '2026-07-25',
      note: '',
      playerIds: ['a', 'b', 'c', 'd'],
      hands: [],
      finalPoints: {},
    }
    expect(normalizeDB({ draft }).draft).toEqual(draft)
  })

  it('壊れた draft（席順が無い等）は null に倒す', () => {
    expect(normalizeDB({ draft: { mode: 'live' } }).draft).toBeNull()
    expect(normalizeDB({ draft: 'nonsense' }).draft).toBeNull()
    expect(normalizeDB({ draft: 123 }).draft).toBeNull()
  })

  it('emptyDB は draft:null で始まる', () => {
    expect(emptyDB().draft).toBeNull()
  })
})
