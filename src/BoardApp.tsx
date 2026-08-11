// モニター表示専用のエントリ（?board=1 で開く）。App.tsx とは別の最小限のルート。
// タブ操作は無く、全画面スコアボード（BoardView）だけを描画する。
// 記録タブでの入力がそのままこの画面にも反映される（読み取り専用。ここから編集はしない）。
import { useState } from 'react'
import { emptyDB } from './lib/store'
import type { DB } from './lib/domain'
import { useRoomSync } from './useRoomSync'
import { normalizeRoomCode, ROOM_QUERY_KEY } from './lib/cloud-room'
import BoardView from './views/BoardView'

export default function BoardApp() {
  const [db, setDB] = useState<DB>(() => emptyDB())
  const roomCode = normalizeRoomCode(
    new URLSearchParams(window.location.search).get(ROOM_QUERY_KEY),
  )
  const { mode: cloudMode, error, retry } = useRoomSync(roomCode, setDB)

  if (!roomCode) {
    return (
      <div className="board-page">
        <div className="board-empty">ルームURLからモニター表示を開いてください。</div>
      </div>
    )
  }

  return <BoardView db={db} syncMode={cloudMode} syncError={error} onRetry={retry} />
}
