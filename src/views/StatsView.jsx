import { useMemo } from 'react'
import { computeStats } from '../lib/stats.js'

const RANK_COLORS = ['var(--rank1)', 'var(--rank2)', 'var(--rank3)', 'var(--rank4)']
const RANK_LABELS = ['1位', '2位', '3位', '4位']

function pct(x) {
  return x == null ? '—' : `${(x * 100).toFixed(1)}%`
}
function signed(x, digits = 1) {
  if (x == null) return '—'
  return `${x > 0 ? '+' : ''}${x.toFixed(digits)}`
}

export default function StatsView({ db }) {
  const stats = useMemo(() => computeStats(db), [db])

  if (stats.length === 0) {
    return (
      <div className="view">
        <div className="empty">対局を記録すると、ここに成績が集計されます。</div>
      </div>
    )
  }

  const maxAbs = Math.max(1, ...stats.map((s) => Math.abs(s.totalScore)))
  const hasHandData = stats.some((s) => s.handsPlayed > 0)

  return (
    <div className="view">
      {/* 合計スコアランキング */}
      <div className="card">
        <h2>合計スコア</h2>
        <div className="hbars">
          {stats.map((s) => (
            <div className="hbar" key={s.playerId}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
              <div className="track">
                <div className="zero" style={{ left: '50%' }} />
                <div
                  className="fill"
                  style={{
                    background: s.totalScore >= 0 ? 'var(--accent)' : 'var(--danger)',
                    left: s.totalScore >= 0 ? '50%' : `${50 - (Math.abs(s.totalScore) / maxAbs) * 50}%`,
                    width: `${(Math.abs(s.totalScore) / maxAbs) * 50}%`,
                  }}
                />
              </div>
              <span className={`num ${s.totalScore >= 0 ? 'pos' : 'neg'}`} style={{ textAlign: 'right' }}>
                {signed(s.totalScore)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 着順分布 */}
      <div className="card">
        <h2>着順分布</h2>
        <div className="stack">
          {stats.map((s) => (
            <div key={s.playerId}>
              <div className="row" style={{ marginBottom: 4 }}>
                <b style={{ fontSize: 13 }}>{s.name}</b>
                <span className="spacer" />
                <span className="muted">
                  平均{s.avgRank.toFixed(2)}位 ・ {s.games}戦
                </span>
              </div>
              <div className="rankbar">
                {s.rankCounts.map((c, i) =>
                  c > 0 ? (
                    <div
                      key={i}
                      className="seg"
                      style={{ background: RANK_COLORS[i], flexGrow: c }}
                      title={`${RANK_LABELS[i]} ${c}回`}
                    >
                      {c}
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="legend">
          {RANK_LABELS.map((l, i) => (
            <span key={i}>
              <i style={{ background: RANK_COLORS[i] }} />
              {l}
            </span>
          ))}
        </div>
      </div>

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
                  <td className={`num ${s.totalScore >= 0 ? 'pos' : 'neg'}`}>{signed(s.totalScore)}</td>
                  <td className={`num ${s.avgScore >= 0 ? 'pos' : 'neg'}`}>{signed(s.avgScore)}</td>
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
  )
}
