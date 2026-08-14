// モニター表示専用のエントリ（?board=1 で開く）。App.tsx とは別の最小限のルート。
// タブ操作は無く、全画面スコアボード（BoardView）だけを描画する。
// 記録タブでの入力がそのままこの画面にも反映される（読み取り専用。ここから編集はしない）。
import { useCallback, useEffect, useMemo, useState } from 'react'
import { emptyDB } from './lib/store'
import type { DB } from './lib/domain'
import { fetchAccount } from './lib/account-api'
import { GOOGLE_LOGIN_PATH, type AccountState } from './lib/account'
import { useRoomSync } from './useRoomSync'
import { normalizeRoomCode, ROOM_QUERY_KEY } from './lib/cloud-room'
import BoardView from './views/BoardView'
import RoomAccessView from './views/RoomAccessView'
import { useRoomAccess } from './useRoomAccess'

export default function BoardApp() {
  const [db, setDB] = useState<DB>(() => emptyDB())
  const [account, setAccount] = useState<AccountState | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)
  const roomCode = normalizeRoomCode(
    new URLSearchParams(window.location.search).get(ROOM_QUERY_KEY),
  )
  const {
    access,
    isReady: roomAccessReady,
    joinPendingRoom,
    retry: retryRoomAccess,
  } = useRoomAccess(roomCode, account, accountError)
  const roomReady = roomAccessReady
  const { mode: cloudMode, error, retry } = useRoomSync(roomReady ? roomCode : null, setDB)

  const refreshAccount = useCallback(async () => {
    try {
      setAccount(await fetchAccount())
      setAccountError(null)
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'アカウント情報を取得できません')
    }
  }, [])

  useEffect(() => {
    void refreshAccount()
  }, [refreshAccount])

  const loginUrl = useMemo(() => {
    const current = `${window.location.pathname}${window.location.search}`
    return `${GOOGLE_LOGIN_PATH}?returnTo=${encodeURIComponent(current)}`
  }, [])

  const goHome = useCallback(() => {
    const url = new URL(window.location.href)
    url.pathname = '/'
    url.searchParams.delete(ROOM_QUERY_KEY)
    url.searchParams.delete('board')
    window.location.assign(url.toString())
  }, [])

  if (!roomCode) {
    return (
      <div className="board-page">
        <div className="board-empty">ルームURLからモニター表示を開いてください。</div>
      </div>
    )
  }

  if (!roomReady) {
    return (
      <RoomAccessView
        roomCode={roomCode}
        status={access.status === 'ready' ? 'checking' : access.status}
        ownerDisplayName={access.ownerDisplayName}
        loginUrl={loginUrl}
        error={access.error}
        onJoin={() => void joinPendingRoom()}
        onBack={goHome}
        onRetry={() => {
          retryRoomAccess()
          void refreshAccount()
        }}
      />
    )
  }

  return <BoardView db={db} syncMode={cloudMode} syncError={error} onRetry={retry} />
}
