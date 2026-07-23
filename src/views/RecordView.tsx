import { useCallback, useEffect, useMemo, useState } from 'react'
import { WINDS, replay, roundLabel, gameResults, pointsCheck } from '../lib/game'
import { uid } from '../lib/store'
import { scoreTable, manganRow, hanLabel, type GameResult } from '../lib/scoring'
import type { DB, Game, Hand, HandType, Rules } from '../lib/domain'
import type { Api } from '../App'
import { usePublishLive, deviceId } from '../useLiveInput'
import type { LiveForm, LiveInput } from '../lib/live'
import LivePreview from './LivePreview'

type NameFn = (pid: string) => string
type SaveFn = (game: Omit<Game, 'id'>) => void

type Mode = 'quick' | 'live'

interface Draft {
  mode: Mode
  date: string
  note: string
  playerIds: string[] // 席順（起家順, 長さ4）
  hands: Hand[]
  finalPoints: Record<string, number>
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function draftToGame(
  draft: Draft,
  hands: Hand[],
  finalPoints: Record<string, number>,
): Omit<Game, 'id'> {
  return {
    date: draft.date,
    note: draft.note,
    playerIds: draft.playerIds,
    hands,
    finalPoints,
    createdAt: Date.now(),
  }
}

export default function RecordView({
  db,
  api,
  onDone,
  syncing,
  live,
}: {
  db: DB
  api: Api
  onDone: () => void
  /** LAN同期中か。true のとき、入力中の状態を他端末へ実況する。 */
  syncing: boolean
  /** 他端末が入力中ならその実況。自分が入力していないときは観戦画面を出す。 */
  live: LiveInput | null
}) {
  const [draft, setDraft] = useState<Draft | null>(null)

  const save: SaveFn = (game) => {
    api.addGame(game)
    setDraft(null)
    onDone()
  }

  // 自分は入力しておらず、別端末が入力中 → 記録タブ本体を観戦画面にする。
  if (!draft && live) return <LivePreview live={live} db={db} variant="full" />
  if (!draft) return <SetupView db={db} onStart={setDraft} syncing={syncing} />
  if (draft.mode === 'quick')
    return <QuickView db={db} draft={draft} onSave={save} onCancel={() => setDraft(null)} />
  return (
    <LiveView
      db={db}
      draft={draft}
      setDraft={setDraft}
      onSave={save}
      onCancel={() => setDraft(null)}
      syncing={syncing}
    />
  )
}

/* ---------- セットアップ ---------- */
function SetupView({
  db,
  onStart,
  syncing,
}: {
  db: DB
  onStart: (draft: Draft) => void
  syncing: boolean
}) {
  const [seats, setSeats] = useState<(string | null)[]>([null, null, null, null])
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')

  const chosen = seats.filter((s): s is string => Boolean(s))
  const ready = chosen.length === 4 && new Set(chosen).size === 4

  // 席を1人でも選んでいる間は「準備中」の実況を流す（他端末の観戦画面に席選びが映る）。
  // 誰も選んでいなければ流さない＝待機中の他端末と実況枠を取り合わない。
  const livePayload = useMemo<LiveInput | null>(
    () =>
      chosen.length === 0
        ? null
        : {
            editor: deviceId(),
            phase: 'setup',
            date,
            seats,
            hands: [],
            honbaAdjust: 0,
            form: null,
          },
    [chosen.length, date, seats],
  )
  usePublishLive(syncing ? livePayload : null, syncing)
  const available = (slotIdx: number) =>
    db.players.filter((p) => !seats.includes(p.id) || seats[slotIdx] === p.id)

  function begin(mode: Mode) {
    const playerIds = seats as string[]
    onStart({
      mode,
      date,
      note,
      playerIds,
      hands: [],
      finalPoints: Object.fromEntries(playerIds.map((pid) => [pid, db.rules.startPoints])),
    })
  }

  return (
    <div className="view">
      <div className="card">
        <h2>新しい半荘</h2>
        {db.players.length < 4 ? (
          <p className="muted">
            プレイヤーが4人未満です。「設定」タブでメンバーを登録してください。
          </p>
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

            <h3 className="sec">席順（起家＝東から）</h3>
            <div className="player-picker">
              {seats.map((sid, i) => (
                <div className="slot" key={i}>
                  <span className="wind">{WINDS[i]}</span>
                  <select
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
              「最終点だけ」＝従来どおり終局の持ち点だけ入力。
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/* ---------- かんたん入力（最終点のみ） ---------- */
function QuickView({
  db,
  draft,
  onSave,
  onCancel,
}: {
  db: DB
  draft: Draft
  onSave: SaveFn
  onCancel: () => void
}) {
  const [pts, setPts] = useState<Record<string, string | number>>(() => ({ ...draft.finalPoints }))
  const name: NameFn = (pid) => db.players.find((p) => p.id === pid)?.name ?? '?'

  const game = draftToGame(draft, [], numify(pts))
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
                value={pts[pid] ?? ''}
                onChange={(e) => setPts((s) => ({ ...s, [pid]: e.target.value }))}
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
          <button className="btn primary" onClick={() => onSave(game)}>
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
  draft,
  setDraft,
  onSave,
  onCancel,
  syncing,
}: {
  db: DB
  draft: Draft
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>
  onSave: SaveFn
  onCancel: () => void
  syncing: boolean
}) {
  const rules = db.rules
  const name: NameFn = (pid) => db.players.find((p) => p.id === pid)?.name ?? '?'
  const gameForReplay: Game = { ...draft, id: 'draft' }
  const { state } = useMemo(() => replay({ ...draft, id: 'draft' }, rules), [draft, rules])
  const [finishing, setFinishing] = useState(false)
  const [honbaAdjust, setHonbaAdjust] = useState(0)
  const effectiveHonba = Math.max(0, state.honba + honbaAdjust)

  // 入力中の1局（HandForm の現在の選択）を実況に載せるため、上流で保持する。
  const [formSnap, setFormSnap] = useState<LiveForm | null>(null)
  const onFormChange = useCallback((f: LiveForm) => setFormSnap(f), [])

  // 他端末に映すための実況ペイロード。中身が変わったときだけ作り直す。
  const livePayload = useMemo<LiveInput>(
    () => ({
      editor: deviceId(),
      phase: 'playing',
      date: draft.date,
      seats: draft.playerIds,
      hands: draft.hands,
      honbaAdjust,
      form: finishing ? null : formSnap,
    }),
    [draft.date, draft.playerIds, draft.hands, honbaAdjust, formSnap, finishing],
  )
  usePublishLive(syncing ? livePayload : null, syncing)

  function addHand(hand: Hand) {
    const withOverride = honbaAdjust !== 0 ? { ...hand, honbaOverride: effectiveHonba } : hand
    setDraft((d) => (d ? { ...d, hands: [...d.hands, withOverride] } : d))
    setHonbaAdjust(0)
  }
  function undo() {
    setDraft((d) => (d ? { ...d, hands: d.hands.slice(0, -1) } : d))
  }

  const dealerId = draft.playerIds[state.dealerIndex] ?? ''

  if (finishing) {
    const game = draftToGame(draft, draft.hands, { ...state.points })
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
            <button className="btn primary" onClick={() => onSave(game)}>
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

  return (
    <div className="view">
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
            onClick={() => setHonbaAdjust((n) => n - 1)}
          >
            −1
          </button>
          <button className="btn sm ghost" onClick={() => setHonbaAdjust((n) => n + 1)}>
            +1
          </button>
          {honbaAdjust !== 0 && (
            <button className="btn sm ghost" onClick={() => setHonbaAdjust(0)}>
              元に戻す
            </button>
          )}
        </div>
        <div className="scoreboard" style={{ marginTop: 10 }}>
          {draft.playerIds.map((pid, i) => (
            <div className={`p ${pid === dealerId ? 'dealer' : ''}`} key={pid}>
              <div className="nm">
                {WINDS[i]} {name(pid)}
              </div>
              <div className={`pt ${(state.points[pid] ?? 0) < 0 ? 'neg' : ''}`}>
                {(state.points[pid] ?? 0).toLocaleString()}
              </div>
              {pid === dealerId && <div className="badge">親</div>}
            </div>
          ))}
        </div>

        <HandForm
          db={db}
          playerIds={draft.playerIds}
          dealerId={dealerId}
          onAdd={addHand}
          onChange={onFormChange}
        />
      </div>

      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>局ログ（{draft.hands.length}）</h2>
          <span className="spacer" />
          <button className="btn sm ghost" disabled={!draft.hands.length} onClick={undo}>
            1局戻す
          </button>
        </div>
        {draft.hands.length === 0 ? (
          <p className="muted">まだ局がありません。上のフォームから追加してください。</p>
        ) : (
          <HandLog game={gameForReplay} rules={rules} name={name} />
        )}
      </div>

      <div className="row">
        <button className="btn primary" onClick={() => setFinishing(true)}>
          半荘を終了
        </button>
        <button className="btn ghost" onClick={onCancel}>
          破棄
        </button>
      </div>
    </div>
  )
}

function HandForm({
  db,
  playerIds,
  dealerId,
  onAdd,
  onChange,
}: {
  db: DB
  playerIds: string[]
  dealerId: string
  onAdd: (hand: Hand) => void
  /** 入力中の選択が変わるたびに呼ばれる（LAN同期の実況用）。表示専用なので副作用はない。 */
  onChange?: (form: LiveForm) => void
}) {
  const [type, setType] = useState<HandType>('ron')
  const [winners, setWinners] = useState<string[]>([])
  const [loser, setLoser] = useState('')
  const [scores, setScores] = useState<Record<string, { han: number; fu: number }>>({})
  const [riichi, setRiichi] = useState<string[]>([])
  const [tenpai, setTenpai] = useState<string[]>([])
  const name: NameFn = (pid) => db.players.find((p) => p.id === pid)?.name ?? '?'

  // 選択が変わるたびに、今の入力内容を上流へ知らせる（他端末の入力中プレビュー用）。
  useEffect(() => {
    onChange?.({ type, winners, loser, scores, riichi, tenpai })
  }, [type, winners, loser, scores, riichi, tenpai, onChange])

  function toggle(list: string[], setList: (v: string[]) => void, pid: string) {
    setList(list.includes(pid) ? list.filter((x) => x !== pid) : [...list, pid])
  }
  function changeType(t: HandType) {
    setType(t)
    setWinners([])
    setLoser('')
    setScores({})
  }
  function toggleWinner(pid: string) {
    if (type === 'tsumo') {
      setWinners((w) => (w[0] === pid ? [] : [pid]))
      return
    }
    setWinners((w) => (w.includes(pid) ? w.filter((x) => x !== pid) : [...w, pid]))
    setScores((s) => (s[pid] ? s : { ...s, [pid]: { han: 3, fu: 30 } }))
    setLoser((l) => (l === pid ? '' : l))
  }
  function toggleLoser(pid: string) {
    setLoser((l) => (l === pid ? '' : pid))
    setWinners((w) => w.filter((x) => x !== pid))
  }
  function reset() {
    setWinners([])
    setLoser('')
    setScores({})
    setRiichi([])
    setTenpai([])
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
      onAdd({ id, type, wins, loser, riichi })
    } else if (type === 'tsumo') {
      const w = winners[0]
      if (!w) return
      const { han, fu } = scores[w] ?? { han: 3, fu: 30 }
      onAdd({ id, type, winner: w, han, fu, riichi })
    } else if (type === 'draw') {
      onAdd({ id, type, tenpai, riichi })
    } else {
      onAdd({ id, type: 'abortive', riichi })
    }
    reset()
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
          <button key={v} className={type === v ? 'active' : ''} onClick={() => changeType(v)}>
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
                  className={`pill ${winners.includes(pid) ? 'on' : ''}`}
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
                    className={`pill ${loser === pid ? 'on' : ''}`}
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
              onChange={(han, fu) => setScores((s) => ({ ...s, [pid]: { han, fu } }))}
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
                className={`pill ${tenpai.includes(pid) ? 'on' : ''}`}
                onClick={() => toggle(tenpai, setTenpai, pid)}
              >
                {name(pid)}
              </button>
            ))}
          </div>
        </div>
      )}

      {type !== 'abortive' && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ marginBottom: 6 }}>
            立直した人
          </div>
          <div className="pick-row">
            {playerIds.map((pid) => (
              <button
                key={pid}
                className={`pill ${riichi.includes(pid) ? 'on' : ''}`}
                onClick={() => toggle(riichi, setRiichi, pid)}
              >
                {name(pid)}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        className="btn primary"
        style={{ marginTop: 14, width: '100%' }}
        disabled={!canSubmit}
        onClick={submit}
      >
        この局を追加
      </button>
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
                      className={`score-cell ${value.han === c.han && value.fu === c.fu ? 'on' : ''}`}
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
      <div className="row wrap" style={{ marginTop: 8 }}>
        {mangans.map((m) => (
          <button
            key={m.han}
            className={`pill ${value.han === m.han ? 'on' : ''}`}
            onClick={() => onChange(m.han, m.fu)}
          >
            {m.total.toLocaleString()}（{hanLabel(m.han)}）
          </button>
        ))}
      </div>
    </div>
  )
}

function HandLog({ game, rules, name }: { game: Game; rules: Rules; name: NameFn }) {
  const { steps } = replay(game, rules)
  return (
    <div className="hand-list">
      {steps.map((s, i) => (
        <div className="hand-row" key={s.hand.id || i}>
          <div className="hand-row-head">
            <span className="muted" style={{ minWidth: 62 }}>
              {s.label}
            </span>
            {handTag(s.hand)}
          </div>
          <DeltaChips playerIds={game.playerIds} name={name} delta={s.delta} />
        </div>
      ))}
    </div>
  )
}

function handTag(h: Hand) {
  if (h.type === 'ron') return <span className="tag win">ロン</span>
  if (h.type === 'tsumo') return <span className="tag win">ツモ</span>
  if (h.type === 'draw') return <span className="tag draw">流局</span>
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
