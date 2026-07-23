// 入力中プレビュー（実況）。別の端末が今まさに準備・入力している半荘を、読み取り専用でライブ表示する。
// 表示専用なので操作はできない。データは実況ペイロード（LiveInput）＋共有中の db から組み立てる。
//
// 2つの見せ方（variant）を持つ:
//   - 'banner': 画面上部に貼り付く小さなオーバーレイ（記録タブ以外で、他タブを見ていても気づけるように）。
//   - 'full'  : 記録タブ本体を占める「観戦画面」。スコアボード＋これまでの局ログ＋今打っている1局をフル表示。
//
// 段階（phase）も2つ:
//   - 'setup'   : 席を選んでいる準備中。誰がどの席かが埋まっていく様子を映す。
//   - 'playing' : 局ログ入力中。持ち点・局ログ・打っている最中の1局を映す。
import { useState } from 'react'
import { replay, roundLabel, WINDS, type HandStep } from '../lib/game'
import { scoreTable, manganRow } from '../lib/scoring'
import type { DB, Game, Hand } from '../lib/domain'
import type { LiveInput, LiveForm } from '../lib/live'

type NameFn = (pid: string) => string

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

export default function LivePreview({
  live,
  db,
  variant = 'banner',
}: {
  live: LiveInput
  db: DB
  variant?: 'banner' | 'full'
}) {
  const name: NameFn = (pid) => db.players.find((p) => p.id === pid)?.name ?? '?'
  const isSetup = live.phase === 'setup'
  const title = isSetup ? '別の端末で準備中' : '別の端末で入力中'

  const inner = isSetup ? (
    <SetupBoard seats={live.seats} startPoints={db.rules.startPoints} name={name} />
  ) : (
    <PlayingBoard live={live} db={db} name={name} withLog={variant === 'full'} />
  )

  // 観戦画面（記録タブ本体）。
  if (variant === 'full') {
    return (
      <div className="view">
        <div className="card live-full">
          <div className="live-full-head">
            <span className="live-dot" />
            <span className="live-title">
              {title}
              {isSetup ? '（席を選んでいます）' : '（観戦）'}
            </span>
          </div>
          {inner}
        </div>
      </div>
    )
  }

  // 上部バナー（記録タブ以外）。畳める。
  return <BannerFrame title={title}>{inner}</BannerFrame>
}

/** 準備中（席選び）の表示。埋まった席は名前、未選択は「—」。起家＝東が親。 */
function SetupBoard({
  seats,
  startPoints,
  name,
}: {
  seats: (string | null)[]
  startPoints: number
  name: NameFn
}) {
  return (
    <>
      <div className="live-round">席を選んでいます…</div>
      <div className="scoreboard">
        {[0, 1, 2, 3].map((i) => {
          const pid = seats[i] ?? null
          const isDealer = i === 0
          return (
            <div className={`p ${isDealer ? 'dealer' : ''} ${pid ? '' : 'empty'}`} key={i}>
              <div className="nm">
                {WINDS[i]} {pid ? name(pid) : '—'}
              </div>
              <div className="pt">{pid ? startPoints.toLocaleString() : '—'}</div>
              {isDealer && <div className="badge">親</div>}
            </div>
          )
        })}
      </div>
    </>
  )
}

/** 対局中の表示。持ち点＋今打っている1局。full のときは局ログも出す。 */
function PlayingBoard({
  live,
  db,
  name,
  withLog,
}: {
  live: LiveInput
  db: DB
  name: NameFn
  withLog: boolean
}) {
  const playerIds = live.seats.filter((s): s is string => Boolean(s))
  const game: Game = {
    id: 'live',
    date: live.date,
    note: '',
    playerIds,
    hands: live.hands,
    finalPoints: {},
    createdAt: 0,
  }
  const rep = safeReplay(game, db)
  if (!rep) return <p className="muted">入力を待っています…</p>

  return (
    <>
      <div className="live-round">
        {roundLabel({ ...rep.state, honba: Math.max(0, rep.state.honba + live.honbaAdjust) })}
        {rep.state.pot > 0 && <span className="pill">供託 {rep.state.pot}</span>}
      </div>

      <div className="scoreboard">
        {playerIds.map((pid, i) => {
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

      <FormLine form={live.form} dealerId={playerIds[rep.state.dealerIndex] ?? ''} name={name} />

      {withLog && <HandLogMini steps={rep.steps} playerIds={playerIds} name={name} />}
    </>
  )
}

/** バナーの外枠（開閉トグル付き）。中身が無いときは畳んだ見出しだけ出す。 */
function BannerFrame({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="live-preview">
      <button className="live-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="live-dot" />
        <span className="live-title">{title}</span>
        <span className="spacer" />
        <span className="live-toggle">{open ? '隠す ▲' : '見る ▼'}</span>
      </button>
      {open && children && <div className="live-body">{children}</div>}
    </div>
  )
}

/** これまでに確定した局の一覧（読み取り専用）。入力画面の局ログの簡易版。 */
function HandLogMini({
  steps,
  playerIds,
  name,
}: {
  steps: HandStep[]
  playerIds: string[]
  name: NameFn
}) {
  return (
    <div className="live-log">
      <div className="muted live-log-title">これまでの局（{steps.length}）</div>
      {steps.length === 0 ? (
        <p className="muted">まだ局がありません。</p>
      ) : (
        <div className="hand-list">
          {steps.map((s, i) => (
            <div className="hand-row" key={s.hand.id || i}>
              <div className="hand-row-head">
                <span className="muted" style={{ minWidth: 62 }}>
                  {s.label}
                </span>
                {handTag(s.hand)}
              </div>
              <div className="delta-chips">
                {playerIds.map((pid) => {
                  const d = s.delta[pid] ?? 0
                  return (
                    <span key={pid} className={`delta-chip ${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}`}>
                      <span>{name(pid)}</span>
                      <span>
                        {d > 0 ? '+' : ''}
                        {d.toLocaleString()}
                      </span>
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function handTag(h: Hand) {
  if (h.type === 'ron') return <span className="tag win">ロン</span>
  if (h.type === 'tsumo') return <span className="tag win">ツモ</span>
  if (h.type === 'draw') return <span className="tag draw">流局</span>
  return <span className="tag draw">途中流局</span>
}

/** 入力中の1局の中身を1行で表す。まだ何も選んでいなければ控えめな案内。 */
function FormLine({
  form,
  dealerId,
  name,
}: {
  form: LiveForm | null
  dealerId: string
  name: NameFn
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
