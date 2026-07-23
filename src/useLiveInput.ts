// 入力中プレビュー（実況）の React フック。
//
// - usePublishLive: この端末が半荘を入力中なら、その状態をサーバへ流し続ける（発信側）。
// - useWatchLive:   他端末の入力中状態を受け取り、映すべきなら返す（受信側）。
//
// enabled=false（サーバ非同期モード）なら双方とも何もしない＝従来どおり。
// 実況は best-effort。落ちても記録（DB同期）には影響しない。
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { fetchLive, pushLive, shouldShowLive, type LiveInput, type LiveSnapshot } from './lib/live'

const WATCH_MS = 1000 // 他端末の実況を見に行く間隔
const HEARTBEAT_MS = 2000 // 入力中に実況を再送して鮮度を保つ間隔（LIVE_STALE_MS より十分短く）
const DEVICE_KEY = 'maa.deviceId'

// この端末が今、実況を発信中か（席選び中 or 局ログ入力中）を表す共有フラグ。
//
// 発信中＝「自分が今まさに実況スロットの主」なので、他端末の実況は画面に出さない。
// 出してしまうと、サーバの実況スロット（1枠・last-write-wins）を自分の発信と他端末の発信が
// 交互に奪い合い、受信側で観戦画面が「出たり消えたり」して点滅する。発信中の端末はそもそも
// 自分の入力に集中している＝他人の観戦は不要なので、発信中は受信表示を止めるのが素直。
let publishing = false
const publishingSubs = new Set<() => void>()
function setPublishing(v: boolean): void {
  if (publishing === v) return
  publishing = v
  publishingSubs.forEach((fn) => fn())
}
function subscribePublishing(cb: () => void): () => void {
  publishingSubs.add(cb)
  return () => {
    publishingSubs.delete(cb)
  }
}

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

  // 自分が発信中かを共有フラグに反映（真偽が変わったときだけ）。受信側が点滅しないよう、
  // 発信中は他端末の実況表示を止めるのに使う。
  const active = enabled && payload != null
  useEffect(() => {
    setPublishing(active)
    return () => setPublishing(false)
  }, [active])

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
  // 自分が発信中（席選び中／入力中）なら、他端末の実況は出さない（点滅防止＋入力に集中）。
  const amPublishing = useSyncExternalStore(
    subscribePublishing,
    () => publishing,
    () => publishing,
  )

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

  if (amPublishing) return null
  return shouldShowLive(snap, me.current) ? snap!.live : null
}
