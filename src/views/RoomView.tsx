import { useMemo, useState } from 'react'

interface RoomViewProps {
  roomCode: string
  onLeave(): void
}

export default function RoomView({ roomCode, onLeave }: RoomViewProps) {
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'error'>('idle')
  const roomUrl = useMemo(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('room', roomCode)
    url.searchParams.delete('board')
    return url.toString()
  }, [roomCode])
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
      </div>
      {copyState === 'error' && (
        <p className="error-text room-copy-error" role="alert">
          URLをコピーできませんでした。URLを長押ししてコピーしてください。
        </p>
      )}
    </>
  )
}
