import { useRef, useState } from 'react'
import { exportJSON, defaultDB } from '../lib/store'
import { statsToCSV, gamesToCSV } from '../lib/csv'
import type { DB } from '../lib/domain'
import type { Api } from '../App'

export default function SettingsView({ db, api }: { db: DB; api: Api }) {
  const [newName, setNewName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  /** テキストをファイルとしてダウンロードさせる。 */
  function saveFile(text: string, filename: string, mime: string) {
    const blob = new Blob([text], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const today = () => new Date().toISOString().slice(0, 10)

  function downloadJSON() {
    saveFile(exportJSON(db), `mahjong-${today()}.json`, 'application/json')
  }

  // CSV は Excel が UTF-8 と判別できるよう先頭に BOM を付ける（日本語の文字化け対策）。
  function downloadCSV(text: string, name: string) {
    const bom = String.fromCharCode(0xfeff)
    saveFile(bom + text, `mahjong-${name}-${today()}.csv`, 'text/csv;charset=utf-8')
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
        <h3 className="sec">バックアップ（JSON）</h3>
        <div className="row wrap">
          <button className="btn" onClick={downloadJSON}>
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
          データはこの端末のブラウザ内（localStorage）にのみ保存されます。別端末への移動や復元は、
          この JSON の書き出し／読み込みで（局ログまで含めて完全に往復できます）。
        </p>

        <h3 className="sec" style={{ marginTop: 14 }}>
          表計算用に書き出し（CSV）
        </h3>
        <div className="row wrap">
          <button className="btn" onClick={() => downloadCSV(statsToCSV(db), 'stats')}>
            成績をCSVで書き出し
          </button>
          <button className="btn" onClick={() => downloadCSV(gamesToCSV(db), 'games')}>
            半荘結果をCSVで書き出し
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Excel やスプレッドシートで開いて見る・分析するための書き出しです（読み込みは JSON
          のみ）。半荘結果は「1半荘×1人＝1行」で出るので、そのまま並べ替え・集計できます。
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
        </div>
      </div>

      <p className="muted" style={{ textAlign: 'center', marginTop: 8 }}>
        スコア計算は namimori 氏の麻雀集計スプレッドシートのルールに準拠。
      </p>
    </div>
  )
}
