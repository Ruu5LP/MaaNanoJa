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

/**
 * 点数の手動修正（入力ミス等で実際の持ち点とアプリの計算がズレたときに補正する）。
 * 親・本場・場風などの進行状況は変えず、点数だけを動かす。
 */
export interface AdjustHand extends HandBase {
  type: 'adjust'
  /** playerId -> 増減点（合計0とは限らない） */
  delta: Record<string, number>
}

export type Hand = RonHand | TsumoHand | DrawHand | AbortiveHand | AdjustHand

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
  /** この対局を記録した時点のルール。旧データでは省略され、呼び出し側のルールを使う。 */
  rules?: Rules
  createdAt?: number
}

/**
 * 入力中の1局（まだ「この局を追加」していない未確定の選択）。
 * **これも draft に載せて全端末で共有する**ので、和了者を選んだら他端末でも点数早見表が出る等、
 * 「今まさに打っている1局」の画面が全端末で揃う。「この局を追加」で hands に確定して null に戻る。
 */
export interface HandFormState {
  type: HandType
  /** 和了者（ロンは複数=ダブロン、ツモは1人）。 */
  winners: string[]
  /** 放銃者（ロンのみ）。 */
  loser: string
  /** 和了者ごとの翻・符。 */
  scores: Record<string, { han: number; fu: number }>
  /** 立直した人。 */
  riichi: string[]
  /** テンパイ者（流局のみ）。 */
  tenpai: string[]
}

/**
 * 進行中の半荘（まだ保存していない）。
 * **DB に持たせて全端末で共有する**ので、PC・スマホどの端末からでも同じ対局に入力できる。
 * 「半荘を終了→保存」すると Game になって games に移り、draft は null に戻る。
 */
export interface Draft {
  /** 'live' = 局ログを1局ずつ入力 / 'quick' = 最終持ち点だけ入力 */
  mode: 'live' | 'quick'
  /** YYYY-MM-DD */
  date: string
  note: string
  /** 席順（起家＝index0, 東南西北）。長さ4。 */
  playerIds: string[]
  /** これまでに確定した局。 */
  hands: Hand[]
  /** この半荘を開始した時点のルール。旧draftでは省略され、現在のルールを使う。 */
  rules?: Rules
  /** quick モードの最終持ち点（playerId -> 点数）。live モードでは未使用。 */
  finalPoints: Record<string, number>
  /** 入力中の1局（未確定）。全端末で共有して同じ入力画面を映す。未入力なら null。 */
  form: HandFormState | null
  /** 積み棒の手動修正（±）。全端末で共有。局を追加すると0に戻る。省略時は0。 */
  honbaAdjust?: number
  /** quick モードの入力中の点数（文字列＝負号や入力途中も保持）。全端末で共有。 */
  quickPoints?: Record<string, string>
  /**
   * 点数修正パネルの入力中の値（playerId -> 文字列）。全端末で共有。
   * パネルを開いていないときは undefined。「反映」で `adjust` 型の局として hands に追加する。
   */
  pointsEdit?: Record<string, string>
  /**
   * 局ログから選んで編集中の局のインデックス（hands の添字）。全端末で共有。
   * 選んでいないときは undefined。選ぶと `form` にその局の内容を入れて編集フォームを開く。
   */
  editingIndex?: number
}

/** DB全体（Cloudflareルームで共有する単位） */
export interface DB {
  version: number
  players: Player[]
  rules: Rules
  games: Game[]
  /** 進行中の半荘（全端末で共有）。無ければ null。 */
  draft: Draft | null
}
