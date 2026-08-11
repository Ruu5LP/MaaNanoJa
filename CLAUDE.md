# CLAUDE.md — 開発ガイド（エージェント/開発者の入口）

このリポジトリで作業する前にまず読む。**どこに・何を・どう書くか**と、守るべきルールをまとめてある。

> [!important] 受け入れ基準
> **次にこのコードを触るAIや人が、一番理解しやすく・壊しにくい状態か**を基準にする。賢い書き方より、読んで即わかり、型とテストが守ってくれる形を選ぶ。

## これは何か

麻雀のスコアと、放銃・流局・立直などの局データを記録して分析するWebアプリ。正式な保存先はCloudflare Workers + D1で、PC・スマホが同じルームURLから同じDBを扱う。

ルームURLがない場合はルーム作成・参加画面だけを表示する。通常のDB状態をlocalStorageや家庭内サーバーへ保存したり、接続失敗時にローカルへフォールバックしたりしない。旧版のlocalStorage履歴を読む処理は、移行期間だけの明示操作に限る。

振る舞いの仕様は [SPEC.md](./SPEC.md)、Cloudflare-first化の設計は [docs/cloudflare-first-spec.md](./docs/cloudflare-first-spec.md) を参照する。

## 技術スタック

- React 18 + Vite + **TypeScript（strict）**
- Cloudflare Workers + D1
- テスト: Vitest / Lint: ESLint(flat) / 整形: Prettier
- 依存は最小限。UIライブラリ・状態管理ライブラリ・CSSフレームワークは入れない（増やすときは理由を書く）。

## ディレクトリと責務

```
src/
  lib/          純粋ロジックと外部境界
    domain.ts     型定義 = 仕様の中心
    scoring.ts    スコア・点数計算（純粋関数）
    game.ts       半荘の進行・局ログの再生（純粋関数）
    stats.ts      成績集計（純粋関数）
    store.ts      初期状態・正規化・JSON境界。通常の保存はしない
    legacy-local-data.ts 旧localStorageを移行時だけ読む境界
    cloud-room.ts / cloud-room-api.ts Cloudflare API契約と通信
    *.test.ts     libのテスト（Vitest）
  views/        画面。表示とユーザー操作に専念
    BoardView.tsx は ?board=1 で開く全画面スコアボード
  App.tsx       状態(db)の保持と更新アクション(api)の集約
  BoardApp.tsx  モニター表示用の最小エントリ
  useRoomSync.ts Cloudflareルームのポーリング・更新フック
  main.tsx      ?board=1 ならBoardApp、それ以外はAppを描画
  styles.css    スタイル（CSS変数トークン）
worker/
  index.ts      Worker APIとD1アクセス
migrations/
  *.sql         D1 migration
```

### 設計ルール（必須）

- **ロジックは `lib/` に、純粋関数で書く。** `views/` に計算ロジックを持ち込まない。`lib/` の純粋ロジックはReactやDOMをimportしない。
- **状態は `App.tsx` の単一 `db` に集約し、更新は `api` 経由。** `views/` は `db`（読み）と `api`（書き）だけを受け取る。
- **D1を正式な保存先にする。** `localStorage`を直接触ってよいのは `legacy-local-data.ts` だけで、旧履歴の明示的な移行処理に限る。
- **型で縛る。** 外部入力は `unknown` として受け、境界で検証して絞る。`any` は原則禁止。
- **スキーマ変更は移行付きで。** 保存データは `store.ts#normalizeDB` で後方互換に読み、形を変えるなら `version`を上げて移行を書く。
- **Cloudflare接続失敗時にフォールバックしない。** エラー状態を表示し、再接続できる状態を保つ。
- **UI文言・コメントは日本語。** ファイル名はASCII。

## 必ず通すチェック（CIでゲート化）

```bash
npm run check   # typecheck → lint → format:check → test
npm run build   # 本番ビルド
```

個別:

```bash
npm run typecheck
npm run lint
npm run format
npm test
```

新しい振る舞いを足したら、`lib/` のロジックにはテストを書く。テストは「実行できる仕様」として維持する。

## スタイルの約束

- 色・余白は `styles.css` のCSS変数（トークン）を使う。生の16進数を各所に散らさない。
- 着順の色は順序色（1位→4位: 青→赤）にし、必ず数値ラベルも併記する。
- モバイル前提。数値は `font-variant-numeric: tabular-nums`。
- PC幅（≥1024px）だけ一画面で見渡せるレイアウトにする。スマホ幅は1カラムのままにする。
- 対局中の2カラムは右の局ログを固定幅・stickyにする。名前が縦に折れる比率指定は避ける。

## Cloudflare同期モード

ルームURLは `?room=XXXXXXX` で表す。`useRoomSync` がWorker APIを約1秒ごとにポーリングし、D1のルーム状態と完了済みgamesを取得する。

- ルーム作成・参加は `RoomView` から行い、作成後はURLへroom queryを設定する。
- 更新はrevision付きで行う。409は競合として表示し、取得し直してから再操作できるようにする。
- `db.draft` は進行中の半荘として共有する。席、局ログ、点数、入力中フォーム、quick入力を同じDB状態に載せる。
- 完了時は `api.commitDraft(game)` でgamesへ移し、draftをnullにする。
- ルームコードを知る人は閲覧・編集できる。認証やPINは別機能で、コードを必要な人だけに共有する。
- 同時書き込みはlast-write-winsの制約がある。家麻雀では1局を1人が入力する運用を前提にし、必要になった時点でフィールド単位の競合解決を検討する。

## モニター表示（`?room=...&board=1`）

- `BoardApp` はタブUIを持たない全画面スコアボード用のエントリ。
- 成績タブと同じ `computeStats` を使い、順位・名前・合計スコアを離れて読める大きさで表示する。
- 進行中draftがある場合は局ログを再生した現在点を表示する。
- room queryがない場合は「ルームURLからモニター表示を開いてください」と案内する。

## 旧履歴の移行

- `readLegacyLocalDB` はAppの初期化時に旧キーを確認するためだけに使う。通常のdbロードでは呼ばない。
- 旧履歴があるときだけ、新規ルーム作成で「履歴を移行して作る」を表示する。
- 移行は明示操作で新規ルームへ送信する。既存ルーム参加時には送信しない。
- API成功後に `clearLegacyLocalDB` を呼び、以後はD1を使う。失敗時は旧データを消さない。
- JSON書き出しはCloudflareルームのバックアップとして維持する。JSON読み込みはクラウド履歴との整合性を確認できる導線として別途設計する。

## 作業の流儀

- 小さく作って、`npm run check`を緑にしてからコミットする。コミットメッセージは日本語で簡潔にする。
- 大きめの設計判断をしたら、docsまたはこのファイルに理由を残す。
- 構成やルールが実態に合わなくなったら、黙って従い続けず、仕様と実装を同時に更新する。

## 入力UIの受け入れ基準

入力系の画面を作る・変更するときは、`npm run check`に加えて次を確認する。

- 家麻雀のその場で片手〜両手で入力する操作を具体的に想像したか。
- タップ回数と選択方法は現実的か。長いプルダウンよりボタンや早見表を優先する。
- ダブロンなど複数人が同時に絡むケースを考慮したか。
- 自動計算が間違った場合に手動で補正できるか。
- 早い段階で実際の画面を触って確認したか。
