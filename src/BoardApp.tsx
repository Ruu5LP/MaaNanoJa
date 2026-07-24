// モニター表示専用のエントリ（?board=1 で開く）。App.tsx とは別の最小限のルート。
// タブ操作は無く、全画面スコアボード（BoardView）だけを描画する。
// db の読み込み・LAN同期は App.tsx と同じ仕組みをそのまま使うので、記録タブでの入力が
// そのままこの画面にも反映される（読み取り専用。ここから編集はしない）。
import { useEffect, useState } from 'react'
import { loadDB, saveDB } from './lib/store'
import type { DB } from './lib/domain'
import { useLanSync } from './useLanSync'
import BoardView from './views/BoardView'

export default function BoardApp() {
  const [db, setDB] = useState<DB>(() => loadDB())
  const { mode } = useLanSync(db, setDB)

  useEffect(() => {
    saveDB(db)
  }, [db])

  return <BoardView db={db} syncMode={mode} />
}
