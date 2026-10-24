import { useMemo, useState, type ReactNode } from 'react'
import {
  computeScoreTrend,
  computeStats,
  filterGamesByPeriod,
  type StatsPeriod,
} from '../lib/stats'
import { todayStr } from '../lib/date'
import type { DB } from '../lib/domain'
import OpponentStatsPanel from './OpponentStatsPanel'
import {
  DetailedAnalysisPanel,
  RankDistPanel,
  ScoreTrendPanel,
  TotalScorePanel,
} from './StatsPanels'

const STATS_SECTIONS = [
  ['stats-total', '総合ランキング'],
  ['stats-ranks', '着順の内訳'],
  ['stats-scores', '順位・スコア'],
  ['stats-hands', '局データ'],
  ['stats-analysis', '詳細分析'],
  ['stats-opponents', '相手別のロン・放銃'],
  ['stats-trend', 'スコア推移'],
] as const

function StatsSection({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section
      id={id}
      className="stats-section"
      aria-label={STATS_SECTIONS.find(([sectionId]) => sectionId === id)?.[1]}
      tabIndex={-1}
    >
      {children}
    </section>
  )
}

function pct(x: number | null): string {
  return x == null ? '—' : `${(x * 100).toFixed(1)}%`
}
function signed(x: number | null, digits = 1): string {
  if (x == null) return '—'
  return `${x > 0 ? '+' : ''}${x.toFixed(digits)}`
}

