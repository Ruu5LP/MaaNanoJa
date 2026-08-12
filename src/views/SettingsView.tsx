import { useEffect, useState } from 'react'
import { exportJSON } from '../lib/store'
import { parseDB } from '../lib/room-validation'
import type { DB } from '../lib/domain'
import type { Api } from '../App'

interface SettingsViewProps {
  db: DB
  api: Api
  onRestore?(db: DB): Promise<void>
  guestMode?: boolean
}

interface RuleForm {
  startPoints: string
  returnPoints: string
  uma: [string, string, string, string]
}

function formFromRules(rules: DB['rules']): RuleForm {
  return {
    startPoints: String(rules.startPoints),
    returnPoints: String(rules.returnPoints),
    uma: rules.uma.map(String) as RuleForm['uma'],
  }
}

export default function SettingsView({ db, api, onRestore, guestMode = false }: SettingsViewProps) {
  const [newName, setNewName] = useState('')
  const [nameError, setNameError] = useState('')
  const [ruleForm, setRuleForm] = useState<RuleForm>(() => formFromRules(db.rules))
  const [rulesError, setRulesError] = useState('')
  const [rulesDirty, setRulesDirty] = useState(false)
  const [restoreError, setRestoreError] = useState('')
  const [restoreBusy, setRestoreBusy] = useState(false)

  useEffect(() => {
    setRuleForm(formFromRules(db.rules))
    setRulesDirty(false)
    setRulesError('')
  }, [db.rules])

  function addPlayer() {
    const name = newName.trim()
    if (!name) {
      setNameError('プレイヤー名を入力してください')
      return
    }
    if (name.length > 120) {
      setNameError('プレイヤー名は120文字以内で入力してください')
      return
    }
    if (db.players.length >= 4) {
      setNameError('プレイヤーは最大4人までです')
      return
    }
    if (db.players.some((player) => player.name.trim() === name)) {
      setNameError('同じ名前のプレイヤーがすでに登録されています')
      return
    }
    api.addPlayer(name)
    setNewName('')
    setNameError('')
  }

  function renamePlayer(id: string, name: string): boolean {
    if (!name || name.length > 120) {
      setNameError('プレイヤー名は1〜120文字で入力してください')
      return false
    }
    if (db.players.some((player) => player.id !== id && player.name.trim() === name)) {
      setNameError('同じ名前のプレイヤーがすでに登録されています')
      return false
    }
    api.renamePlayer(id, name)
    setNameError('')
    return true
  }

  function download() {
    const blob = new Blob([exportJSON(db)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mahjong-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function updateRuleField(field: keyof RuleForm, value: string): void {
    setRulesDirty(true)
    setRulesError('')
    setRuleForm((current) => ({ ...current, [field]: value }))
  }

  function updateUma(index: number, value: string): void {
    setRulesDirty(true)
    setRulesError('')
    setRuleForm((current) => {
      const uma = [...current.uma] as RuleForm['uma']
      uma[index] = value
      return { ...current, uma }
    })
  }

  function saveRules() {
    const startPoints = Number(ruleForm.startPoints)
    const returnPoints = Number(ruleForm.returnPoints)
    const uma = ruleForm.uma.map(Number)
    if (
      !Number.isSafeInteger(startPoints) ||
      startPoints <= 0 ||
      !Number.isSafeInteger(returnPoints) ||
      returnPoints <= 0 ||
      uma.some((value) => !Number.isSafeInteger(value))
    ) {
      setRulesError('ルールは整数で入力してください。空欄や小数は保存できません')
      return
    }
    api.updateRules({
      startPoints,
      returnPoints,
      uma: uma as DB['rules']['uma'],
      tiebreak: db.rules.tiebreak,
    })
    setRulesDirty(false)
    setRulesError('')
  }

  function cancelRules() {
    setRuleForm(formFromRules(db.rules))
    setRulesDirty(false)
    setRulesError('')
  }

  async function restore(file: File): Promise<void> {
    setRestoreBusy(true)
    setRestoreError('')
    try {
      const imported = parseDB(JSON.parse(await file.text()))
      if (!onRestore) throw new Error('復元機能が利用できません')
      await onRestore(imported)
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : 'JSONを復元できませんでした')
    } finally {
      setRestoreBusy(false)
    }
  }

  const usedPlayerIds = new Set([
    ...db.games.flatMap((g) => g.playerIds),
    ...(db.draft?.playerIds ?? []),
  ])

  return (
    <div className="view">
      {/* プレイヤー */}
      <div className="card">
        <h2>プレイヤー</h2>
        <div className="stack">
          {db.players.map((p, index) => (
            <div className="row" key={p.id}>
              <PlayerNameEditor
                name={p.name}
                label={`プレイヤー${index + 1}の名前`}
                onCommit={(name) => renamePlayer(p.id, name)}
              />
              <button
                className="btn sm danger"
                disabled={usedPlayerIds.has(p.id)}
                title={usedPlayerIds.has(p.id) ? '対局記録があるため削除できません' : ''}
                onClick={() => api.removePlayer(p.id)}
              >
                削除
              </button>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <input
            value={newName}
            maxLength={120}
            placeholder="新しいメンバー名"
            aria-label="新しいメンバー名"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addPlayer()
            }}
          />
          <button className="btn" disabled={db.players.length >= 4} onClick={addPlayer}>
            追加
          </button>
        </div>
        {nameError && <p className="error-text">{nameError}</p>}
        <p className="muted" style={{ marginTop: 6 }}>
          最大4人。対局記録または進行中の半荘に関係するメンバーは、記録が壊れないよう削除できません。
        </p>
      </div>

      {/* ルール */}
      <div className="card">
        <h2>ルール</h2>
        <div className="grid2">
          <label className="field">
            配給原点（持ち点）
            <input
              type="number"
              min={1}
              step={1}
              value={ruleForm.startPoints}
              onChange={(e) => updateRuleField('startPoints', e.target.value)}
            />
          </label>
          <label className="field">
            返し点（原点）
            <input
              type="number"
              min={1}
              step={1}
              value={ruleForm.returnPoints}
              onChange={(e) => updateRuleField('returnPoints', e.target.value)}
            />
          </label>
        </div>
        <h3 className="sec" style={{ marginTop: 12 }}>
          順位ウマ
        </h3>
        <div className="grid2">
          {['1位', '2位', '3位', '4位'].map((lbl, i) => (
            <label className="field" key={i}>
              {lbl}
              <input
                type="number"
                step={1}
                value={ruleForm.uma[i]}
                onChange={(e) => updateUma(i, e.target.value)}
              />
            </label>
          ))}
        </div>
        {rulesError && (
          <p className="error-text" role="alert">
            {rulesError}
          </p>
        )}
        <div className="row wrap" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={!rulesDirty} onClick={saveRules}>
            ルールを保存
          </button>
          <button className="btn ghost" disabled={!rulesDirty} onClick={cancelRules}>
            変更を取り消す
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          オカは（返し点 − 持ち点）× 人数 を1位に自動加算。同点は上家（起家に近い方）優先。
          現在の設定: {db.rules.startPoints.toLocaleString()}点持ち /{' '}
          {db.rules.returnPoints.toLocaleString()}
          点返し / ウマ {db.rules.uma.join(', ')}。
        </p>
      </div>

      {/* データ */}
      <div className="card">
        <h2>データ</h2>
        <div className="row wrap">
          <button className="btn" onClick={download}>
            JSONで書き出し
          </button>
          <label className={`btn ghost${restoreBusy ? ' disabled' : ''}`}>
            {restoreBusy
              ? '復元中…'
              : guestMode
                ? 'ログインして共有ルームに保存'
                : 'JSONから新しいルームを作る'}
            <input
              type="file"
              accept="application/json,.json"
              hidden
              disabled={restoreBusy || !onRestore}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.currentTarget.value = ''
                if (file) void restore(file)
              }}
            />
          </label>
        </div>
        {restoreError && (
          <p className="error-text" role="alert">
            {restoreError}
          </p>
        )}
        <p className="muted" style={{ marginTop: 8 }}>
          {guestMode
            ? 'ゲストで入力した内容は、このタブに一時保存されています。JSONの書き出しはできます。Googleログイン後に、共有ルームとして保存できます。'
            : '対局データは共有ルームに保存されます。JSONはバックアップとして書き出せます。復元すると、現在のルームを変更せずにJSONの内容で新しい共有ルームを作成します。'}
        </p>
      </div>

      <p className="muted" style={{ textAlign: 'center', marginTop: 8 }}>
        スコア計算は namimori 氏の麻雀集計スプレッドシートのルールに準拠。
      </p>
    </div>
  )
}

function PlayerNameEditor({
  name,
  label,
  onCommit,
}: {
  name: string
  label: string
  onCommit: (name: string) => boolean
}) {
  const [value, setValue] = useState(name)

  useEffect(() => setValue(name), [name])

  function commit() {
    const next = value.trim()
    if (!next) {
      setValue(name)
      return
    }
    if (next !== name && !onCommit(next)) setValue(name)
  }

  return (
    <input
      value={value}
      aria-label={label}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}
