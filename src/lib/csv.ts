// 成績・半荘結果を CSV 文字列に書き出す（純粋関数・副作用なし・ブラウザ非依存）。
// 用途は「表計算で見る／分析する」ための書き出し専用。
// 完全なバックアップ／復元は JSON（store.ts）を使う。局ログの入れ子は表に収まらないため、
// CSV は読み込み（復元）には使わない。
import { computeStats } from './stats'
import { gameResults, WINDS } from './game'
import type { DB } from './domain'

/** CSV 1セルのエスケープ。カンマ・引用符・改行を含む値だけ二重引用符で囲む。 */
export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

/** 行の配列を CSV テキストにする（改行は Excel 互換の CRLF）。 */
export function toCSV(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
}

/** 率(0..1) を「%表記の数値」に丸める（例: 0.5 → 50.0）。null は空セル。 */
function pctNum(x: number | null): number | null {
  return x == null ? null : Math.round(x * 1000) / 10
}

/**
 * 成績サマリーCSV（1行=1プレイヤー）。
 * 列は成績画面の「順位・スコア」表と「局データ」表を横に並べたもの。
 */
export function statsToCSV(db: DB): string {
  const header = [
    'プレイヤー',
    '戦数',
    '合計スコア',
    '平均スコア',
    '平均順位',
    '1位',
    '2位',
    '3位',
    '4位',
    'トップ率(%)',
    '連対率(%)',
    'ラス率(%)',
    'トビ率(%)',
    '平均素点',
    '局数',
    '和了率(%)',
    '放銃率(%)',
    '立直率(%)',
    'ツモ率(%)',
    '平均和了',
    '平均放銃',
    'テンパイ率(%)',
  ]
  const rows = computeStats(db).map((s) => [
    s.name,
    s.games,
    s.totalScore,
    s.avgScore,
    s.avgRank,
    s.rankCounts[0],
    s.rankCounts[1],
    s.rankCounts[2],
    s.rankCounts[3],
    pctNum(s.topRate),
    pctNum(s.rentaiRate),
    pctNum(s.lastRate),
    pctNum(s.tobiRate),
    s.avgRaw,
    s.handsPlayed || null,
    pctNum(s.agariRate),
    pctNum(s.houjuRate),
    pctNum(s.riichiRate),
    pctNum(s.tsumoRate),
    s.avgAgari,
    s.avgHouju,
    pctNum(s.tenpaiRate),
  ])
  return toCSV([header, ...rows])
}

/**
 * 半荘結果CSV（1行=1半荘×1プレイヤー、いわゆるロング形式）。
 * 表計算で並べ替え・集計しやすいように、半荘ごとに順位順で1人1行ずつ出す。
 */
export function gamesToCSV(db: DB): string {
  const nameById = new Map(db.players.map((p) => [p.id, p.name]))
  const header = ['半荘', '日付', 'メモ', '席', 'プレイヤー', '最終持ち点', '順位', 'スコア']
  const rows: (string | number | null)[][] = []
  db.games.forEach((game, i) => {
    for (const r of gameResults(game, db.rules)) {
      rows.push([
        i + 1,
        game.date,
        game.note,
        WINDS[r.seatIndex] ?? '',
        nameById.get(r.playerId) ?? '(削除されたメンバー)',
        r.points,
        r.rank,
        r.score,
      ])
    }
  })
  return toCSV([header, ...rows])
}
