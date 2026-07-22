// ドメインモデルの型定義。
// ここが「仕様」の中心。データ構造の意味と不変条件はこの型を読めば分かる。
// 特に Hand は判別可能ユニオンにして、「ロンには放銃者がいる」「流局にはテンパイ者がいる」
// といった制約を型で強制している（不正な組み合わせはコンパイルが通らない）。

/** プレイヤー（登録メンバー） */
export interface Player {
  id: string
  name: string
}

/** 4人分の並びを表すタプル（席順や順位の固定長を型で表す） */
export type Quad<T> = [T, T, T, T]

/** ルール設定。スコア計算の全パラメータ。 */
export interface Rules {
  /** 配給原点（持ち点） */
  startPoints: number
  /** 返し点（原点） */
  returnPoints: number
  /** 順位ウマ。1位→4位の順。オカは (returnPoints - startPoints) * 人数 を1位に自動加算。 */
  uma: Quad<number>
  /** 同点の扱い。'shimocha' = 上家（起家に近い方）優先。 */
  tiebreak: 'shimocha'
}

export type HandType = 'ron' | 'tsumo' | 'draw' | 'abortive'

interface HandBase {
  id: string
  /** この局で立直した人のID */
  riichi: string[]
  /** 本場（積み棒）の手動修正。指定時は自動計算の値を上書きしてこの局を計算する。 */
  honbaOverride?: number
}

/** ロンした人1人分の和了内容（ダブロン・トリプルロンでは複数人分になる） */
export interface RonWin {
  winner: string
  han: number
  fu: number
}

/** ロン和了（複数人が同時にロンする＝ダブロン・トリプルロンにも対応） */
export interface RonHand extends HandBase {
  type: 'ron'
  wins: RonWin[]
  loser: string
}

/** ツモ和了 */
export interface TsumoHand extends HandBase {
  type: 'tsumo'
  winner: string
  han: number
  fu: number
}

/** 流局（テンパイ/ノーテンの点数移動あり） */
export interface DrawHand extends HandBase {
  type: 'draw'
  /** テンパイ者のID */
  tenpai: string[]
}

/** 途中流局（点数移動なし・供託据え置き・連荘） */
export interface AbortiveHand extends HandBase {
  type: 'abortive'
}

export type Hand = RonHand | TsumoHand | DrawHand | AbortiveHand

/** 和了（ロン/ツモ）のみを指す絞り込み型 */
export type WinningHand = RonHand | TsumoHand

/** 半荘（1ゲーム） */
export interface Game {
  id: string
  /** YYYY-MM-DD（未設定なら空文字） */
  date: string
  note: string
  /** 席順（起家＝index0, 東南西北）。長さ4を想定。 */
  playerIds: string[]
  /** 局ログ。空なら finalPoints を最終持ち点として使う。 */
  hands: Hand[]
  /** 局ログが無いとき（かんたん入力）の最終持ち点。playerId -> 点数。 */
  finalPoints: Record<string, number>
  createdAt?: number
}

/** DB全体（localStorageに保存する単位） */
export interface DB {
  version: number
  players: Player[]
  rules: Rules
  games: Game[]
}
