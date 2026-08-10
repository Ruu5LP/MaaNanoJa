import { useState } from 'react'
import { exportJSON } from '../lib/store'
import type { DB } from '../lib/domain'
import type { Api } from '../App'

export default function SettingsView({ db, api }: { db: DB; api: Api }) {
  const [newName, setNewName] = useState('')

  function download() {
    const blob = new Blob([exportJSON(db)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mahjong-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
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
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          対局データはCloudflareの共有ルームに保存されます。JSONはバックアップとして書き出せます。
          JSONからの復元は、クラウド履歴との整合性を確認できる移行導線で対応します。
        </p>
      </div>

      <p className="muted" style={{ textAlign: 'center', marginTop: 8 }}>
        スコア計算は namimori 氏の麻雀集計スプレッドシートのルールに準拠。
      </p>
    </div>
  )
}
