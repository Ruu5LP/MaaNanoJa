import { useMemo, useState } from 'react'
import {
  WINDS,
  replay,
  roundLabel,
  gameResults,
  pointsCheck,
  rotateToDealer,
  handToFormState,
} from '../lib/game'
import { uid } from '../lib/store'
import { scoreTable, manganRow, hanLabel, type GameResult } from '../lib/scoring'
import type {
  AdjustHand,
  DB,
  Draft,
  Game,
  Hand,
  HandFormState,
  HandType,
  Rules,
} from '../lib/domain'
import type { Api } from '../App'
import { todayStr } from '../lib/date'

type NameFn = (pid: string) => string
type SaveFn = (game: Omit<Game, 'id'>) => void
type Mode = Draft['mode']

/** 入力中の1局の初期値（何も選んでいない状態）。 */
function emptyForm(): HandFormState {
  return { type: 'ron', winners: [], loser: '', scores: {}, riichi: [], tenpai: [] }
}

function draftToGame(
  draft: Draft,
  hands: Hand[],
  finalPoints: Record<string, number>,
  rules: Rules,
): Omit<Game, 'id'> {
  return {
    date: draft.date,
    note: draft.note,
    playerIds: draft.playerIds,
    hands,
    finalPoints,
    rules: draft.rules ?? rules,
    createdAt: Date.now(),
  }
}

export default function RecordView({
  db,
  api,
  onDone,
  onOpenSettings,
}: {
  db: DB
  api: Api
  onDone: () => void
  onOpenSettings?: () => void
}) {
  // 進行中の半荘は DB に持たせて全端末で共有する（`db.draft`）。
  // どの端末からでも同じ対局に入力でき、席・局ログ・持ち点はCloudflare同期で自動的に揃う。
  // 誰かが「新しい半荘」を始めると全端末がその入力画面になり、保存すると全端末が新規フォームに戻る。
  const draft = db.draft
  const start = (d: Draft) => api.setDraft(d)
  const cancel = () => {
    if (confirm('進行中の半荘を破棄しますか？全端末の入力内容が消えます。')) api.setDraft(null)
  }
  const save: SaveFn = (game) => {
    api.commitDraft(game)
    onDone()
  }

  if (draft)
    return draft.mode === 'quick' ? (
      <QuickView db={db} api={api} draft={draft} onSave={save} onCancel={cancel} />
    ) : (
      <LiveView db={db} api={api} draft={draft} onSave={save} onCancel={cancel} />
    )

  return <SetupView db={db} onStart={start} onOpenSettings={onOpenSettings} />
}

/** 前回の対局の並びを引き継ぐ（全員が現在も登録済みのときだけ）。無ければ空スロット。 */
function lastUsedSeats(db: DB): (string | null)[] {
  const last = db.games[db.games.length - 1]
  const known = new Set(db.players.map((p) => p.id))
  if (last && last.playerIds.length === 4 && last.playerIds.every((id) => known.has(id))) {
    return last.playerIds
  }
  return [null, null, null, null]
}

