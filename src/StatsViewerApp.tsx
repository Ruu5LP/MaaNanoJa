// 共有された ?room=...&view=1 用。読み取り専用APIだけを呼び、編集UIは持たない。
import { useEffect, useState } from 'react'
import type { DB } from './lib/domain'
import { normalizeRoomCode, fromRoomSnapshot } from './lib/cloud-room'
import { fetchRoomStats } from './lib/cloud-room-api'
import { SCHEMA_VERSION } from './lib/store'
import StatsView from './views/StatsView'
import BoardView from './views/BoardView'

export default function StatsViewerApp({ board = false }: { board?: boolean }) {
  const roomCode = normalizeRoomCode(new URLSearchParams(window.location.search).get('room'))
  const [db, setDB] = useState<DB | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const retry = () => setRetryCount((count) => count + 1)

  useEffect(() => {
    if (!roomCode) return
    const code = roomCode
    let alive = true
    let pending = false
    async function load() {
      if (pending) return
      pending = true
      try {
        const snapshot = await fetchRoomStats(code)
        if (!alive) return
        setDB(fromRoomSnapshot(snapshot, SCHEMA_VERSION))
        setError(null)
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : '成績を取得できません')
      } finally {
        pending = false
      }
    }
    void load()
    const timer = setInterval(() => void load(), 10_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [roomCode, retryCount])

  if (board && db) {
    return <BoardView db={db} syncMode="cloud" syncError={error} onRetry={retry} />
  }

  return (
    <>
      <header className="app-header">
        <a className="app-brand" href="/">
          麻雀トラッカー
        </a>
        <span className="sync-badge">成績の閲覧専用</span>
      </header>
      <div className="view view-wide">
        {!roomCode ? (
          <p role="alert">閲覧用のルームURLを確認してください。</p>
        ) : error ? (
          <div role="alert" className="row wrap">
            <p>{error}</p>
            <button className="btn" onClick={retry}>
              再接続
            </button>
          </div>
        ) : !db ? (
          <p role="status">成績を読み込んでいます…</p>
        ) : null}
      </div>
      {db && <StatsView db={db} />}
    </>
  )
}
