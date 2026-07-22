import { useRef, useState } from 'react'
import { exportJSON, defaultDB, emptyDB } from '../lib/store'
import type { DB } from '../lib/domain'
import type { Api } from '../App'

export default function SettingsView({ db, api }: { db: DB; api: Api }) {
  const [newName, setNewName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function download() {
    const blob = new Blob([exportJSON(db)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mahjong-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const input = e.target
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const next = JSON.parse(String(reader.result))
        if (confirm('現在のデータを読み込んだ内容で置き換えます。よろしいですか？')) {
          api.replaceDB(next)
        }
      } catch {
        alert('JSONの読み込みに失敗しました。')
      }
      input.value = ''
    }
    reader.readAsText(file)
  }

  const usedPlayerIds = new Set(db.games.flatMap((g) => g.playerIds))

  return (
    <div className="view">
      {/* プレイヤー */}
      <div className="card">
        <h2>プレイヤー</h2>
        <div className="stack">
          {db.players.map((p) => (
            <div className="row" key={p.id}>
              <input value={p.name} onChange={(e) => api.renamePlayer(p.id, e.target.value)} />
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
            placeholder="新しいメンバー名"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                api.addPlayer(newName)
                setNewName('')
              }
            }}
          />
          <button
            className="btn"
            onClick={() => {
              api.addPlayer(newName)
              setNewName('')
            }}
          >
            追加
          </button>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          対局記録のあるメンバーは、記録が壊れないよう削除できません。
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
              value={db.rules.startPoints}
              onChange={(e) => api.updateRules({ startPoints: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="field">
            返し点（原点）
            <input
              type="number"
              value={db.rules.returnPoints}
              onChange={(e) => api.updateRules({ returnPoints: Number(e.target.value) || 0 })}
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
                value={db.rules.uma[i]}
                onChange={(e) => {
                  const uma = [...db.rules.uma] as DB['rules']['uma']
                  uma[i] = Number(e.target.value) || 0
                  api.updateRules({ uma })
                }}
              />
            </label>
          ))}
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
          <button className="btn" onClick={() => fileRef.current?.click()}>
            JSONを読み込み
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={onImport}
          />
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          データはこの端末のブラウザ内（localStorage）にのみ保存されます。バックアップや別端末への移動は
          書き出し／読み込みで。
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <button
            className="btn danger"
            onClick={() => {
              if (
                confirm(
                  'すべてのデータを消して初期状態（過去9試合入り）に戻します。よろしいですか？',
                )
              ) {
                api.replaceDB(defaultDB())
              }
            }}
          >
            初期化
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (
                confirm(
                  'プレイヤー・対局データをすべて消去し、完全に空の状態にします。元に戻せません。よろしいですか？',
                )
              ) {
                api.replaceDB(emptyDB())
              }
            }}
          >
            全て消去
          </button>
        </div>
      </div>

      <p className="muted" style={{ textAlign: 'center', marginTop: 8 }}>
        スコア計算は namimori 氏の麻雀集計スプレッドシートのルールに準拠。
      </p>
    </div>
  )
}