/* ---------- セットアップ ---------- */
function SetupView({
  db,
  onStart,
  onOpenSettings,
}: {
  db: DB
  onStart: (draft: Draft) => void
  onOpenSettings?: () => void
}) {
  const initialSeats = useMemo(() => lastUsedSeats(db), [db])
  const [seats, setSeats] = useState<(string | null)[]>(initialSeats)
  const [editingSeats, setEditingSeats] = useState(initialSeats.some((s) => !s))
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [dealerId, setDealerId] = useState<string | null>(initialSeats[0] ?? null)

  const chosen = seats.filter((s): s is string => Boolean(s))
  const ready = chosen.length === 4 && new Set(chosen).size === 4
  const name: NameFn = (pid) => db.players.find((p) => p.id === pid)?.name ?? '?'
  const effectiveDealer = dealerId && chosen.includes(dealerId) ? dealerId : (chosen[0] ?? null)

  const available = (slotIdx: number) =>
    db.players.filter((p) => !seats.includes(p.id) || seats[slotIdx] === p.id)

  function begin(mode: Mode) {
    const base = seats as string[]
    const playerIds =
      mode === 'live' && effectiveDealer ? rotateToDealer(base, effectiveDealer) : base
    onStart({
      mode,
      date,
      note,
      playerIds,
      hands: [],
      rules: { ...db.rules, uma: [...db.rules.uma] as Rules['uma'] },
      finalPoints: Object.fromEntries(playerIds.map((pid) => [pid, db.rules.startPoints])),
      form: null,
      // quick モードの入力中の点数も全端末で共有する（初期値は配給原点）。
      quickPoints: Object.fromEntries(playerIds.map((pid) => [pid, String(db.rules.startPoints)])),
    })
  }

  const content = (
    <div className="card">
      <h2>新しい半荘</h2>
      {db.players.length < 4 ? (
        <>
          <p className="muted">
            対局を始めるには、まず4人のプレイヤーを登録してください。登録後は席順と起家を選べます。
          </p>
          {onOpenSettings && (
            <button className="btn primary" onClick={onOpenSettings}>
              メンバーを設定する
            </button>
          )}
        </>
      ) : (
        <>
          <div className="grid2" style={{ marginBottom: 12 }}>
            <label className="field">
              日付
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              メモ（任意）
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例: 7月定例"
              />
            </label>
          </div>

          <div className="row">
            <h3 className="sec" style={{ margin: 0 }}>
              メンバー
            </h3>
            <span className="spacer" />
            <button className="btn sm ghost" onClick={() => setEditingSeats((v) => !v)}>
              {editingSeats ? '閉じる' : '変更'}
            </button>
          </div>

          {editingSeats ? (
            <div className="player-picker">
              {seats.map((sid, i) => (
                <div className="slot" key={i}>
                  <span className="wind">{WINDS[i]}</span>
                  <select
                    aria-label={`${WINDS[i]}のプレイヤー`}
                    value={sid ?? ''}
                    onChange={(e) => {
                      const v = e.target.value || null
                      setSeats((s) => s.map((x, idx) => (idx === i ? v : x)))
                    }}
                  >
                    <option value="">— 選択 —</option>
                    {available(i).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ) : (
            <div className="pick-row">
              {chosen.map((pid, i) => (
                <span className="pill" key={pid}>
                  <b className="wind">{WINDS[i]}</b>
                  {name(pid)}
                </span>
              ))}
            </div>
          )}

          {ready && (
            <>
              <h3 className="sec">起家（最初の親）※局ログ記録のみ使用</h3>
              <div className="pick-row">
                {chosen.map((pid) => (
                  <button
                    key={pid}
                    className={`pill ${effectiveDealer === pid ? 'on' : ''}`}
                    type="button"
                    aria-pressed={effectiveDealer === pid}
                    onClick={() => setDealerId(pid)}
                  >
                    {name(pid)}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn primary" disabled={!ready} onClick={() => begin('live')}>
              局ログで記録
            </button>
            <button className="btn" disabled={!ready} onClick={() => begin('quick')}>
              最終点だけ入力
            </button>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            「局ログ」＝和了・放銃・流局を1局ずつ記録（放銃率などのデータが取れる）。
            「最終点だけ」＝従来どおり終局の持ち点だけ入力（起家の指定は不要）。
          </p>
        </>
      )}
    </div>
  )
  return <div className="view">{content}</div>
}

/* ---------- かんたん入力（最終点のみ） ---------- */
function QuickView({
  db,
  api,
  draft,
  onSave,
  onCancel,
}: {
  db: DB
  api: Api
  draft: Draft
  onSave: SaveFn
  onCancel: () => void
}) {
  const name: NameFn = (pid) => db.players.find((p) => p.id === pid)?.name ?? '?'
  // 入力中の点数は共有中の draft.quickPoints（api 経由でDBへ→全端末に同期）。
  const pts = draft.quickPoints ?? {}
  const setPt = (pid: string, v: string) =>
    api.setDraft({ ...draft, quickPoints: { ...pts, [pid]: v } })

  const game = draftToGame(draft, [], numify(pts), db.rules)
  const check = pointsCheck({ ...game, id: 'draft' }, db.rules)
  const results = safeResults({ ...game, id: 'draft' }, db.rules)

  return (
    <div className="view">
      <div className="card">
        <h2>{draft.date} 最終持ち点</h2>
        <div className="stack">
          {draft.playerIds.map((pid, i) => (
            <label className="field" key={pid}>
              <span>
                <b className="wind" style={{ color: 'var(--accent)' }}>
                  {WINDS[i]}
                </b>{' '}
                {name(pid)}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={-1000000}
                max={1000000}
                value={pts[pid] ?? ''}
                onChange={(e) => setPt(pid, e.target.value)}
              />
            </label>
          ))}
        </div>
        <div className={`checkline ${check.ok ? 'ok' : 'warn'}`}>
          合計 {check.sum.toLocaleString()} 点
          {check.ok
            ? `（${check.expected.toLocaleString()} でOK）`
            : `：配給原点×4 と ${check.diff > 0 ? '+' : ''}${check.diff} 点ズレています`}
        </div>

        {results.length > 0 && <ResultPreview results={results} name={name} />}

        <div className="row" style={{ marginTop: 14 }}>
          <button
            className="btn primary"
            onClick={() => {
              if (
                !check.ok &&
                !confirm('点数の合計が配給原点と一致していません。このまま保存しますか？')
              )
                return
              onSave(game)
            }}
          >
            保存
          </button>
          <button className="btn ghost" onClick={onCancel}>
            やめる
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- 局ログ入力（ライブ） ---------- */
function LiveView({
  db,
  api,
  draft,
  onSave,
  onCancel,
}: {
  db: DB
  api: Api
  draft: Draft
  onSave: SaveFn
  onCancel: () => void
}) {
  const rules = draft.rules ?? db.rules
  const name: NameFn = (pid) => db.players.find((p) => p.id === pid)?.name ?? '?'
  const gameForReplay: Game = { ...draft, id: 'draft' }
  const { state } = useMemo(() => replay({ ...draft, id: 'draft' }, rules), [draft, rules])
  const [finishing, setFinishing] = useState(false)
  // 積み棒の手動修正・入力中の1局も共有中の draft に持たせて全端末で揃える。
  const honbaAdjust = draft.honbaAdjust ?? 0
  const setHonbaAdjust = (n: number) => api.setDraft({ ...draft, honbaAdjust: n })
  const effectiveHonba = Math.max(0, state.honba + honbaAdjust)

  // 点数の手動修正（実際の持ち点とズレたときの補正）。パネルの開閉・入力中の値も共有中の draft に持たせる。
  const pointsEdit = draft.pointsEdit
  function openPointsEdit() {
    const init: Record<string, string> = {}
    for (const pid of draft.playerIds) init[pid] = String(state.points[pid] ?? 0)
    api.setDraft({ ...draft, pointsEdit: init })
  }
  function setPointsEditValue(pid: string, v: string) {
    api.setDraft({ ...draft, pointsEdit: { ...pointsEdit, [pid]: v } })
  }
  function closePointsEdit() {
    api.setDraft({ ...draft, pointsEdit: undefined })
  }
  function applyPointsEdit() {
    if (!pointsEdit) return
    const delta: Record<string, number> = {}
    let changed = false
    for (const pid of draft.playerIds) {
      const now = state.points[pid] ?? 0
      const next = Number(pointsEdit[pid]) || 0
      if (next !== now) {
        delta[pid] = next - now
        changed = true
      }
    }
    if (!changed) {
      closePointsEdit()
      return
    }
    api.setDraft({
      ...draft,
      hands: [...draft.hands, { id: uid(), type: 'adjust', riichi: [], delta }],
      pointsEdit: undefined,
    })
  }
  const pointsEditSum = pointsEdit
    ? draft.playerIds.reduce((a, pid) => a + (Number(pointsEdit[pid]) || 0), 0)
    : 0
  const pointsEditExpected = rules.startPoints * draft.playerIds.length - state.pot

  // 局の追加・取り消し・入力中の1局は、共有中の draft を丸ごと差し替えて反映する
  // （api 経由でDBへ→全端末に同期）。入力中の1局(form)・積み棒(honbaAdjust)も共有するので、
  // 和了者選択・点数早見表・積み棒修正が全端末で揃う。
  function addHand(hand: Hand) {
    const withOverride = honbaAdjust !== 0 ? { ...hand, honbaOverride: effectiveHonba } : hand
    api.setDraft({ ...draft, hands: [...draft.hands, withOverride], form: null, honbaAdjust: 0 })
  }
  function undo() {
    api.setDraft({ ...draft, hands: draft.hands.slice(0, -1) })
  }
  const form = draft.form ?? emptyForm()
  const onFormChange = (f: HandFormState) => api.setDraft({ ...draft, form: f })

  // 局ログから選んで編集し直す（和了者・点数などの入力ミスを、取り消して打ち直さず直接直せるように）。
  const editingIndex = draft.editingIndex
  function selectHand(i: number) {
    const hand = draft.hands[i]
    if (!hand) return
    const f = handToFormState(hand)
    api.setDraft({ ...draft, editingIndex: i, form: f ?? draft.form })
  }
  function cancelEdit() {
    api.setDraft({ ...draft, editingIndex: undefined, form: null })
  }
  function deleteSelected() {
    if (editingIndex == null) return
    const hands = draft.hands.filter((_, i) => i !== editingIndex)
    api.setDraft({ ...draft, hands, editingIndex: undefined, form: null })
  }
  function submitHand(hand: Hand) {
    if (editingIndex == null) {
      addHand(hand)
      return
    }
    const original = draft.hands[editingIndex]
    const withOverride =
      original?.honbaOverride !== undefined
        ? { ...hand, id: original.id, honbaOverride: original.honbaOverride }
        : { ...hand, id: original?.id ?? hand.id }
    const hands = draft.hands.map((h, i) => (i === editingIndex ? withOverride : h))
    api.setDraft({ ...draft, hands, editingIndex: undefined, form: null })
  }
  const selectedHand = editingIndex != null ? draft.hands[editingIndex] : undefined

  const dealerId = draft.playerIds[state.dealerIndex] ?? ''

  if (finishing) {
    const game = draftToGame(draft, draft.hands, { ...state.points }, rules)
    const gameWithId: Game = { ...game, id: 'draft' }
    const results = gameResults(gameWithId, rules)
    const check = pointsCheck(gameWithId, rules)
    return (
      <div className="view">
        <div className="card">
          <h2>{roundLabel(state)} 終了・結果</h2>
          {!check.ok && (
            <div className="checkline warn">
              最終持ち点の合計が {check.diff > 0 ? '+' : ''}
              {check.diff} 点ズレています（場に残ったリーチ棒などが原因なら問題ありません）
            </div>
          )}
          <ResultPreview results={results} name={name} />
          <div className="row" style={{ marginTop: 14 }}>
            <button
              className="btn primary"
              onClick={() => {
                if (
                  !check.ok &&
                  !confirm('点数の合計が配給原点と一致していません。このまま保存しますか？')
                )
                  return
                onSave(game)
              }}
            >
              この結果で保存
            </button>
            <button className="btn ghost" onClick={() => setFinishing(false)}>
              対局に戻る
            </button>
          </div>
        </div>
      </div>
    )
  }

  // PC幅（≥1024px）では「入力（左）｜局ログ（右）」の2カラム、スマホは従来どおり縦積み（CSS側）。
  return (
    <div className="view view-wide play-grid">
      <div className="play-main">
        <div className="card">
          <div className="row">
            <h2 style={{ margin: 0 }}>
              {WINDS[state.roundWind] ?? '?'}
              {state.roundNum}局{effectiveHonba ? ` ${effectiveHonba}本場` : ''}
            </h2>
            <span className="spacer" />
            {state.pot > 0 && <span className="pill">供託 {state.pot}</span>}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted">積み棒を修正</span>
            <span className="spacer" />
            <button
              className="btn sm ghost"
              disabled={effectiveHonba <= 0}
              onClick={() => setHonbaAdjust(honbaAdjust - 1)}
            >
              −1
            </button>
            <button className="btn sm ghost" onClick={() => setHonbaAdjust(honbaAdjust + 1)}>
              +1
            </button>
            {honbaAdjust !== 0 && (
              <button className="btn sm ghost" onClick={() => setHonbaAdjust(0)}>
                元に戻す
              </button>
            )}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted">点数を修正</span>
            <span className="spacer" />
            {pointsEdit ? (
              <>
                <button className="btn sm ghost" onClick={closePointsEdit}>
                  キャンセル
                </button>
                <button className="btn sm primary" onClick={applyPointsEdit}>
                  反映
                </button>
              </>
            ) : (
              <button className="btn sm ghost" onClick={openPointsEdit}>
                修正
              </button>
            )}
          </div>
          {pointsEdit && (
            <div
              className={`checkline ${pointsEditSum === pointsEditExpected ? 'ok' : 'warn'}`}
              style={{ marginTop: 6 }}
            >
              合計 {pointsEditSum.toLocaleString()} 点
              {pointsEditSum === pointsEditExpected
                ? '（供託を除く配給原点合計と一致）'
                : `：供託を除く配給原点合計 ${pointsEditExpected.toLocaleString()} 点との差 ${
                    pointsEditSum - pointsEditExpected > 0 ? '+' : ''
                  }${pointsEditSum - pointsEditExpected}`}
            </div>
          )}
          <div className="scoreboard" style={{ marginTop: 10 }}>
            {draft.playerIds.map((pid, i) => (
              <div className={`p ${pid === dealerId ? 'dealer' : ''}`} key={pid}>
                <div className="nm">
                  {WINDS[i]} {name(pid)}
                </div>
                {pointsEdit ? (
                  <input
                    className="pt-input"
                    type="number"
                    inputMode="numeric"
                    value={pointsEdit[pid] ?? ''}
                    onChange={(e) => setPointsEditValue(pid, e.target.value)}
                  />
                ) : (
                  <div className={`pt ${(state.points[pid] ?? 0) < 0 ? 'neg' : ''}`}>
                    {(state.points[pid] ?? 0).toLocaleString()}
                  </div>
                )}
                {pid === dealerId && <div className="badge">親</div>}
              </div>
            ))}
          </div>

          {selectedHand?.type === 'adjust' ? (
            <AdjustHandEditor
              hand={selectedHand}
              name={name}
              onDelete={deleteSelected}
              onCancel={cancelEdit}
            />
          ) : (
            <HandForm
              db={db}
              playerIds={draft.playerIds}
              dealerId={dealerId}
              form={form}
              editing={editingIndex != null}
              onChange={onFormChange}
              onSubmit={submitHand}
              onCancelEdit={cancelEdit}
              onDelete={editingIndex != null ? deleteSelected : undefined}
            />
          )}
        </div>

        <div className="row">
          <button
            className="btn primary"
            disabled={draft.hands.length === 0}
            onClick={() => setFinishing(true)}
          >
            半荘を終了
          </button>
          <button className="btn ghost" onClick={onCancel}>
            破棄
          </button>
        </div>
      </div>

      <div className="play-log">
        <div className="card">
          <div className="row">
            <h2 style={{ margin: 0 }}>局ログ（{draft.hands.length}）</h2>
            <span className="spacer" />
            <button className="btn sm ghost" disabled={!draft.hands.length} onClick={undo}>
              1局戻す
            </button>
          </div>
          {draft.hands.length === 0 ? (
            <p className="muted">まだ局がありません。入力フォームから追加してください。</p>
          ) : (
            <>
              <p className="muted" style={{ marginTop: -4, marginBottom: 8 }}>
                局をタップすると内容を編集できます。
              </p>
              <HandLog
                game={gameForReplay}
                rules={rules}
                name={name}
                selectedIndex={editingIndex ?? null}
                onSelect={selectHand}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function HandForm({
  db,
  playerIds,
  dealerId,
  form,
  editing,
  onChange,
  onSubmit,
  onCancelEdit,
  onDelete,
}: {
  db: DB
  playerIds: string[]
  dealerId: string
  /** 入力中の1局（全端末で共有）。 */
  form: HandFormState
  /** 局ログから選んだ局を編集中かどうか（true なら「追加」ではなく「更新」）。 */
  editing: boolean
  /** 入力中の1局が変わったら呼ぶ（共有DBへ反映）。 */
  onChange: (form: HandFormState) => void
  onSubmit: (hand: Hand) => void
  /** 編集をやめて新規入力に戻る。 */
  onCancelEdit: () => void
  /** 編集中の局を削除する（編集中のみ）。 */
  onDelete?: () => void
}) {
  const { type, winners, loser, scores, riichi, tenpai } = form
  const name: NameFn = (pid) => db.players.find((p) => p.id === pid)?.name ?? '?'

  function toggleField(key: 'riichi' | 'tenpai', pid: string) {
    const list = form[key]
    onChange({
      ...form,
      [key]: list.includes(pid) ? list.filter((x) => x !== pid) : [...list, pid],
    })
  }
  function changeType(t: HandType) {
    // 和了者・放銃者・点数をリセットし、対象外の局種別のテンパイ情報を残さない。
    onChange({
      ...form,
      type: t,
      winners: [],
      loser: '',
      scores: {},
      tenpai: t === 'draw' ? form.tenpai : [],
    })
  }
  function toggleWinner(pid: string) {
    if (type === 'tsumo') {
      onChange({ ...form, winners: winners[0] === pid ? [] : [pid] })
      return
    }
    const nextWinners = winners.includes(pid) ? winners.filter((x) => x !== pid) : [...winners, pid]
    const nextScores = scores[pid] ? scores : { ...scores, [pid]: { han: 3, fu: 30 } }
    onChange({
      ...form,
      winners: nextWinners,
      scores: nextScores,
      loser: loser === pid ? '' : loser,
    })
  }
  function toggleLoser(pid: string) {
    onChange({
      ...form,
      loser: loser === pid ? '' : pid,
      winners: winners.filter((x) => x !== pid),
    })
  }
  function setScore(pid: string, han: number, fu: number) {
    onChange({ ...form, scores: { ...scores, [pid]: { han, fu } } })
  }
  function submit() {
    const id = uid()
    if (type === 'ron') {
      if (!winners.length || !loser) return
      const wins = winners.map((w) => ({
        winner: w,
        han: scores[w]?.han ?? 3,
        fu: scores[w]?.fu ?? 30,
      }))
      onSubmit({ id, type, wins, loser, riichi })
    } else if (type === 'tsumo') {
      const w = winners[0]
      if (!w) return
      const { han, fu } = scores[w] ?? { han: 3, fu: 30 }
      onSubmit({ id, type, winner: w, han, fu, riichi })
    } else if (type === 'draw') {
      onSubmit({ id, type, tenpai, riichi })
    } else {
      onSubmit({ id, type: 'abortive', riichi })
    }
    // 追加後の form クリアは呼び出し側（draft.form=null）で行う。
  }

  const needScore = type === 'ron' || type === 'tsumo'
  const canSubmit =
    (type === 'ron' && winners.length > 0 && !!loser) ||
    (type === 'tsumo' && winners.length === 1) ||
    type === 'draw' ||
    type === 'abortive'

  const TYPE_LABELS: [HandType, string][] = [
    ['ron', 'ロン'],
    ['tsumo', 'ツモ'],
    ['draw', '流局'],
    ['abortive', '途中流局'],
  ]

  return (
    <div style={{ marginTop: 14 }}>
      <div className="seg-control" style={{ marginBottom: 10 }}>
        {TYPE_LABELS.map(([v, l]) => (
          <button
            key={v}
            type="button"
            className={type === v ? 'active' : ''}
            aria-pressed={type === v}
            onClick={() => changeType(v)}
          >
            {l}
          </button>
        ))}
      </div>

      {needScore && (
        <div className="stack">
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>
              和了者
            </div>
            <div className="pick-row">
              {playerIds.map((pid) => (
                <button
                  key={pid}
                  type="button"
                  className={`pill ${winners.includes(pid) ? 'on' : ''}`}
                  aria-pressed={winners.includes(pid)}
                  disabled={type === 'ron' && pid === loser}
                  onClick={() => toggleWinner(pid)}
                >
                  {name(pid)} {pid === dealerId ? '（親）' : ''}
                </button>
              ))}
            </div>
          </div>
          {type === 'ron' && (
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>
                放銃者
              </div>
              <div className="pick-row">
                {playerIds.map((pid) => (
                  <button
                    key={pid}
                    type="button"
                    className={`pill ${loser === pid ? 'on' : ''}`}
                    aria-pressed={loser === pid}
                    disabled={winners.includes(pid)}
                    onClick={() => toggleLoser(pid)}
                  >
                    {name(pid)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {winners.map((pid) => (
            <ScorePicker
              key={pid}
              label={`${name(pid)}${pid === dealerId ? '（親）' : ''}の点数`}
              winnerIsDealer={pid === dealerId}
              isTsumo={type === 'tsumo'}
              value={scores[pid] ?? { han: 3, fu: 30 }}
              onChange={(han, fu) => setScore(pid, han, fu)}
            />
          ))}
        </div>
      )}

      {type === 'draw' && (
        <div style={{ marginTop: 4 }}>
          <div className="muted" style={{ marginBottom: 6 }}>
            テンパイ者
          </div>
          <div className="pick-row">
            {playerIds.map((pid) => (
              <button
                key={pid}
                type="button"
                className={`pill ${tenpai.includes(pid) ? 'on' : ''}`}
                aria-pressed={tenpai.includes(pid)}
                onClick={() => toggleField('tenpai', pid)}
              >
                {name(pid)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <div className="muted" style={{ marginBottom: 6 }}>
          立直した人
        </div>
        <div className="pick-row">
          {playerIds.map((pid) => (
            <button
              key={pid}
              type="button"
              className={`pill ${riichi.includes(pid) ? 'on' : ''}`}
              aria-pressed={riichi.includes(pid)}
              onClick={() => toggleField('riichi', pid)}
            >
              {name(pid)}
            </button>
          ))}
        </div>
      </div>

      {editing ? (
        <div className="row" style={{ marginTop: 14 }}>
          <button
            className="btn primary"
            style={{ flex: 1 }}
            disabled={!canSubmit}
            onClick={submit}
          >
            この局を更新
          </button>
          {onDelete && (
            <button className="btn danger" onClick={onDelete}>
              削除
            </button>
          )}
          <button className="btn ghost" onClick={onCancelEdit}>
            キャンセル
          </button>
        </div>
      ) : (
        <button
          className="btn primary"
          style={{ marginTop: 14, width: '100%' }}
          disabled={!canSubmit}
          onClick={submit}
        >
          この局を追加
        </button>
      )}
    </div>
  )
}

function AdjustHandEditor({
  hand,
  name,
  onDelete,
  onCancel,
}: {
  hand: AdjustHand
  name: NameFn
  onDelete: () => void
  onCancel: () => void
}) {
  const entries = Object.entries(hand.delta).filter(([, v]) => v !== 0)
  return (
    <div style={{ marginTop: 14 }}>
      <p className="muted">
        この局は「点数修正」です。編集はできません。取り消したい場合は削除してください。
      </p>
      <div className="delta-chips">
        {entries.map(([pid, d]) => (
          <span key={pid} className={`delta-chip ${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}`}>
            <span>{name(pid)}</span>
            <span>
              {d > 0 ? '+' : ''}
              {d.toLocaleString()}
            </span>
          </span>
        ))}
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn danger" onClick={onDelete}>
          この修正を削除
        </button>
        <button className="btn ghost" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </div>
  )
}

function ScorePicker({
  label,
  winnerIsDealer,
  isTsumo,
  value,
  onChange,
}: {
  label: string
  winnerIsDealer: boolean
  isTsumo: boolean
  value: { han: number; fu: number }
  onChange: (han: number, fu: number) => void
}) {
  const table = scoreTable(winnerIsDealer, isTsumo)
  const mangans = manganRow(winnerIsDealer, isTsumo)
  return (
    <div style={{ marginTop: 4 }}>
      <div className="muted" style={{ marginBottom: 6 }}>
        {label}（翻×符の早見表から選ぶ）
      </div>
      <div className="table-wrap">
        <table className="score-table">
          <thead>
            <tr>
              <th></th>
              {table[0]!.map((c) => (
                <th key={c.fu}>{c.fu}符</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map((row) => (
              <tr key={row[0]!.han}>
                <th>{row[0]!.han}翻</th>
                {row.map((c) => (
                  <td key={c.fu}>
                    <button
                      type="button"
                      className={`score-cell ${value.han === c.han && value.fu === c.fu ? 'on' : ''}`}
                      aria-label={`${c.han}翻${c.fu}符 ${c.total.toLocaleString()}点`}
                      aria-pressed={value.han === c.han && value.fu === c.fu}
                      onClick={() => onChange(c.han, c.fu)}
                    >
                      {c.total.toLocaleString()}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* 満貫〜役満は名前のボタン（pick-row）と同じく、均等幅で横いっぱいに並べる。
          スマホなど狭い幅では文字が折れて読めなくなるので、その場合だけ横スクロールにする。 */}
      <div className="pick-row mangan-row" style={{ marginTop: 8 }}>
        {mangans.map((m) => (
          <button
            key={m.han}
            type="button"
            className={`pill ${value.han === m.han ? 'on' : ''}`}
            aria-pressed={value.han === m.han}
            onClick={() => onChange(m.han, m.fu)}
          >
            {m.total.toLocaleString()}（{hanLabel(m.han)}）
          </button>
        ))}
      </div>
    </div>
  )
}

function HandLog({
  game,
  rules,
  name,
  selectedIndex,
  onSelect,
}: {
  game: Game
  rules: Rules
  name: NameFn
  /** 局ログから選んで編集中の局のインデックス（選んでいなければ null）。 */
  selectedIndex: number | null
  /** 局を選んだら呼ぶ（編集フォームを開く）。 */
  onSelect: (i: number) => void
}) {
  const { steps } = replay(game, rules)
  return (
    <div className="hand-list">
      {steps.map((s, i) => (
        <button
          type="button"
          className={`hand-row ${selectedIndex === i ? 'selected' : ''}`}
          key={s.hand.id || i}
          onClick={() => onSelect(i)}
        >
          <div className="hand-row-head">
            <span className="muted" style={{ minWidth: 62 }}>
              {s.label}
            </span>
            {handTag(s.hand)}
          </div>
          <DeltaChips playerIds={game.playerIds} name={name} delta={s.delta} />
        </button>
      ))}
    </div>
  )
}

function handTag(h: Hand) {
  if (h.type === 'ron') return <span className="tag win">ロン</span>
  if (h.type === 'tsumo') return <span className="tag win">ツモ</span>
  if (h.type === 'draw') return <span className="tag draw">流局</span>
  if (h.type === 'adjust') return <span className="tag adjust">点数修正</span>
  return <span className="tag draw">途中流局</span>
}

function DeltaChips({
  playerIds,
  name,
  delta,
}: {
  playerIds: string[]
  name: NameFn
  delta: Record<string, number>
}) {
  return (
    <div className="delta-chips">
      {playerIds.map((pid) => {
        const d = delta[pid] ?? 0
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
  )
}

function ResultPreview({ results, name }: { results: GameResult[]; name: NameFn }) {
  const rankColors = ['var(--rank1)', 'var(--rank2)', 'var(--rank3)', 'var(--rank4)']
  return (
    <div className="table-wrap" style={{ marginTop: 12 }}>
      <table>
        <thead>
          <tr>
            <th>順位</th>
            <th>プレイヤー</th>
            <th>持ち点</th>
            <th>スコア</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.playerId}>
              <td style={{ color: rankColors[r.rank - 1], fontWeight: 700 }}>{r.rank}位</td>
              <td>{name(r.playerId)}</td>
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
  )
}

function numify(pts: Record<string, string | number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of Object.keys(pts)) out[k] = Number(pts[k]) || 0
  return out
}

function safeResults(game: Game, rules: Rules): GameResult[] {
  try {
    return gameResults(game, rules)
  } catch {
    return []
  }
}