export default function StatsView({ db }: { db: DB }) {
  const [period, setPeriod] = useState<StatsPeriod>('all')
  const [copyMessage, setCopyMessage] = useState('')
  const today = todayStr()
  const boardUrl = new URL(window.location.href)
  boardUrl.searchParams.set('board', '1')
  const viewerUrl = new URL(window.location.href)
  viewerUrl.searchParams.set('view', '1')
  viewerUrl.searchParams.delete('board')
  viewerUrl.hash = ''

  // 今日だけのときは、今日の日付の対局に絞ってから全ての成績表示へ渡す。
  const filteredDb = useMemo(
    () => ({ ...db, games: filterGamesByPeriod(db.games, period, today) }),
    [db, period, today],
  )
  const stats = useMemo(() => computeStats(filteredDb), [filteredDb])
  const scoreTrend = useMemo(() => computeScoreTrend(filteredDb), [filteredDb])

  // 期間切り替えタブ＋モニター表示への導線。空のときも常に出す（今日→全期間に戻せるように）。
  // タブの並びは「今日／全期間」で統一する（BoardView側と同じ順）。
  const tabs = (
    <div className="row wrap" style={{ marginBottom: 14 }}>
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
      {viewerUrl.searchParams.has('room') && (
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(viewerUrl.toString())
              setCopyMessage('閲覧用URLをコピーしました')
            } catch {
              setCopyMessage('コピーできませんでした。ブラウザのURLを確認してください。')
            }
          }}
        >
          成績閲覧用URLをコピー
        </button>
      )}
      {copyMessage && <span role="status">{copyMessage}</span>}
      <a
        className="btn"
        href={`${boardUrl.pathname}${boardUrl.search}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        合計スコアだけを表示 ↗
      </a>
    </div>
  )

  if (stats.length === 0) {
    return (
      <div className="view">
        {tabs}
        <div className="empty">
          {period === 'today'
            ? '今日の対局はまだありません。'
            : '対局を記録すると、ここに成績が集計されます。'}
        </div>
      </div>
    )
  }

  const hasHandData = stats.some((s) => s.handsPlayed > 0)

  // 全ての画面幅で1列にし、上部の項目一覧から各カードへ移動できるようにする。
  return (
    <div className="view view-wide">
      {tabs}
      <nav
        id="stats-contents"
        className="card stats-toc"
        aria-labelledby="stats-contents-title"
        tabIndex={-1}
      >
        <h2 id="stats-contents-title">成績の項目一覧</h2>
        <p className="stats-toc-hint">左右にスクロールして項目を選べます。</p>
        <ul>
          {STATS_SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="stats-sections">
        {/* 合計スコアランキング */}
        <StatsSection id="stats-total">
          <TotalScorePanel stats={stats} />
        </StatsSection>

        {/* 着順分布 */}
        <StatsSection id="stats-ranks">
          <RankDistPanel stats={stats} />
        </StatsSection>

        {/* 順位系の表 */}
        <StatsSection id="stats-scores">
          <div className="card">
            <h2>順位・スコア</h2>
            <p className="table-hint">スマホでは左右にスクロールできます。</p>
            <div className="table-wrap">
              <table className="stats-detail-table">
                <thead>
                  <tr>
                    <th>プレイヤー</th>
                    <th>戦</th>
                    <th>合計</th>
                    <th>平均</th>
                    <th>平均順位</th>
                    <th>トップ率</th>
                    <th>連対率</th>
                    <th>ラス率</th>
                    <th>トビ率</th>
                    <th>平均素点</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.playerId}>
                      <td>{s.name}</td>
                      <td className="num">{s.games}</td>
                      <td className={`num ${s.totalScore >= 0 ? 'pos' : 'neg'}`}>
                        {signed(s.totalScore)}
                      </td>
                      <td className={`num ${s.avgScore >= 0 ? 'pos' : 'neg'}`}>
                        {signed(s.avgScore)}
                      </td>
                      <td className="num">{s.avgRank.toFixed(2)}</td>
                      <td className="num">{pct(s.topRate)}</td>
                      <td className="num">{pct(s.rentaiRate)}</td>
                      <td className="num">{pct(s.lastRate)}</td>
                      <td className="num">{pct(s.tobiRate)}</td>
                      <td className="num">{s.avgRaw.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </StatsSection>

        {/* 局データ（局ログがある場合） */}
        <StatsSection id="stats-hands">
          <div className="card">
            <h2>局データ（放銃・和了・立直）</h2>
            {!hasHandData ? (
              <p className="muted">
                局ログ付きで記録した半荘がまだありません。「記録」→「局ログで記録」で1局ずつ残すと、
                ここに放銃率・和了率などが出ます。
              </p>
            ) : (
              <>
                <p className="table-hint">スマホでは左右にスクロールできます。</p>
                <div className="table-wrap">
                  <table className="stats-detail-table">
                    <thead>
                      <tr>
                        <th>プレイヤー</th>
                        <th>局数</th>
                        <th>和了率</th>
                        <th>放銃率</th>
                        <th>立直率</th>
                        <th>ツモ率</th>
                        <th>平均和了</th>
                        <th>平均放銃</th>
                        <th>テンパイ率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.map((s) => (
                        <tr key={s.playerId}>
                          <td>{s.name}</td>
                          <td className="num">{s.handsPlayed || '—'}</td>
                          <td className="num">{pct(s.agariRate)}</td>
                          <td className="num">{pct(s.houjuRate)}</td>
                          <td className="num">{pct(s.riichiRate)}</td>
                          <td className="num">{pct(s.tsumoRate)}</td>
                          <td className="num">{s.avgAgari?.toLocaleString() ?? '—'}</td>
                          <td className="num">{s.avgHouju?.toLocaleString() ?? '—'}</td>
                          <td className="num">{pct(s.tenpaiRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <p className="muted" style={{ marginTop: 8 }}>
              率はいずれも「参加した局数」に対する割合。テンパイ率は流局時のテンパイ割合。
            </p>
          </div>
        </StatsSection>

        {/* 局ログの詳細分析 */}
        <StatsSection id="stats-analysis">
          <DetailedAnalysisPanel stats={stats} hasHandData={hasHandData} />
        </StatsSection>

        <StatsSection id="stats-opponents">
          <OpponentStatsPanel
            db={filteredDb}
            players={stats.map((stat) => ({ id: stat.playerId, name: stat.name }))}
          />
        </StatsSection>

        {/* 半荘ごとのスコア推移 */}
        <StatsSection id="stats-trend">
          <ScoreTrendPanel stats={stats} trend={scoreTrend} />
        </StatsSection>
      </div>
    </div>
  )
}
