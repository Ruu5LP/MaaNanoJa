import { useMemo, useState } from 'react'
import { WINDS, initialState, replay, roundLabel, gameResults, pointsCheck } from '../lib/game.js'
import { uid } from '../lib/store.js'

const HAN_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
const FU_OPTIONS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110]

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function RecordView({ db, api, onDone }) {
  const [draft, setDraft] = useState(null)

  if (!draft) return <SetupView db={db} onStart={setDraft} />
  if (draft.mode === 'quick')
    return (
      <QuickView
        db={db}
        draft={draft}
        setDraft={setDraft}
        onSave={(game) => {
          api.addGame(game)
          setDraft(null)
          onDone()
        }}
        onCancel={() => setDraft(null)}
      />
    )
  return (
    <LiveView
      db={db}
      draft={draft}
      setDraft={setDraft}
      onSave={(game) => {
        api.addGame(game)
        setDraft(null)
        onDone()
      }}
      onCancel={() => setDraft(null)}
    />
  )
}

/* ---------- セットアップ ---------- */
function SetupView({ db, onStart }) {
  const [seats, setSeats] = useState([null, null, null, null])
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')

  const chosen = seats.filter(Boolean)
  const ready = chosen.length === 4 && new Set(chosen).size === 4
  const available = (slotIdx) =>
    db.players.filter((p) => !seats.includes(p.id) || seats[slotIdx] === p.id)

  function begin(mode) {
    onStart({
      mode,
      date,
      note,
      playerIds: seats,
      hands: [],
      finalPoints: Object.fromEntries(seats.map((pid) => [pid, db.rules.startPoints])),
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
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: 7月定例" />
              </label>
            </div>

            <h3 className="sec">席順（起家＝東から）</h3>
            <div className="player-picker">
              {seats.map((sid, i) => (
                <div className="slot" key={i}>
                  <span className="wind">{WINDS[i]}</span>
                  <select
                    value={sid || ''}
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
function QuickView({ db, draft, onSave, onCancel }) {
  const [pts, setPts] = useState(() => ({ ...draft.finalPoints }))
  const name = (pid) => db.players.find((p) => p.id === pid)?.name || '?'

  const game = { ...draft, hands: [], finalPoints: numify(pts) }
  const check = pointsCheck(game, db.rules)
  const results = check.ok || true ? safeResults(game, db.rules) : []

  return (
    <div className="view">
      <div className="card">
        <h2>{draft.date} 最終持ち点</h2>
        <div className="stack">
          {draft.playerIds.map((pid, i) => (
            <label className="field" key={pid}>
              <span>
                <b className="wind" style={{ color: 'var(--accent)' }}>{WINDS[i]}</b> {name(pid)}
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
function LiveView({ db, draft, setDraft, onSave, onCancel }) {
  const rules = db.rules
  const name = (pid) => db.players.find((p) => p.id === pid)?.name || '?'
  const { state } = useMemo(() => replay(draft, rules), [draft, rules])
  const [finishing, setFinishing] = useState(false)

  function addHand(hand) {
    setDraft((d) => ({ ...d, hands: [...d.hands, { ...hand, id: uid() }] }))
  }
  function undo() {
    setDraft((d) => ({ ...d, hands: d.hands.slice(0, -1) }))
  }

  const dealerId = draft.playerIds[state.dealerIndex]
  const game = { ...draft, hands: draft.hands }

  if (finishing) {
    const results = gameResults(game, rules)
    const check = pointsCheck(game, rules)
    return (
      <div className="view">
        <div className="card">
          <h2>{roundLabelForEnd(draft, rules)} 終了・結果</h2>
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
          <h2 style={{ margin: 0 }}>{roundLabel(state)}</h2>
          <span className="spacer" />
          {state.pot > 0 && <span className="pill">供託 {state.pot}</span>}
        </div>
        <div className="scoreboard" style={{ marginTop: 10 }}>
          {draft.playerIds.map((pid, i) => (
            <div className={`p ${pid === dealerId ? 'dealer' : ''}`} key={pid}>
              <div className="nm">
                {WINDS[i]} {name(pid)}
              </div>
              <div className={`pt ${state.points[pid] < 0 ? 'neg' : ''}`}>
                {state.points[pid].toLocaleString()}
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
          <HandLog game={game} rules={rules} name={name} />
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

function HandForm({ db, playerIds, dealerId, onAdd }) {
  const [type, setType] = useState('ron')
  const [winner, setWinner] = useState('')
  const [loser, setLoser] = useState('')
  const [han, setHan] = useState(3)
  const [fu, setFu] = useState(30)
  const [riichi, setRiichi] = useState([])
  const [tenpai, setTenpai] = useState([])
  const name = (pid) => db.players.find((p) => p.id === pid)?.name || '?'

  function toggle(list, setList, pid) {
    setList(list.includes(pid) ? list.filter((x) => x !== pid) : [...list, pid])
  }
  function reset() {
    setWinner('')
    setLoser('')
    setHan(3)
    setFu(30)
    setRiichi([])
    setTenpai([])
  }
  function submit() {
    const base = { type, riichi }
    if (type === 'ron') {
      if (!winner || !loser || winner === loser) return
      onAdd({ ...base, winner, loser, han: Number(han), fu: Number(fu) })
    } else if (type === 'tsumo') {
      if (!winner) return
      onAdd({ ...base, winner, han: Number(han), fu: Number(fu) })
    } else if (type === 'draw') {
      onAdd({ ...base, tenpai })
    } else {
      onAdd({ ...base })
    }
    reset()
  }

  const needScore = type === 'ron' || type === 'tsumo'
  const canSubmit =
    (type === 'ron' && winner && loser && winner !== loser) ||
    (type === 'tsumo' && winner) ||
    type === 'draw' ||
    type === 'abortive'

  return (
    <div style={{ marginTop: 14 }}>
      <div className="seg-control" style={{ marginBottom: 10 }}>
        {[
          ['ron', 'ロン'],
          ['tsumo', 'ツモ'],
          ['draw', '流局'],
          ['abortive', '途中流局'],
        ].map(([v, l]) => (
          <button key={v} className={type === v ? 'active' : ''} onClick={() => setType(v)}>
            {l}
          </button>
        ))}
      </div>

      {needScore && (
        <div className="stack">
          <label className="field">
            和了者
            <select value={winner} onChange={(e) => setWinner(e.target.value)}>
              <option value="">— 選択 —</option>
              {playerIds.map((pid) => (
                <option key={pid} value={pid}>
                  {name(pid)} {pid === dealerId ? '（親）' : ''}
                </option>
              ))}
            </select>
          </label>
          {type === 'ron' && (
            <label className="field">
              放銃者
              <select value={loser} onChange={(e) => setLoser(e.target.value)}>
                <option value="">— 選択 —</option>
                {playerIds
                  .filter((pid) => pid !== winner)
                  .map((pid) => (
                    <option key={pid} value={pid}>
                      {name(pid)}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <div className="grid2">
            <label className="field">
              翻
              <select value={han} onChange={(e) => setHan(e.target.value)}>
                {HAN_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h}翻{h >= 13 ? '（役満）' : h >= 5 ? '' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              符{Number(han) >= 5 ? '（満貫以上は不問）' : ''}
              <select value={fu} onChange={(e) => setFu(e.target.value)} disabled={Number(han) >= 5}>
                {FU_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}符
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {type === 'draw' && (
        <div style={{ marginTop: 4 }}>
          <div className="muted" style={{ marginBottom: 6 }}>テンパイ者</div>
          <div className="row wrap">
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
          <div className="muted" style={{ marginBottom: 6 }}>立直した人</div>
          <div className="row wrap">
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

function HandLog({ game, rules, name }) {
  const { steps } = replay(game, rules)
  return (
    <div className="hand-list">
      {steps.map((s, i) => (
        <div className="hand-row" key={s.hand.id || i}>
          <span className="muted" style={{ minWidth: 62 }}>{s.label}</span>
          {renderHandSummary(s, name)}
        </div>
      ))}
    </div>
  )
}

function renderHandSummary(step, name) {
  const h = step.hand
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
        <span>テンパイ: {(h.tenpai || []).map(name).join('・') || 'なし'}</span>
      </>
    )
  return (
    <>
      <span className="tag draw">途中流局</span>
    </>
  )
}

function scoreText(h) {
  if (h.han >= 5) {
    const label = h.han >= 13 ? '役満' : h.han >= 11 ? '三倍満' : h.han >= 8 ? '倍満' : h.han >= 6 ? '跳満' : '満貫'
    return label
  }
  return `${h.han}翻${h.fu}符`
}

function ResultPreview({ results, name }) {
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

function roundLabelForEnd(draft, rules) {
  const { state } = replay(draft, rules)
  return roundLabel(state)
}

function numify(pts) {
  const out = {}
  for (const k of Object.keys(pts)) out[k] = Number(pts[k]) || 0
  return out
}

function safeResults(game, rules) {
  try {
    return gameResults(game, rules)
  } catch {
    return []
  }
}
