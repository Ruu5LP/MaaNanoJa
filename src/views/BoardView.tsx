// モニター表示専用の全画面スコアボード。
// 誰かのPC/タブレットをテレビやモニターに繋いで、卓を囲む全員から見える大きさで
// 「順位・名前・合計スコア」だけを映す。タブUIは持たず ?board=1 で単独ページとして開く
// （main.tsx / BoardApp.tsx を参照）。値そのものは成績タブと同じ computeStats を使うので、
// 記録した対局がある限りここにも自動的に反映される（クラウド同期中なら他端末の入力も即映る）。
import { useMemo, useState } from 'react'
import { computeStats, filterGamesByPeriod, type StatsPeriod } from '../lib/stats'
import { currentDraftPointsFromDB } from '../lib/draft-stats'
import { todayStr } from '../lib/date'
import { SYNC_LABEL, type SyncMode } from '../useRoomSync'
import type { DB } from '../lib/domain'

const RANK_COLORS = ['var(--rank1)', 'var(--rank2)', 'var(--rank3)', 'var(--rank4)']

function signed(x: number, digits = 1): string {
  return `${x > 0 ? '+' : ''}${x.toFixed(digits)}`
}

export default function BoardView({
  db,
  syncMode,
  syncError,
}: {
  db: DB
  syncMode: SyncMode
  syncError?: string | null
}) {
  // モニターに映すのは基本「今日、今まさに戦っている順位」なので今日をデフォルトにする。
  // 過去分も含めた総合順位を映したい場合は全期間に切り替えられる。
  const [period, setPeriod] = useState<StatsPeriod>('today')
  const today = todayStr()
  const stats = useMemo(() => {
    const games = filterGamesByPeriod(db.games, period, today)
    return computeStats({ ...db, games })
  }, [db, period, today])
  const draftPoints = useMemo(() => currentDraftPointsFromDB(db), [db])

  return (
    <div className="board-page">
      <div className="board-bar">
        <span className="board-title">麻雀トラッカー</span>
        <div className="seg-control period-tabs" style={{ marginBottom: 0 }}>
          <button
            className={period === 'today' ? 'active' : ''}
            aria-pressed={period === 'today'}
            onClick={() => setPeriod('today')}
          >
            今日
          </button>
          <button
            className={period === 'all' ? 'active' : ''}
            aria-pressed={period === 'all'}
            onClick={() => setPeriod('all')}
          >
            全期間
          </button>
        </div>
        <span className="spacer" />
        <span
          className={`sync-badge ${syncError ? 'sync-error' : `sync-${syncMode}`}`}
          role="status"
        >
          {syncError ? '⚠️ 同期エラー' : SYNC_LABEL[syncMode]}
        </span>
        <button
          className="btn sm ghost"
          onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
        >
          ⛶ 全画面
        </button>
      </div>
      {syncError && <div className="board-sync-error">{syncError}</div>}

      {draftPoints ? (
        <>
          <div className="board-live-label">
            進行中の半荘（{db.draft?.date || '日付なし'}）・現在点
          </div>
          <div className="board-grid">
            {draftPoints.map((player, i) => (
              <div
                className="board-tile"
                key={player.playerId}
                style={{ borderColor: RANK_COLORS[i] ?? RANK_COLORS[3] }}
              >
                <div className="board-rank" style={{ color: RANK_COLORS[i] ?? RANK_COLORS[3] }}>
                  {i + 1}位
                </div>
                <div className="board-name">{player.name}</div>
                <div className={`board-score ${player.points >= 0 ? 'pos' : 'neg'}`}>
                  {player.points.toLocaleString()}点
                </div>
              </div>
            ))}
          </div>
        </>
      ) : stats.length === 0 ? (
        <div className="board-empty">
          {period === 'today'
            ? '今日の対局はまだありません。'
            : '対局を記録すると、ここに表示されます。'}
        </div>
      ) : (
        <div className="board-grid">
          {stats.map((s, i) => (
            <div
              className="board-tile"
              key={s.playerId}
              style={{ borderColor: RANK_COLORS[i] ?? RANK_COLORS[3] }}
            >
              <div className="board-rank" style={{ color: RANK_COLORS[i] ?? RANK_COLORS[3] }}>
                {i + 1}位
              </div>
              <div className="board-name">{s.name}</div>
              <div className={`board-score ${s.totalScore >= 0 ? 'pos' : 'neg'}`}>
                {signed(s.totalScore)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
