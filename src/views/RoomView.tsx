import { useMemo, useState } from 'react'
import { GOOGLE_LOGIN_PATH, LOGOUT_PATH, type AccountState } from '../lib/account'

interface RoomViewProps {
  account?: AccountState | null
  roomCode: string
  onLeave(): void
}

export default function RoomView({ account = null, roomCode, onLeave }: RoomViewProps) {
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'error'>('idle')
  const roomUrl = useMemo(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('room', roomCode)
    url.searchParams.delete('board')
    return url.toString()
  }, [roomCode])
  const loginUrl = useMemo(() => {
    const current = `${window.location.pathname}${window.location.search}`
    return `${GOOGLE_LOGIN_PATH}?returnTo=${encodeURIComponent(current)}`
  }, [])

  async function copyRoomUrl() {
    if (!navigator.clipboard) {
      setCopyState('error')
      return
    }
    try {
      await navigator.clipboard.writeText(roomUrl)
      setCopyState('done')
      window.setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      setCopyState('error')
    }
  }

  return (
    <>
      <div className="room-strip">
        <span className="room-label">共有ルーム</span>
        <code className="room-code">{roomCode}</code>
        <button
          className="btn sm ghost"
          onClick={() => void copyRoomUrl()}
          title="参加用URLをコピー"
        >
          {copyState === 'done' ? 'コピーしました' : 'URLをコピー'}
        </button>
        <button className="btn sm ghost" onClick={onLeave}>
          ルーム選択に戻る
        </button>
        {account?.user ? (
          <a className="btn sm ghost auth-action" href={LOGOUT_PATH}>
            ログアウト
          </a>
        ) : account?.loginEnabled ? (
          <a className="btn sm primary auth-action" href={loginUrl}>
            Googleでログイン
          </a>
        ) : null}
      </div>
      {copyState === 'error' && (
        <p className="error-text room-copy-error" role="alert">
          URLをコピーできませんでした。URLを長押ししてコピーしてください。
        </p>
      )}
    </>
  )
}
