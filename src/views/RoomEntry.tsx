import { useMemo, useState } from 'react'
import { createRoom, fetchRoom, CloudRoomError } from '../lib/cloud-room-api'
import { normalizeRoomCode } from '../lib/cloud-room'
import type { DB } from '../lib/domain'
import { GOOGLE_LOGIN_PATH, LOGOUT_PATH, type AccountRoom, type AccountState } from '../lib/account'

export interface RoomEntryProps {
  db: DB
  legacyDB?: DB | null
  guestDB?: DB | null
  account?: AccountState | null
  accountRooms?: AccountRoom[]
  accountError?: string | null
  guestMigrationBusy?: boolean
  onJoined(roomCode: string): void
  onStartGuest?(): void
  onMigrateGuest?(): void
  onAccountChanged?(): void
  onLegacyMigrated?(): void
}

type SharedRoomAccess = 'checking' | 'login-required' | 'available' | 'error'

function getSharedRoomAccess(
  account: AccountState | null,
  accountError: string | null,
): SharedRoomAccess {
  if (!account) return accountError ? 'error' : 'checking'
  if (account.loginEnabled && !account.user) return 'login-required'
  return 'available'
}

function sharedRoomAccessMessage(access: SharedRoomAccess): string {
  switch (access) {
    case 'checking':
      return 'アカウント情報を確認中です。少し待ってからもう一度お試しください'
    case 'login-required':
      return '共有ルームを使うには、先にGoogleでログインしてください'
    case 'error':
      return 'アカウント情報を取得できないため、共有ルームを利用できません。再確認してください'
    case 'available':
      return ''
  }
}

