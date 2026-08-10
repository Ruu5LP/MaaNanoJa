import { useMemo, useState } from 'react'
import { createRoom, fetchRoom, CloudRoomError } from '../lib/cloud-room-api'
import { normalizeRoomCode } from '../lib/cloud-room'
import type { DB } from '../lib/domain'
import { GOOGLE_LOGIN_PATH, LOGOUT_PATH, type AccountRoom, type AccountState } from '../lib/account'

interface RoomViewProps {
  db: DB
  legacyDB?: DB | null
  account?: AccountState | null
  accountRooms?: AccountRoom[]
  accountError?: string | null
  roomCode: string | null
  onJoined(roomCode: string): void
  onLeave(): void
  onAccountChanged?(): void
  onLegacyMigrated?(): void
}

export default function RoomView({
  db,
  legacyDB = null,
  account = null,
  accountRooms = [],
  accountError = null,
  roomCode,
  onJoined,
  onLeave,
  onAccountChanged,
  onLegacyMigrated,
}: RoomViewProps) {
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
  const loginUrl = useMemo(() => {
    const current = `${window.location.pathname}${window.location.search}`
    return `${GOOGLE_LOGIN_PATH}?returnTo=${encodeURIComponent(current)}`
  }, [])

  const creationDB = legacyDB ?? db

  async function handleCreate(migrateGames: boolean) {
    setBusy(true)
    setError('')
    try {
      const created = await createRoom(creationDB, { migrateGames })
      if (migrateGames && legacyDB && created.migratedGames > 0) onLegacyMigrated?.()
      onJoined(created.roomCode)
      onAccountChanged?.()
    } catch (e) {
      setError(e instanceof CloudRoomError ? e.message : 'ルームを作成できませんでした')
    } finally {
      setBusy(false)
    }
  }

  async function handleJoinCode(value: string) {
    const code = normalizeRoomCode(value)
    if (!code) {
      setError('8文字のルームコードを入力してください')
      return
    }
    setBusy(true)
    setError('')
    try {
      await fetchRoom(code)
      onJoined(code)
      onAccountChanged?.()
    } catch (e) {
      setError(e instanceof CloudRoomError ? e.message : 'ルームに参加できませんでした')
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin() {
    await handleJoinCode(input)
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
          ルーム選択に戻る
        </button>
        {account?.user ? (
          <a className="btn sm ghost" href={LOGOUT_PATH}>
            ログアウト
          </a>
        ) : account?.loginEnabled ? (
          <a className="btn sm primary" href={loginUrl}>
            Googleでログイン
          </a>
        ) : null}
      </div>
    )
  }

  return (
    <>
      {account && (
        <div className="card account-card room-card">
          <div className="row wrap">
            <div>
              <h2>アカウント</h2>
              {account.user ? (
                <p className="muted">{account.user.email} でログイン中</p>
              ) : account.loginEnabled ? (
                <p className="muted">
                  Googleアカウントでログインすると、作成したルームを保存できます。
                </p>
              ) : (
                <p className="muted">Googleログインの設定がまだ完了していません。</p>
              )}
            </div>
            <span className="spacer" />
            {account.user ? (
              <a className="btn ghost" href={LOGOUT_PATH}>
                ログアウト
              </a>
            ) : account.loginEnabled ? (
              <a className="btn primary" href={loginUrl}>
                Googleでログイン
              </a>
            ) : null}
          </div>
          {accountError && <p className="error-text">{accountError}</p>}
          {account.user && accountRooms.length > 0 && (
            <div className="account-rooms">
              <h3>自分のルーム</h3>
              {accountRooms.map((room) => (
                <button
                  className="account-room"
                  key={room.roomCode}
                  disabled={busy}
                  onClick={() => void handleJoinCode(room.roomCode)}
                >
                  <code>{room.roomCode}</code>
                  <span>{room.role === 'owner' ? '所有者' : '参加中'}</span>
                  <span className="muted">対局 {room.gameCount}件</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="card room-card">
        <h2>みんなで使う</h2>
        <p className="muted">ルームを作ると、PCのモニターとスマホを同じ対局に接続できます。</p>
        <div className="room-actions">
          {legacyDB && legacyDB.games.length > 0 ? (
            <div className="room-create-options">
              <span className="muted">旧データの過去対局 {legacyDB.games.length}件</span>
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => void handleCreate(true)}
              >
                {busy ? '作成中…' : '履歴を移行して作る'}
              </button>
              <button
                className="btn ghost"
                disabled={busy}
                onClick={() => void handleCreate(false)}
              >
                空のルームを作る
              </button>
            </div>
          ) : (
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => void handleCreate(false)}
            >
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
    </>
  )
}
