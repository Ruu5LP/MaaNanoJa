import { useState } from 'react'
import { gameResults, replay } from '../lib/game'
import type { DB, Game, Hand, Rules } from '../lib/domain'
import type { Api } from '../App'

const RANK_COLORS = ['var(--rank1)', 'var(--rank2)', 'var(--rank3)', 'var(--rank4)']

type NameFn = (pid: string) => string

export default function HistoryView({ db, api }: { db: DB; api: Api }) {
  const name: NameFn = (pid) => db.players.find((p) => p.id === pid)?.name ?? '(削除)'
  const games = [...db.games].reverse()

  if (games.length === 0) {
    return (
      <div className="view">
        <div className="empty">まだ対局がありません。「記録」から半荘を追加してください。</div>
      </div>
    )
  }

  return (
    <div className="view">
      {games.map((g) => (
        <GameCard key={g.id} game={g} rules={db.rules} name={name} api={api} />
      ))}
    </div>
  )
}

function GameCard({
  game,
  rules,
  name,
  api,
}: {
  game: Game
  rules: Rules
  name: NameFn
  api: Api
}) {
  const [open, setOpen] = useState(false)
  const results = gameResults(game, rules)
  const hasHands = game.hands.length > 0

  return (
    <div className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>{game.date || '日付なし'}</h2>
        <span className="spacer" />
        {game.note && <span className="muted">{game.note}</span>}
      </div>

      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table>
          <tbody>
            {results.map((r) => (
              <tr key={r.playerId}>
                <td style={{ color: RANK_COLORS[r.rank - 1], fontWeight: 700, width: 44 }}>
                  {r.rank}位
                </td>
                <td style={{ textAlign: 'left' }}>{name(r.playerId)}</td>
                <td className="num">{r.points.toLocaleString()}</td>
                <td className={`num ${r.score >= 0 ? 'pos' : 'neg'}`}>
                  {r.score > 0 ? '+' : ''}
                  {r.score.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        {hasHands ? (
          <button className="btn sm ghost" onClick={() => setOpen((o) => !o)}>
            {open ? '局ログを隠す' : `局ログを見る（${game.hands.length}）`}
          </button>
        ) : (
          <span className="muted">最終点のみ記録</span>
        )}
        <span className="spacer" />
        <button
          className="btn sm danger"
          onClick={() => {
            if (confirm('この対局を削除しますか？')) api.removeGame(game.id)
          }}
        >
          削除
        </button>
      </div>

      {open && hasHands && <HandLog game={game} rules={rules} name={name} />}
    </div>
  )
}

function HandLog({ game, rules, name }: { game: Game; rules: Rules; name: NameFn }) {
  const { steps } = replay(game, rules)
  return (
    <div className="hand-list" style={{ marginTop: 10 }}>
      {steps.map((s, i) => (
        <div className="hand-row" key={i}>
          <span className="muted" style={{ minWidth: 62 }}>
            {s.label}
          </span>
          {summary(s.hand, name)}
        </div>
      ))}
    </div>
  )
}

function summary(h: Hand, name: NameFn) {
  if (h.type === 'ron')
    return (
      <>
        <span className="tag win">ロン</span>
        <span>
          {name(h.winner)} ← {name(h.loser)}（{scoreText(h)}）
        </span>
      </>
    )
  if (h.type === 'tsumo')
    return (
      <>
        <span className="tag win">ツモ</span>
        <span>
          {name(h.winner)}（{scoreText(h)}）
        </span>
      </>
    )
  if (h.type === 'draw')
    return (
      <>
        <span className="tag draw">流局</span>
        <span>テンパイ: {h.tenpai.map(name).join('・') || 'なし'}</span>
      </>
    )
  return <span className="tag draw">途中流局</span>
}

function scoreText(h: { han: number; fu: number }): string {
  if (h.han >= 5)
    return h.han >= 13
      ? '役満'
      : h.han >= 11
        ? '三倍満'
        : h.han >= 8
          ? '倍満'
          : h.han >= 6
            ? '跳満'
            : '満貫'
  return `${h.han}翻${h.fu}符`
}
