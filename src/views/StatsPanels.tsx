// 成績の可視化パネル（合計スコア／着順分布）。成績タブで使う。
// 表示専用（副作用なし）。データは computeStats 済みの PlayerStats 配列を受け取る。
import type { PlayerStats } from '../lib/stats'

const RANK_COLORS = ['var(--rank1)', 'var(--rank2)', 'var(--rank3)', 'var(--rank4)']
const RANK_LABELS = ['1位', '2位', '3位', '4位']

function signed(x: number | null, digits = 1): string {
  if (x == null) return '—'
  return `${x > 0 ? '+' : ''}${x.toFixed(digits)}`
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
