import { useMemo, useState } from 'react'
import { createRoom, fetchRoom, CloudRoomError } from '../lib/cloud-room-api'
import { normalizeRoomCode } from '../lib/cloud-room'
import type { DB } from '../lib/domain'

interface RoomViewProps {
  db: DB
  roomCode: string | null
  onJoined(roomCode: string): void
  onLeave(): void
}

export default function RoomView({ db, roomCode, onJoined, onLeave }: RoomViewProps) {
  const [input, setInput] = useState(roomCode ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const roomUrl = useMemo(() => {
    if (!roomCode) return ''
    const url = new URL(window.location.href)
    url.searchParams.set('room', roomCode)
    url.searchParams.delete('board')
    return url.toString()
  }, [roomCode])

  async function handleCreate(migrateGames: boolean) {
    setBusy(true)
    setError('')
    try {
      const created = await createRoom(db, { migrateGames })
      onJoined(created.roomCode)
    } catch (e) {
      setError(e instanceof CloudRoomError ? e.message : 'ルームを作成できませんでした')
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin() {
    const code = normalizeRoomCode(input)
    if (!code) {
      setError('8文字のルームコードを入力してください')
      return
    }
    setBusy(true)
    setError('')
    try {
      await fetchRoom(code)
      onJoined(code)
    } catch (e) {
      setError(e instanceof CloudRoomError ? e.message : 'ルームに参加できませんでした')
    } finally {
      setBusy(false)
    }
  }

  if (roomCode) {
    return (
      <div className="room-strip">
        <span className="room-label">共有ルーム</span>
        <code className="room-code">{roomCode}</code>
        <button
          className="btn sm ghost"
          onClick={() => navigator.clipboard?.writeText(roomUrl).catch(() => {})}
          title="参加用URLをコピー"
        >
          URLをコピー
        </button>
        <button className="btn sm ghost" onClick={onLeave}>
          ローカルに戻る
        </button>
      </div>
    )
  }

  return (
    <div className="card room-card">
      <h2>みんなで使う</h2>
      <p className="muted">ルームを作ると、PCのモニターとスマホを同じ対局に接続できます。</p>
      <div className="room-actions">
        {db.games.length > 0 ? (
          <div className="room-create-options">
            <span className="muted">この端末の過去対局 {db.games.length}件</span>
            <button className="btn primary" disabled={busy} onClick={() => void handleCreate(true)}>
              {busy ? '作成中…' : '履歴を移行して作る'}
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => void handleCreate(false)}>
              空のルームを作る
            </button>
          </div>
        ) : (
          <button className="btn primary" disabled={busy} onClick={() => void handleCreate(false)}>
            {busy ? '作成中…' : '新しいルームを作る'}
          </button>
        )}
        <span className="muted">または</span>
        <div className="row room-join-row">
          <input
            value={input}
            maxLength={8}
            placeholder="ルームコード"
            aria-label="ルームコード"
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleJoin()
            }}
          />
          <button className="btn" disabled={busy} onClick={() => void handleJoin()}>
            参加
          </button>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}