export default function RoomEntry({
  db,
  legacyDB = null,
  guestDB = null,
  account = null,
  accountRooms = [],
  accountError = null,
  guestMigrationBusy = false,
  onJoined,
  onStartGuest,
  onMigrateGuest,
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
  const sharedRoomAccess = getSharedRoomAccess(account, accountError)
  const sharedRoomDisabled = sharedRoomAccess !== 'available'
  const showAccountCard =
    account === null ||
    Boolean(accountError) ||
    Boolean(account?.loginEnabled) ||
    Boolean(account?.user)
  const guestHasData = Boolean(guestDB && (guestDB.draft || guestDB.games.length > 0))
  const shouldMigrateGuest = Boolean(account?.user && guestHasData)
  const showGuestCard = !account?.user || shouldMigrateGuest
  const guestDataSummary = guestDB?.draft
    ? `進行中の半荘と過去対局${guestDB.games.length}件を保存できます。`
    : `過去対局${guestDB?.games.length ?? 0}件を保存できます。`

  function requireSharedRoomAccess(): boolean {
    if (sharedRoomAccess === 'available') return true
    setError(sharedRoomAccessMessage(sharedRoomAccess))
    return false
  }

  async function handleCreate(migrateGames: boolean) {
    if (!requireSharedRoomAccess()) return
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
    if (!requireSharedRoomAccess()) return
    const code = normalizeRoomCode(value)
    if (!code) {
      setError('8文字の招待コードを入力してください')
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
      {showGuestCard && !account?.user && (
        <p className="entry-choice-note">
          一人で試すならゲスト、対局を残して共有するなら共有ルームを選んでください。
        </p>
      )}
      <div
        className={`entry-options${showAccountCard && showGuestCard ? ' has-account-card' : ''}`}
      >
        {showGuestCard && (
          <div className="card entry-card guest-entry-card room-card">
            {shouldMigrateGuest ? (
              <>
                <div>
                  <span className="entry-kicker">アカウントへ移行</span>
                  <h2>ゲストデータを保存する</h2>
                  <p className="muted">{guestDataSummary}</p>
                  <p className="muted guest-migration-note">
                    ログイン中のアカウントで新しい共有ルームを作成し、ゲストデータを移行します。
                  </p>
                </div>
                <button
                  className="btn primary"
                  disabled={busy || guestMigrationBusy}
                  onClick={() => onMigrateGuest?.()}
                >
                  {guestMigrationBusy ? '移行中…' : 'アカウントへ移行する'}
                </button>
              </>
            ) : (
              <>
                <div>
                  <span className="entry-kicker">個人で始める</span>
                  <h2>{guestHasData ? 'このタブの続き' : 'ゲストとして始める'}</h2>
                  <p className="muted">
                    {guestHasData
                      ? guestDataSummary
                      : 'Googleログインなしで、このタブに記録を始めます。'}
                  </p>
                  <ul className="entry-details">
                    <li>ページを更新しても続きから使えます</li>
                    <li>タブを閉じるとデータは消えます</li>
                  </ul>
                </div>
                <button className="btn primary" disabled={busy} onClick={() => onStartGuest?.()}>
                  {guestHasData ? '続きから始める' : 'ゲストで記録を始める'}
                </button>
              </>
            )}
            <p className="muted guest-entry-note">
              {shouldMigrateGuest
                ? '移行後はこのゲストデータをアカウントの共有ルームで管理できます。'
                : '後からGoogleログインすると、データを共有ルームへ移行できます。'}
            </p>
          </div>
        )}

        {showAccountCard && (
          <div className="card entry-card account-card room-card">
            <div>
              <span className="entry-kicker">Googleアカウント</span>
              <h2>{account?.user ? 'アカウント' : 'Googleでログイン'}</h2>
              {account?.user ? (
                <p className="muted">{account.user.email} でログイン中です。</p>
              ) : account?.loginEnabled ? (
                <p className="muted">
                  ログインすると、新しい共有ルームを作成して対局データを保存できます。
                </p>
              ) : accountError ? (
                <p className="muted">ログイン状態を確認できません。</p>
              ) : (
                <p className="muted">ログイン状態を確認しています…</p>
              )}
              <ul className="entry-details">
                <li>自分のルームをあとから開けます</li>
                <li>参加者と同じ対局データを共有できます</li>
              </ul>
            </div>
            <div className="entry-action-row">
              {account?.user ? (
                <a className="btn ghost auth-action" href={LOGOUT_PATH}>
                  ログアウト
                </a>
              ) : account?.loginEnabled ? (
                <a className="btn primary auth-action" href={loginUrl}>
                  Googleでログイン
                </a>
              ) : accountError && !account ? (
                <button className="btn ghost" onClick={() => onAccountChanged?.()}>
                  もう一度確認
                </button>
              ) : null}
            </div>
            {accountError && (
              <p className="error-text" role="alert">
                {accountError}
              </p>
            )}
            {account?.user && accountRooms.length > 0 && (
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
      </div>

      <div className="card room-card room-entry-card shared-room-card">
        <span className="entry-kicker">複数人で共有する</span>
        <h2>共有ルームを作る・参加する</h2>
        <p className="muted">
          対局データをルームに保存すると、同じルームを開いた参加者みんなで記録と成績を共有できます。
        </p>
        <div className="room-actions">
          <div className="room-create-block">
            <h3 className="room-option-title">新しい共有ルームを作る</h3>
            <p className="muted room-option-description">
              {account?.loginEnabled === false
                ? 'この環境ではログインなしでルームを作成できます。'
                : '自分の保存データとして新しいルームを作成します。作成にはGoogleログインが必要です。'}
            </p>
            {legacyDB && legacyDB.games.length > 0 ? (
              <div className="room-create-options">
                <span className="muted">旧データの過去対局 {legacyDB.games.length}件</span>
                <button
                  className="btn primary"
                  disabled={busy || sharedRoomDisabled}
                  onClick={() => void handleCreate(true)}
                >
                  {busy ? '作成中…' : '履歴を移行して作る'}
                </button>
                <button
                  className="btn ghost"
                  disabled={busy || sharedRoomDisabled}
                  onClick={() => void handleCreate(false)}
                >
                  空のルームを作る
                </button>
              </div>
            ) : (
              <button
                className="btn primary"
                disabled={busy || sharedRoomDisabled}
                onClick={() => void handleCreate(false)}
              >
                {busy ? '作成中…' : '共有ルームを作る'}
              </button>
            )}
          </div>
          <span className="muted room-or">または</span>
          <div className="room-join-block">
            <h3 className="room-option-title">招待コードで参加</h3>
            <p className="muted room-option-description">
              共有された8文字のコードを入力して、既存のルームを開きます。
            </p>
            <div className="row room-join-row">
              <input
                value={input}
                maxLength={8}
                placeholder="招待コード"
                aria-label="招待コード"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                disabled={busy || sharedRoomDisabled}
                onChange={(e) => setInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleJoinCode(input)
                }}
              />
              <button
                className="btn"
                disabled={busy || sharedRoomDisabled}
                onClick={() => void handleJoinCode(input)}
              >
                参加
              </button>
            </div>
          </div>
        </div>
        <div className="room-access-notice">
          <strong>
            {sharedRoomAccess === 'available' ? '共有ルームについて' : 'Googleログインが必要です'}
          </strong>
          <span>
            {sharedRoomAccess === 'checking'
              ? 'ログイン状態を確認中です。確認が終わるまで共有ルームの操作はできません。'
              : sharedRoomAccess === 'error'
                ? 'アカウント情報を確認できないため、共有ルームの操作を一時停止しています。上の「もう一度確認」をお試しください。'
                : sharedRoomAccess === 'login-required'
                  ? '新しいルームの作成・招待コードでの参加にはGoogleログインが必要です。'
                  : account?.user
                    ? 'ログイン中のアカウントで作成したルームは、自分のルームとしてあとから開けます。'
                    : 'ルームURLを知っている人は閲覧・編集できます。URLは参加者だけに共有してください。'}
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
