// LAN同期の「実況」チャンネルとの通信境界。
//
// remote.ts が確定データ（DB）の境界なのに対し、こちらは「今まさに入力中の半荘」を
// 他端末の画面へライブで映すための、消えていい一時状態（プレゼンス）の境界。
// 半荘は保存するまで DB に入らないので、進行中の半荘は他端末からは見えない。
// この実況チャンネルが、その「入力中の中身」だけを一時的に配って回る役目を持つ。
//
// サーバ側はメモリ上だけに持ち、db.json にもファイルにも残さない（実況が終われば消える）。
// 落ちても記録には一切影響しない best-effort な仕組み。
import type { Hand } from './domain'

/** 入力中の1局（未確定）のスナップショット。HandForm の状態をそのまま写したもの。 */
export interface LiveForm {
  type: Hand['type']
  winners: string[]
  loser: string
  scores: Record<string, { han: number; fu: number }>
  riichi: string[]
  tenpai: string[]
}

/** ある端末が「今この半荘を入力している」ことを表す実況ペイロード。 */
export interface LiveInput {
  /** 実況元の端末ID。自分の実況を自分の画面に映さないために使う。 */
  editor: string
  /** 段階。'setup'=席を選んでいる準備中 / 'playing'=局ログ入力中。 */
  phase: 'setup' | 'playing'
  /** 日付（YYYY-MM-DD）。 */
  date: string
  /** 席順（起家順, 長さ4）。準備中はまだ null（未選択）が混じりうる。 */
  seats: (string | null)[]
  /** これまでに確定した局。スコアボード再生用（まだ DB には入っていない）。準備中は空。 */
  hands: Hand[]
  /** 積み棒の手動修正ぶん。表示の本場を入力者と合わせる。 */
  honbaAdjust: number
  /** 今まさに入力中の1局。まだ何も無ければ null。 */
  form: LiveForm | null
}

/**
 * サーバが返す実況スナップショット。
 * ts/now はどちらも「サーバの時計」の値（同じ応答に同梱）。
 * 端末ごとの時計ズレに左右されず鮮度を測るため、両方サーバ由来にしている。
 */
export interface LiveSnapshot {
  /** 実況が無ければ null。 */
  live: LiveInput | null
  /** 実況が最後に更新された時刻（サーバ時計, ms）。 */
  ts: number
  /** サーバの現在時刻（ms）。 */
  now: number
}

const API = '/api/live'

/** これを超えて更新が途絶えた実況は「もう入力していない」とみなす閾値（ms）。 */
export const LIVE_STALE_MS = 6000

/**
 * 受け取った実況を、この端末が「入力中プレビュー」として映すべきか判定する（純粋関数）。
 * - 実況があり
 * - それが自分（この端末）の実況ではなく
 * - 古すぎない（入力者がやめた/離脱した実況は映さない）
 * とき true。鮮度はサーバ時計の ts と now の差で測る。
 */
export function shouldShowLive(snapshot: LiveSnapshot | null, myEditor: string): boolean {
  if (snapshot == null || snapshot.live == null) return false
  if (snapshot.live.editor === myEditor) return false
  return snapshot.now - snapshot.ts < LIVE_STALE_MS
}

/**
 * その実況に「観戦画面／バナーとして映すべき中身」があるか（純粋関数）。
 * - 準備中(setup): 席が1人でも埋まっていれば中身あり（誰も選んでいない空の準備中は映さない）。
 * - 対局中(playing): 席が4人そろっていれば中身あり（席が欠けた壊れた対局は映さない）。
 *
 * ねらい: 中身が無い実況で相手端末の画面を「入力を待っています…」に占領しない。
 * 受信側は shouldShowLive（鮮度・自分/他人）に加えて、これで「映す価値があるか」を判定する。
 */
export function hasLiveContent(live: LiveInput | null): boolean {
  if (live == null) return false
  const filled = live.seats.filter((s): s is string => Boolean(s)).length
  return live.phase === 'setup' ? filled >= 1 : filled === 4
}

/** 現在の実況を取得する。サーバが居ない/失敗したときは null。 */
export async function fetchLive(): Promise<LiveSnapshot | null> {
  try {
    const res = await fetch(API, { cache: 'no-store' })
    if (!res.ok) return null
    const json = (await res.json()) as { live?: unknown; ts?: unknown; now?: unknown }
    return {
      live: (json.live as LiveInput | null) ?? null,
      ts: typeof json.ts === 'number' ? json.ts : 0,
      now: typeof json.now === 'number' ? json.now : 0,
    }
  } catch {
    return null
  }
}

/** 実況を送る（null を送ると「入力終了」＝実況を消す）。失敗は握りつぶす。 */
export async function pushLive(live: LiveInput | null): Promise<void> {
  try {
    await fetch(API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ live }),
    })
  } catch {
    // 実況は落ちても記録には影響しない。黙って諦める。
  }
}
