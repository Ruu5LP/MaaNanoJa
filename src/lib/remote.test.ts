import { describe, it, expect } from 'vitest'
import { shouldAdopt, isServerEmpty, type Snapshot } from './remote'
import { emptyDB } from './store'

// db の中身は判定に関係しない（shouldAdopt/isServerEmpty は db が null かどうかだけ見る）。
// 「サーバにDBが在る」状態を表すのに、非nullなDBとして emptyDB() を使う。
const snap = (rev: number, empty = false): Snapshot => ({
  rev,
  db: empty ? null : emptyDB(),
})

describe('shouldAdopt', () => {
  it('サーバの版数が自分の同期済み版数より新しければ取り込む', () => {
    expect(shouldAdopt(snap(3), 2)).toBe(true)
  })

  it('同じ版数なら取り込まない（自分が書いた直後のエコーを拾わない）', () => {
    expect(shouldAdopt(snap(3), 3)).toBe(false)
  })

  it('古い版数なら取り込まない', () => {
    expect(shouldAdopt(snap(1), 5)).toBe(false)
  })

  it('サーバが空(db=null)なら取り込まない', () => {
    expect(shouldAdopt(snap(9, true), 0)).toBe(false)
  })
})

describe('isServerEmpty', () => {
  it('db が null のとき空とみなす（種を蒔く対象）', () => {
    expect(isServerEmpty(snap(0, true))).toBe(true)
  })

  it('db があれば空ではない', () => {
    expect(isServerEmpty(snap(1))).toBe(false)
  })
})
