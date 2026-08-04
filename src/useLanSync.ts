// LAN同期を App に差し込むフック。
//
// 役割: サーバ（server/server.mjs）が居れば、この端末のDBをサーバと同期する。
//   - 起動時: サーバが空ならこの端末のデータで種を蒔く。データがあればそれを採用する。
//   - 受信: 一定間隔でサーバを見に行き、別端末の変更があれば取り込む。
//   - 送信: この端末でDBが変わったら、サーバへ保存する。
// サーバが居なければ何もしない（＝従来どおり localStorage だけで動く）。
//
// 同期の単位はDB全体・版数(rev)で管理する last-write-wins。
// 家麻雀では「1局ぶんを誰か1人が入力する」流れなので、同時刻の衝突は実質起きない前提。
import { useEffect, useRef, useState } from 'react'
import type { DB } from './lib/domain'
import { fetchSnapshot, pushDB, shouldAdopt, isServerEmpty } from './lib/remote'

/** 'local' = 単独 / 'connecting' = 接続確認中 / 'sync' = LAN / 'cloud' = クラウド */
export type SyncMode = 'local' | 'connecting' | 'sync' | 'cloud'

/** 同期状態の表示ラベル。App/BoardView の両方で使う。
 *  App.tsx に置くと react-refresh/only-export-components（コンポーネント以外の
 *  export禁止）に引っかかるので、コンポーネントを持たないこのファイルに置く。 */
export const SYNC_LABEL: Record<SyncMode, string> = {
  local: '📴 この端末だけ',
  connecting: '⏳ 接続確認中…',
  sync: '📶 LAN同期中',
  cloud: '☁️ クラウド同期中',
}

const POLL_MS = 1000

export function useLanSync(db: DB, setDB: (next: DB) => void, enabled = true): { mode: SyncMode } {
  const [mode, setMode] = useState<SyncMode>(enabled ? 'connecting' : 'local')

  // 最後にサーバと一致させた版数と、その中身(JSON)。ref で保持し、エコー送信を防ぐ。
  const syncedRev = useRef(0)
  const syncedJson = useRef<string | null>(null)
  const started = useRef(false)

  // 起動時: サーバの有無を確認し、あれば初期同期する。
  useEffect(() => {
    if (!enabled) {
      started.current = false
      setMode('local')
      return
    }
    if (started.current) return // StrictMode等の二重実行を防ぐ
    started.current = true

    let alive = true
    ;(async () => {
      const snap = await fetchSnapshot()
      if (!alive) return
      if (snap == null) {
        setMode('local') // サーバが居ない → 従来どおり
        return
      }
      if (isServerEmpty(snap)) {
        // サーバはまだ空。この端末のデータで種を蒔く。
        const rev = await pushDB(db)
        if (!alive) return
        syncedRev.current = rev ?? 0
        syncedJson.current = JSON.stringify(db)
      } else if (snap.db != null) {
        // サーバに既にデータあり。それを採用する（採用ぶんは送り返さない）。
        syncedRev.current = snap.rev
        syncedJson.current = JSON.stringify(snap.db)
        setDB(snap.db)
      }
      setMode('sync')
    })()

    return () => {
      alive = false
    }
    // 起動時に一度だけ実行する（db/setDB の最新は ref/クロージャで足りる）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  // 受信: 一定間隔でサーバを見に行き、別端末の変更を取り込む。
  useEffect(() => {
    if (!enabled) return
    if (mode !== 'sync') return
    let alive = true
    const timer = setInterval(async () => {
      const snap = await fetchSnapshot()
      if (!alive || snap == null || snap.db == null) return
      if (shouldAdopt(snap, syncedRev.current)) {
        syncedRev.current = snap.rev
        syncedJson.current = JSON.stringify(snap.db)
        setDB(snap.db)
      }
    }, POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [enabled, mode, setDB])

  // 送信: この端末で db が変わったら（＝採用ぶんでなければ）サーバへ保存する。
  useEffect(() => {
    if (!enabled) return
    if (mode !== 'sync') return
    const json = JSON.stringify(db)
    if (json === syncedJson.current) return // サーバ由来の変更 or 変化なし → 送らない
    let alive = true
    ;(async () => {
      const rev = await pushDB(db)
      if (!alive || rev == null) return
      syncedRev.current = rev
      syncedJson.current = json
    })()
    return () => {
      alive = false
    }
  }, [db, enabled, mode])

  return { mode }
}
