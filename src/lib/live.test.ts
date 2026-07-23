import { describe, it, expect } from 'vitest'
import { shouldShowLive, LIVE_STALE_MS, type LiveSnapshot } from './live'

/** テスト用の実況スナップショットを作る補助。 */
function snap(
  over: Partial<LiveSnapshot> & { editor?: string; ts: number; now: number },
): LiveSnapshot {
  const { editor = 'other', ts, now, live, ...rest } = over
  return {
    ts,
    now,
    live:
      live !== undefined
        ? live
        : { editor, playerIds: ['a', 'b', 'c', 'd'], hands: [], honbaAdjust: 0, form: null },
    ...rest,
  }
}

describe('shouldShowLive', () => {
  it('スナップショットが null なら映さない', () => {
    expect(shouldShowLive(null, 'me')).toBe(false)
  })

  it('実況が無ければ映さない', () => {
    expect(shouldShowLive(snap({ live: null, ts: 0, now: 0 }), 'me')).toBe(false)
  })

  it('自分の端末の実況は映さない（自分の入力を自分で映さない）', () => {
    expect(shouldShowLive(snap({ editor: 'me', ts: 1000, now: 1000 }), 'me')).toBe(false)
  })

  it('別端末の新しい実況は映す', () => {
    expect(shouldShowLive(snap({ editor: 'other', ts: 1000, now: 1500 }), 'me')).toBe(true)
  })

  it('鮮度切れ（更新が途絶えた）実況は映さない', () => {
    expect(shouldShowLive(snap({ editor: 'other', ts: 0, now: LIVE_STALE_MS + 1 }), 'me')).toBe(
      false,
    )
  })

  it('閾値ちょうど手前なら映す', () => {
    expect(shouldShowLive(snap({ editor: 'other', ts: 0, now: LIVE_STALE_MS - 1 }), 'me')).toBe(
      true,
    )
  })
})
