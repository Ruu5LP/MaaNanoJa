import { useMemo, useState } from 'react'
import { createRoom, fetchRoom, CloudRoomError } from '../lib/cloud-room-api'
import { normalizeRoomCode } from '../lib/cloud-room'
import type { DB } from '../lib/domain'
import { GOOGLE_LOGIN_PATH, LOGOUT_PATH, type AccountRoom, type AccountState } from '../lib/account'

export interface RoomEntryProps {
  db: DB
  legacyDB?: DB | null
  account?: AccountState | null
  accountRooms?: AccountRoom[]
  accountError?: string | null
  onJoined(roomCode: string): void
  onAccountChanged?(): void
  onLegacyMigrated?(): void
}

export default function RoomEntry({
  db,
  legacyDB = null,
  account = null,
  accountRooms = [],
  accountError = null,
  onJoined,
  onAccountChanged,
  onLegacyMigrated,
}: RoomEntryProps) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
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

  return (
    <div className="room-entry">
      {accountError && !account && (
        <p className="error-text room-account-error" role="alert">
          {accountError}
        </p>
      )}
      {account && (account.user || account.loginEnabled || accountError) && (
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
              ) : null}
            </div>
            <span className="spacer" />
            {account.user ? (
              <a className="btn ghost auth-action" href={LOGOUT_PATH}>
                ログアウト
              </a>
            ) : account.loginEnabled ? (
              <a className="btn primary auth-action" href={loginUrl}>
                Googleでログイン
              </a>
            ) : null}
          </div>
          {accountError && (
            <p className="error-text" role="alert">
              {accountError}
            </p>
          )}
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
      <div className="card room-card room-entry-card">
        <h2>ルームをはじめる</h2>
        <p className="muted">新しいルームを作るか、共有されたルームに参加してください。</p>
        <div className="room-actions">
          <div className="room-create-block">
            <h3 className="room-option-title">新しく始める</h3>
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
          </div>
          <span className="muted room-or">または</span>
          <div className="room-join-block">
            <h3 className="room-option-title">招待されたルームに参加</h3>
            <p className="muted">共有された8文字のルームコードを入力してください。</p>
            <div className="row room-join-row">
              <input
                value={input}
                maxLength={8}
                placeholder="ルームコード"
                aria-label="ルームコード"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleJoinCode(input)
                }}
              />
              <button className="btn" disabled={busy} onClick={() => void handleJoinCode(input)}>
                参加
              </button>
            </div>
          </div>
        </div>
        <div className="room-access-notice">
          <strong>共有ルームの注意</strong>
          <span>
            ルームURLを知っている人は、ログインなしで閲覧・編集できます。信頼できる相手にだけ共有してください。
          </span>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
