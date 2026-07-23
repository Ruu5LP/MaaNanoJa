// LAN同期サーバ（server/server.mjs）との通信境界。
// store.ts が localStorage の境界であるのと同じく、ここが「ネットワークIOの境界」。
// 副作用のある通信関数と、判断だけを行う純粋関数（テスト対象）を分けて置く。
import type { DB } from './domain'
import { normalizeDB } from './store'

/** サーバが持つ共有状態のスナップショット。rev は保存のたびに1ずつ増える版数。 */
export interface Snapshot {
  rev: number
  db: DB | null
}

const API = '/api/db'

/** 現在の共有状態を取得する。サーバが居ない/失敗したときは null。 */
export async function fetchSnapshot(): Promise<Snapshot | null> {
  try {
    const res = await fetch(API, { cache: 'no-store' })
    if (!res.ok) return null
    const json = (await res.json()) as { rev?: unknown; db?: unknown }
    return {
      rev: typeof json.rev === 'number' ? json.rev : 0,
      db: json.db == null ? null : normalizeDB(json.db),
    }
  } catch {
    return null
  }
}

/** DBをサーバへ保存する。成功したら新しい rev を返す。失敗は null。 */
export async function pushDB(db: DB): Promise<number | null> {
  try {
    const res = await fetch(API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ db }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { rev?: unknown }
    return typeof json.rev === 'number' ? json.rev : null
  } catch {
    return null
  }
}

// ── 以下、純粋関数（副作用なし・テスト対象） ──

/**
 * ポーリングで得た snapshot を、この端末が取り込むべきか判定する。
 * サーバの版数(rev)が、自分が最後に同期した版数より新しいときだけ true。
 * （＝別端末が書き込んだ変更を拾う。自分が書いた直後のエコーは拾わない。）
 */
export function shouldAdopt(snapshot: Snapshot, syncedRev: number): boolean {
  return snapshot.db != null && snapshot.rev > syncedRev
}

/**
 * 起動時、サーバの初期状態を見て「サーバがまだ空か（この端末のデータで種を蒔くべきか）」を判定する。
 * db が null＝まだ誰も書いていない。
 */
export function isServerEmpty(snapshot: Snapshot): boolean {
  return snapshot.db == null
}
