// 成績の可視化パネル（合計スコア／着順分布／局データ）。成績タブで使う。
// 表示専用（副作用なし）。データは computeStats 済みの PlayerStats 配列を受け取る。
import type { PlayerStats, ScoreTrendPoint } from '../lib/stats'

const RANK_COLORS = ['var(--rank1)', 'var(--rank2)', 'var(--rank3)', 'var(--rank4)']
const RANK_LABELS = ['1位', '2位', '3位', '4位']
const SERIES_COLORS = ['var(--accent)', 'var(--rank1)', 'var(--warn)', 'var(--danger)']

function signed(x: number | null, digits = 1): string {
  if (x == null) return '—'
  return `${x > 0 ? '+' : ''}${x.toFixed(digits)}`
}

function pct(x: number | null): string {
  return x == null ? '—' : `${(x * 100).toFixed(1)}%`
}

function fixed(x: number | null, digits = 1): string {
  return x == null ? '—' : x.toFixed(digits)
}

/** 合計スコアの横棒ランキング。0を中心に、プラスは緑・マイナスは赤で伸ばす。 */
export function TotalScorePanel({ stats }: { stats: PlayerStats[] }) {
  const maxAbs = Math.max(1, ...stats.map((s) => Math.abs(s.totalScore)))
  return (
    <div className="card">
      <h2>総合ランキング（合計スコア）</h2>
      <p className="chart-hint">中央が0。棒の長さは表示中の期間の最大スコアを基準にしています。</p>
      <div className="hbars">
        {stats.map((s, i) => (
          <div className="hbar" key={s.playerId}>
            <span className="hbar-rank">{i + 1}位</span>
            <span className="hbar-name" title={s.name}>
              {s.name}
            </span>
            <div
              className="track"
              role="img"
              aria-label={`${i + 1}位 ${s.name}、合計スコア ${signed(s.totalScore)}、平均順位 ${s.avgRank.toFixed(2)}位`}
            >
              <div className="zero" style={{ left: '50%' }} />
              <div
                className="fill"
                style={{
                  background: s.totalScore >= 0 ? 'var(--accent)' : 'var(--danger)',
                  left:
                    s.totalScore >= 0 ? '50%' : `${50 - (Math.abs(s.totalScore) / maxAbs) * 50}%`,
                  width: `${(Math.abs(s.totalScore) / maxAbs) * 50}%`,
                }}
              />
            </div>
            <span className={`hbar-score num ${s.totalScore >= 0 ? 'pos' : 'neg'}`}>
              <strong>{signed(s.totalScore)}</strong>
              <small>平均{s.avgRank.toFixed(2)}位</small>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * 着順分布。プレイヤーごとに、
 *  - 上段: 割合の帯（1位→4位を色で。幅は各プレイヤーの対局数に対する比率）
 *  - 下段: 「1位 n (xx%)」の4セル（帯が細くて数字が読めなくても、ここで必ず読める）
 * を出す。色だけに頼らず数値を必ず併記する（色覚多様性への配慮）。
 */
export function RankDistPanel({ stats }: { stats: PlayerStats[] }) {
  return (
    <div className="card">
      <h2>着順の内訳</h2>
      <p className="chart-hint">バーは割合、下の数値で回数と割合を確認できます。</p>
      <div className="stack">
        {stats.map((s) => {
          const total = Math.max(1, s.games)
          return (
            <div className="rankdist" key={s.playerId}>
              <div className="row" style={{ marginBottom: 6 }}>
                <b style={{ fontSize: 13 }}>{s.name}</b>
                <span className="spacer" />
                <span className="muted">
                  平均{s.avgRank.toFixed(2)}位 ・ {s.games}戦
                </span>
              </div>
              <div
                className="rankbar"
                role="img"
                aria-label={`${s.name}の着順内訳: ${s.rankCounts.map((count, i) => `${RANK_LABELS[i]} ${count}回`).join('、')}`}
              >
                {s.rankCounts.map((c, i) =>
                  c > 0 ? (
                    <div
                      key={i}
                      className="seg"
                      style={{ background: RANK_COLORS[i], flexGrow: c }}
                      title={`${RANK_LABELS[i]} ${c}回`}
                    />
                  ) : null,
                )}
              </div>
              <div className="rank-cells">
                {s.rankCounts.map((c, i) => (
                  <div className={`rank-cell ${c === 0 ? 'zero' : ''}`} key={i}>
                    <i style={{ background: RANK_COLORS[i] }} />
                    <span className="rk">{RANK_LABELS[i]}</span>
                    <b className="cnt">{c}</b>
                    <span className="muted pctx">{Math.round((c / total) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 局ログから取れる攻撃・守備・親の指標を、プレイヤー間で比較する表。 */
export function DetailedAnalysisPanel({
  stats,
  hasHandData,
}: {
  stats: PlayerStats[]
  hasHandData: boolean
}) {
  return (
    <div className="card">
      <h2>詳細分析</h2>
      {!hasHandData ? (
        <p className="muted">
          局ログ付きの対局があると、ロン／ツモ・平均翻符・立直和了・親での成績を比較できます。
        </p>
      ) : (
        <>
          <p className="table-hint">
            率の分母は各列の説明に合わせています。スマホでは左右にスクロールできます。
          </p>
          <div className="table-wrap">
            <table className="stats-detail-table stats-analysis-table">
              <thead>
                <tr>
                  <th>プレイヤー</th>
                  <th title="和了した回数">和了</th>
                  <th title="ロンで和了した回数">ロン</th>
                  <th title="ツモで和了した回数">ツモ</th>
                  <th title="和了1回あたりの平均翻">平均翻</th>
                  <th title="和了1回あたりの平均符">平均符</th>
                  <th title="本場・供託を除く和了点の平均">平均打点</th>
                  <th title="放銃した回数">放銃</th>
                  <th title="放銃1回あたりの平均失点">平均失点</th>
                  <th title="参加局数に対する立直宣言数">立直</th>
                  <th title="立直宣言回数に対する、同じ局での和了回数">立直和了率</th>
                  <th title="親として参加した局数">親局</th>
                  <th title="親として参加した局数に対する和了回数">親和了率</th>
                  <th title="親で和了したときの、和了点の平均">親平均打点</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.playerId}>
                    <td>{s.name}</td>
                    <td className="num">{s.agari || '—'}</td>
                    <td className="num">{s.ron || '—'}</td>
                    <td className="num">{s.tsumo || '—'}</td>
                    <td className="num">{fixed(s.avgHan)}</td>
                    <td className="num">{fixed(s.avgFu)}</td>
                    <td className="num">{s.avgAgari?.toLocaleString() ?? '—'}</td>
                    <td className="num">{s.houju || '—'}</td>
                    <td className="num">{s.avgHouju?.toLocaleString() ?? '—'}</td>
                    <td className="num">{s.riichi || '—'}</td>
                    <td className="num">{pct(s.riichiAgariRate)}</td>
                    <td className="num">{s.dealerHands || '—'}</td>
                    <td className="num">{pct(s.dealerAgariRate)}</td>
                    <td className="num">{s.avgDealerAgari?.toLocaleString() ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            平均打点は和了点のみ（本場・供託を除く）。立直和了率は立直宣言した局のうち、その局で和了した割合です。
          </p>
        </>
      )}
    </div>
  )
}

/** 半荘ごとのスコアと累計スコアをSVGで描き、同じ値を表でも確認できるようにする。 */
export function ScoreTrendPanel({
  stats,
  trend,
}: {
  stats: PlayerStats[]
  trend: ScoreTrendPoint[]
}) {
  const values = trend.flatMap((point) =>
    stats.map((stat) => point.cumulativeScores[stat.playerId] ?? 0),
  )
  const minValue = Math.min(0, ...values)
  const maxValue = Math.max(0, ...values)
  const span = Math.max(10, maxValue - minValue)
  const padding = Math.max(4, span * 0.12)
  const upper = maxValue + padding
  const lower = minValue - padding
  const x = (index: number) =>
    trend.length === 1 ? 54 : 8 + (index / Math.max(1, trend.length - 1)) * 88
  const y = (value: number) => 8 + ((upper - value) / (upper - lower)) * 84

  return (
    <div className="card">
      <h2>スコア推移</h2>
      <p className="chart-hint">
        半荘ごとのスコアを加算した累計。0を基準に、表示中の期間だけを描画しています。
      </p>
      <div className="trend-chart-layout">
        <div className="trend-scale" aria-hidden="true">
          <span>{signed(upper, 0)}</span>
          <span>0</span>
          <span>{signed(lower, 0)}</span>
        </div>
        <div className="trend-chart-frame">
          <svg
            className="score-trend-chart"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label={`半荘ごとの累計スコア推移。${stats.map((stat) => stat.name).join('、')}`}
          >
            <line className="trend-grid-line" x1="8" x2="96" y1={y(0)} y2={y(0)} />
            {stats.map((stat, playerIndex) => {
              const points = trend
                .map(
                  (point, index) => `${x(index)},${y(point.cumulativeScores[stat.playerId] ?? 0)}`,
                )
                .join(' ')
              return (
                <polyline
                  key={stat.playerId}
                  className="trend-line"
                  points={points}
                  style={{ stroke: SERIES_COLORS[playerIndex % SERIES_COLORS.length] }}
                />
              )
            })}
          </svg>
          {stats.flatMap((stat, playerIndex) =>
            trend.map((point, index) => {
              const value = point.cumulativeScores[stat.playerId] ?? 0
              return (
                <span
                  key={`${stat.playerId}-${point.gameId}`}
                  className="trend-point"
                  aria-hidden="true"
                  title={`第${point.gameNumber}半荘 ${point.date || '日付なし'}、${stat.name} 累計${signed(value)}`}
                  style={{
                    left: `${x(index)}%`,
                    top: `${y(value)}%`,
                    background: SERIES_COLORS[playerIndex % SERIES_COLORS.length],
                  }}
                />
              )
            }),
          )}
        </div>
      </div>
      <div className="legend trend-legend">
        {stats.map((stat, index) => (
          <span key={stat.playerId}>
            <i style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />
            {stat.name}
          </span>
        ))}
      </div>
      <p className="table-hint">グラフの値は下表でも確認できます。</p>
      <div className="table-wrap trend-table-wrap">
        <table className="stats-detail-table trend-table">
          <thead>
            <tr>
              <th>半荘</th>
              <th>日付</th>
              {stats.map((stat) => (
                <th key={stat.playerId}>{stat.name} 累計</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trend.map((point) => (
              <tr key={point.gameId}>
                <td className="num">#{point.gameNumber}</td>
                <td>{point.date || '—'}</td>
                {stats.map((stat) => (
                  <td className="num" key={stat.playerId}>
                    {signed(point.cumulativeScores[stat.playerId] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
