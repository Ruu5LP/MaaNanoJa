import { useMemo, useState } from 'react'
import { computeStats } from '../lib/stats'
import type { DB } from '../lib/domain'
import { TotalScorePanel, RankDistPanel } from './StatsPanels'

function pct(x: number | null): string {
  return x == null ? '—' : `${(x * 100).toFixed(1)}%`
}
function signed(x: number | null, digits = 1): string {
  if (x == null) return '—'
  return `${x > 0 ? '+' : ''}${x.toFixed(digits)}`
}
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/** 集計期間: 全期間 / 今日だけ。今日は各対局の日付（date, YYYY-MM-DD）で絞る。 */
type Period = 'all' | 'today'

export default function StatsView({ db }: { db: DB }) {
  const [period, setPeriod] = useState<Period>('all')
  const today = todayStr()

  // 今日だけのときは、今日の日付の対局に絞ってから集計する（集計ロジックはそのまま流用）。
  const stats = useMemo(() => {
    const games = period === 'today' ? db.games.filter((g) => g.date === today) : db.games
    return computeStats({ ...db, games })
  }, [db, period, today])

  // 期間切り替えタブ。空のときも常に出す（今日→全期間に戻せるように）。
  const tabs = (
    <div className="seg-control period-tabs">
      <button className={period === 'all' ? 'active' : ''} onClick={() => setPeriod('all')}>
        全期間
      </button>
      <button className={period === 'today' ? 'active' : ''} onClick={() => setPeriod('today')}>
        今日
      </button>
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

  // PC幅（≥1024px）では view-wide + stats-grid で4カードを2×2に並べる（CSS側）。
  // スマホでは従来どおり1カラムで縦に積む。
  return (
    <div className="view view-wide">
      {tabs}
      <div className="stats-grid">
        {/* 合計スコアランキング */}
        <TotalScorePanel stats={stats} />

        {/* 着順分布 */}
        <RankDistPanel stats={stats} />

        {/* 順位系の表 */}
        <div className="card">
          <h2>順位・スコア</h2>
          <div className="table-wrap">
            <table>
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

        {/* 局データ（局ログがある場合） */}
        <div className="card">
          <h2>局データ（放銃・和了・立直）</h2>
          {!hasHandData ? (
            <p className="muted">
              局ログ付きで記録した半荘がまだありません。「記録」→「局ログで記録」で1局ずつ残すと、
              ここに放銃率・和了率などが出ます。
            </p>
          ) : (
            <div className="table-wrap">
              <table>
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
          )}
          <p className="muted" style={{ marginTop: 8 }}>
            率はいずれも「参加した局数」に対する割合。テンパイ率は流局時のテンパイ割合。
          </p>
        </div>
      </div>
    </div>
  )
}
