// 入力中プレビュー（実況）。別の端末が今まさに打っている半荘を、読み取り専用でライブ表示する。
// どのタブを開いていても画面上部にポップアップで出る（App が全体にかぶせて描画する）。
// 表示専用なので操作はできない。データは実況ペイロード（LiveInput）＋共有中の db から組み立てる。
import { useState } from 'react'
import { replay, roundLabel, WINDS } from '../lib/game'
import { scoreTable, manganRow } from '../lib/scoring'
import type { DB, Game } from '../lib/domain'
import type { LiveInput, LiveForm } from '../lib/live'

/** 翻符から和了点の合計を早見表で引く（入力者が見ていた点数と一致させる）。無ければ null。 */
function lookupTotal(han: number, fu: number, isDealer: boolean, isTsumo: boolean): number | null {
  for (const row of scoreTable(isDealer, isTsumo)) {
    for (const c of row) if (c.han === han && c.fu === fu) return c.total
  }
  for (const m of manganRow(isDealer, isTsumo)) if (m.han === han) return m.total
  return null
}

/** replay は不正なログで例外を投げうるので、実況表示では握って安全側に倒す。 */
function safeReplay(game: Game, db: DB) {
  try {
    return replay(game, db.rules)
  } catch {
    return null
  }
}

export default function LivePreview({ live, db }: { live: LiveInput; db: DB }) {
  const [open, setOpen] = useState(true)
  const name = (pid: string) => db.players.find((p) => p.id === pid)?.name ?? '?'

  const game: Game = {
    id: 'live',
    date: '',
    note: '',
    playerIds: live.playerIds,
    hands: live.hands,
    finalPoints: {},
    createdAt: 0,
  }
  const rep = safeReplay(game, db)

  return (
    <div className="live-preview">
      <button className="live-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="live-dot" />
        <span className="live-title">別の端末で入力中</span>
        <span className="spacer" />
        <span className="live-toggle">{open ? '隠す ▲' : '見る ▼'}</span>
      </button>

      {open && rep && (
        <div className="live-body">
          <div className="live-round">
            {roundLabel({ ...rep.state, honba: Math.max(0, rep.state.honba + live.honbaAdjust) })}
            {rep.state.pot > 0 && <span className="pill">供託 {rep.state.pot}</span>}
          </div>

          <div className="scoreboard">
            {live.playerIds.map((pid, i) => {
              const isDealer = i === rep.state.dealerIndex
              const pt = rep.state.points[pid] ?? 0
              return (
                <div className={`p ${isDealer ? 'dealer' : ''}`} key={pid}>
                  <div className="nm">
                    {WINDS[i]} {name(pid)}
                  </div>
                  <div className={`pt ${pt < 0 ? 'neg' : ''}`}>{pt.toLocaleString()}</div>
                  {isDealer && <div className="badge">親</div>}
                </div>
              )
            })}
          </div>

          <FormLine
            form={live.form}
            dealerId={live.playerIds[rep.state.dealerIndex] ?? ''}
            name={name}
          />
        </div>
      )}
    </div>
  )
}

/** 入力中の1局の中身を1行で表す。まだ何も選んでいなければ控えめな案内。 */
function FormLine({
  form,
  dealerId,
  name,
}: {
  form: LiveForm | null
  dealerId: string
  name: (pid: string) => string
}) {
  if (!form) {
    return <div className="live-form muted">この局の入力を待っています…</div>
  }

  const riichi =
    form.riichi.length > 0 ? (
      <span className="live-riichi">リーチ: {form.riichi.map(name).join('・')}</span>
    ) : null

  if (form.type === 'draw') {
    const tenpai = form.tenpai.length > 0 ? form.tenpai.map(name).join('・') : 'なし'
    return (
      <div className="live-form">
        <span className="tag draw">流局</span> テンパイ: {tenpai}
        {riichi}
      </div>
    )
  }
  if (form.type === 'abortive') {
    return (
      <div className="live-form">
        <span className="tag draw">途中流局</span>
        {riichi}
      </div>
    )
  }

  // ロン / ツモ
  const isTsumo = form.type === 'tsumo'
  const winnerParts = form.winners.map((w) => {
    const s = form.scores[w] ?? { han: 3, fu: 30 }
    const total = lookupTotal(s.han, s.fu, w === dealerId, isTsumo)
    const pts = total != null ? `${total.toLocaleString()}点` : `${s.han}翻${s.fu}符`
    return `${name(w)} ${pts}`
  })
  return (
    <div className="live-form">
      <span className={`tag win`}>{isTsumo ? 'ツモ' : 'ロン'}</span>
      {winnerParts.length > 0 ? winnerParts.join(' / ') : '和了者 未選択'}
      {form.type === 'ron' && form.loser && (
        <span className="live-loser">← {name(form.loser)}</span>
      )}
      {riichi}
    </div>
  )
}
