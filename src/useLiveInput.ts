// 入力中プレビュー（実況）の React フック。
//
// - usePublishLive: この端末が半荘を入力中なら、その状態をサーバへ流し続ける（発信側）。
// - useWatchLive:   他端末の入力中状態を受け取り、映すべきなら返す（受信側）。
//
// enabled=false（サーバ非同期モード）なら双方とも何もしない＝従来どおり。
// 実況は best-effort。落ちても記録（DB同期）には影響しない。
import { useEffect, useRef, useState } from 'react'
import { fetchLive, pushLive, shouldShowLive, type LiveInput, type LiveSnapshot } from './lib/live'

const WATCH_MS = 1000 // 他端末の実況を見に行く間隔
const HEARTBEAT_MS = 2000 // 入力中に実況を再送して鮮度を保つ間隔（LIVE_STALE_MS より十分短く）
const DEVICE_KEY = 'maa.deviceId'

/** この端末の安定したID。実況の発信元判定に使う（自分の実況は自分で映さない）。 */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = 'dev-' + Math.random().toString(36).slice(2, 10)
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return 'dev-anon'
  }
}

/**
 * 入力中の状態を実況として流す。payload が null の間は「入力していない」。
 * 中身が変わるたび即送信し、加えて一定間隔で再送（ハートビート）して鮮度を保つ。
 * アンマウント時は実況を消す（取りこぼしてもサーバ側の鮮度切れで自然に消える）。
 */
export function usePublishLive(payload: LiveInput | null, enabled: boolean): void {
  const latest = useRef<LiveInput | null>(payload)
  latest.current = payload

  // 中身が変わったら即送信。
  useEffect(() => {
    if (!enabled) return
    void pushLive(payload)
  }, [enabled, payload])

  // ハートビート: 入力中は再送し続けて、他端末側で鮮度切れ扱いにならないようにする。
  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => {
      if (latest.current) void pushLive(latest.current)
    }, HEARTBEAT_MS)
    return () => clearInterval(timer)
  }, [enabled])

  // 入力画面を離れたら実況を消す。
  useEffect(() => {
    if (!enabled) return
    return () => {
      void pushLive(null)
    }
  }, [enabled])
}

/** 他端末の入力中プレビューを購読する。映すべきものが無ければ null。 */
export function useWatchLive(enabled: boolean): LiveInput | null {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null)
  const me = useRef(deviceId())

  useEffect(() => {
    if (!enabled) {
      setSnap(null)
      return
    }
    let alive = true
    const tick = async () => {
      const s = await fetchLive()
      // 瞬断で null が返ったときは直前の状態を保つ（チラつき防止）。
      // 実況が本当に無いときは s={live:null,...} が返るので、それはそのまま反映される。
      if (alive && s != null) setSnap(s)
    }
    void tick()
    const timer = setInterval(() => void tick(), WATCH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [enabled])

  return shouldShowLive(snap, me.current) ? snap!.live : null
}
