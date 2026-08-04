// モニター表示専用のエントリ（?board=1 で開く）。App.tsx とは別の最小限のルート。
// タブ操作は無く、全画面スコアボード（BoardView）だけを描画する。
// db の読み込み・LAN同期は App.tsx と同じ仕組みをそのまま使うので、記録タブでの入力が
// そのままこの画面にも反映される（読み取り専用。ここから編集はしない）。
import { useEffect, useState } from 'react'
import { loadDB, saveDB } from './lib/store'
import type { DB } from './lib/domain'
import { useLanSync } from './useLanSync'
import { useRoomSync } from './useRoomSync'
import { normalizeRoomCode, ROOM_QUERY_KEY } from './lib/cloud-room'
import BoardView from './views/BoardView'

export default function BoardApp() {
  const [db, setDB] = useState<DB>(() => loadDB())
  const roomCode = normalizeRoomCode(
    new URLSearchParams(window.location.search).get(ROOM_QUERY_KEY),
  )
  const { mode: lanMode } = useLanSync(db, setDB, roomCode === null)
  const { mode: cloudMode, error } = useRoomSync(roomCode, setDB)
  const mode = roomCode ? cloudMode : lanMode

  useEffect(() => {
    saveDB(db)
  }, [db])

  return <BoardView db={db} syncMode={mode} syncError={error} />
}
