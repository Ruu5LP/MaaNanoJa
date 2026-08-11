# Implementation Plan: MaaNanoJa Cloudflare公開化

## Overview

既存のReact/ViteアプリをCloudflare Workersへ載せ、ルームコード単位でD1に共有状態と対局履歴を保存する。Cloudflareを唯一の正式保存先とし、モニター表示は進行中draftを再生して現在点を表示する。過去のLAN・ローカル運用に関する初期タスクは履歴として残す。

## Architecture Decisions

- **Worker + D1を採用:** 静的アセット、API、永続履歴を同じCloudflareプロジェクトに置く。
- **roomsとgamesを分離:** 進行中状態の更新と完了済み履歴の蓄積を分離し、履歴が増えても1行JSONのサイズに依存しない。
- **ルームコードをcapability keyとして使う:** MVPではログインを導入せず、コードを知る人だけがアクセスできる。コード漏洩時の権限分離は対象外。
- **ポーリングを維持:** 現在の1秒ポーリングをクラウドAPIへ向ける。WebSocketは必要性が確認されてから追加する。
- **Cloudflare-first:** room queryのない経路はルーム作成・参加導線に限定し、接続失敗時もローカルへフォールバックしない。
- **既存DB型をクライアント契約として維持:** Worker内部でD1の行を組み立て、UIとスコア計算の変更を最小化する。

## Dependency Graph

```text
D1 schema + Worker API contract
        ↓
room code URL + cloud client
        ↓
App/BoardApp room sync
        ↓
draft current-points model + board UI
        ↓
history persistence + room isolation verification
        ↓
Wrangler deployment + docs/manual QA
```

## Task List

### Phase 1: Foundation

- [x] Task 1: D1 schemaとWorker APIの契約を追加
- [x] Task 2: ルーム作成・参加URLとクラウドAPIクライアントを追加

### Checkpoint: Foundation

- [x] Workerのローカル起動とD1 migrationが成功する
- [x] ルーム作成、取得、revision付き状態更新がテストできる
- [x] 既存 `npm run check` が緑のまま

### Phase 2: Shared Gameplay

- [x] Task 3: App/BoardAppをroom query対応のクラウド同期へ接続
- [x] Task 4: 完了ゲームの永続化と履歴のルーム分離を実装
- [x] Task 5: draftから現在点を計算し、boardへ表示

### Checkpoint: Core Features

- [x] PCのboard URLとスマホの入力URLが同じroom stateを表示する
- [x] 局確定、draft更新、半荘確定が別端末へ反映される
- [x] ルームAの履歴がルームBへ混ざらない

### Phase 3: Deployment and Polish

- [x] Task 6: Wrangler設定、migration手順、公開手順を追加
- [x] Task 7: エラー表示、再接続、JSON export/importとドキュメントを整備

### Checkpoint: Complete

- [x] `npm run check` 成功
- [x] `npm run build` 成功
- [x] `npx wrangler dev` でAPIの手動確認成功
- [x] `npx wrangler deploy` 後にworkers.devで同じ確認成功

## Phase 4: Cloud Room Local History Migration

既存localStorageの完了済みgamesを、新規ルーム作成時だけ明示的に移行できるようにする。既存ルーム参加時の自動移行は行わない。

### Task 8: ルーム作成APIにgames移行契約を追加

- [x] `POST /api/rooms` が任意のgames配列を受け取り、ルーム作成と同じD1 batchで保存する
- [x] gamesのID・日付・サイズをWorker側で検証し、移行件数を返す
- [x] クライアントpayloadと変換テストを追加する

### Task 9: 新規ルーム作成UIに移行選択を追加

- [x] ローカルgamesがあるときだけ、履歴移行作成と空ルーム作成を選択できる
- [x] 既存ルーム参加時はローカルgamesを送信しない
- [x] 移行成功後は旧localStorageを通常利用せず、旧キーを片付ける

### Task 10: ドキュメントと手動確認を更新

- [x] SETUP/READMEに移行挙動とバックアップ方針を記載する
- [ ] 移行・空ルーム・既存ルーム参加をworkers.devで確認する

### Checkpoint: Local History Migration Complete

- [x] `npm run check` 成功
- [x] `npm run build` 成功
- [x] ローカルWorkerで新規ルームの履歴移行が成功
- [ ] 空ルームと既存ルーム参加で意図しないアップロードがない

## Risks and Mitigations

| Risk                                  | Impact | Mitigation                                                                      |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| 同時書き込みで片方の更新が消える      | High   | revision条件更新をAPIとテストで強制し、409をUIに表示する                        |
| room code漏洩で他人が閲覧・編集できる | High   | 推測困難なコードを生成し、MVPの制約として明記する。将来PIN/認証を追加可能にする |
| draftの再生とboard表示がずれる        | High   | `draftPoints`を純粋関数化し、既存`replay`を使ってテストする                     |
| D1への1秒ポーリングが増える           | Medium | まず小規模利用を対象とし、利用量を確認。必要なら間隔・条件付き取得を調整する    |
| Cloudflare接続失敗時の利用不能        | Medium | エラーと再接続を表示し、保存先を曖昧にしない                                    |
| localStorageデータ移行が曖昧になる    | Medium | 明示的な新規ルーム作成時だけ移行し、成功後は旧キーを片付ける                    |

## Verification Checkpoints

各タスク後に、対象テスト、`npm run check`、必要なら`npm run build`を実行する。Task 2、Task 5、Task 7後は人手で画面確認する。

## Open Questions

- MVPはworkers.dev公開で開始する。
- 既存localStorageの移行は移行期間のlegacy経路として残し、通常の保存機能には戻さない。

## Phase 6: Googleアカウントとルーム所有

Google OAuthをWorker内で処理し、MaaNanoJaはユーザーとルームの所有・参加関係だけをD1で管理する。Google Secret未設定のデプロイでは既存room code運用を壊さず、Secret登録後に認証済みルートへ切り替わる。

### Task 15: アカウント・ルーム所有モデル

- [x] `users`、`rooms.owner_user_id`、`room_members`のD1 migrationを追加する
- [x] Google UserInfoの`sub`から初回ログイン時にユーザーを自動作成する
- [x] `GET /api/me` と `GET /api/my/rooms` を追加する
- [x] 認証済みで作成したルームをownerとして保存する

### Task 16: GoogleログインUIとルーム一覧

- [x] Googleログイン・ログアウト導線を追加する
- [x] ログイン済みユーザーの所有・参加ルームを一覧表示する
- [x] ルームコード参加時に認証済みユーザーをmemberとして記録する

### Task 17: Google OAuth設定と本番確認

- [ ] Google OAuthクライアントを作成し、Client ID/SecretをWorker Secretへ登録する
- [ ] OAuth callback、セッションCookie、ログアウトを確認する
- [ ] 初回ログイン、ルーム作成、ログアウト、再ログイン後のルーム一覧を確認する

### Checkpoint: Account Complete

- [x] 認証情報をアプリのパスワード・localStorageへ保存しない
- [x] `npm run check` と本番ビルドが成功する
- [ ] Googleログインから本番のルーム所有・再ログイン復元まで手動確認する

## Phase 5: Cloudflare-first化

Cloudflare D1を唯一の正式保存先にし、localStorageとLAN同期を通常運用から外す。既存localStorageの移行は移行期間だけのlegacy経路として残す。

### Task 11: Cloudflare専用ランタイムへ切り替え

- [x] localStorageの通常ロード・保存を停止し、D1同期だけでApp/BoardAppを起動する
- [x] room queryなしではルーム作成・参加導線だけを表示する
- [x] Cloudflare接続失敗時にlocal/LANへフォールバックしない

### Task 12: 旧localStorage移行を一時境界へ分離

- [x] 旧localStorageを読む処理を通常状態管理から分離する
- [x] 移行を明示操作に限定し、成功後の通常画面はD1状態だけを使う
- [x] JSON exportをCloudflareルームのバックアップとして維持する

### Task 13: LAN・ローカル運用コードを削除

- [x] `useLanSync`、LAN API境界、LANサーバ、関連スクリプトを削除する
- [x] README、SETUP、CLAUDE、公開仕様からローカル/LAN運用を削除する
- [x] 不要になったLANテストとlocalStorage通常保存テストを整理する

### Task 14: Cloudflare-only本番確認

- [ ] ルーム作成、参加、リロード、再接続、board表示をworkers.devで確認する
- [ ] 旧localStorage履歴の移行を確認する
- [ ] Cloudflare停止時にローカルへ誤フォールバックしないことを確認する

### Checkpoint: Cloudflare-first Complete

- [x] `npm run check` 成功
- [x] `npm run build` 成功
- [ ] LANサーバなしで公開URLが動作する
- [ ] localStorageなしでルームの記録・履歴・成績が復元される
- [ ] workers.devで手動確認完了

## Phase 7: Public Launch UX Hardening

公開前レビューで確認したUI/UX改善を、共有編集の意図を維持したまま実装する。

### Architecture Decisions

- 全員が同じdraftを操作・閲覧できる共有編集は維持する。
- 競合時は再適用操作を要求せず、最新操作・更新者・同期状態を通知する。
- 完了済みGameには対局時点のルールを保存し、後から設定を変更しても過去の成績を変えない。
- 破棄・削除・保存失敗は、確認または明確な復帰導線を必ず持つ。

### Task 18: 共有編集と同期状態の可視化

- [x] 共有編集を維持したまま、別端末の最新入力反映と最終同期時刻を画面で示す
- [x] 保存中、保存済み、同期エラーを区別し、エラー時に再接続導線を出す
- [x] 409競合時はサーバーの最新状態を表示し、再適用操作なしで二重保存を避ける

### Task 19: データ保護と対局ルールの固定

- [x] 進行中半荘の破棄、履歴削除、空の半荘保存を安全に扱う
- [x] Gameごとにルールを保持し、履歴・成績・モニター表示で利用する
- [x] JSONバックアップと既存データの後方互換を維持する

### Task 20: 初回導線・ルーム・入力UX

- [x] ルーム作成からメンバー登録、対局開始までの導線を明確にする
- [x] URLコピー成功・失敗、ルームの公開範囲、プレイヤー名の重複を明示する
- [x] 設定の入力を共有編集中に中間状態で保存しない

### Task 21: スマホ・アクセシビリティ・公開向け仕上げ

- [x] 主要タッチ操作を44px以上にし、スマホの成績表を読みやすくする
- [x] フォーム、選択状態、タブ、ボタンをスクリーンリーダーで理解できるようにする
- [x] メタ情報とヘルプを追加し、公開前の主要導線を手動確認する

### Checkpoint: Public Launch UX Complete

- [x] `npm run check` 成功
- [x] `npm run build` 成功
- [x] 主要フローをデスクトップ・390px幅で確認
- [x] Issue #21の受け入れ条件を満たす

## Phase 8: Stats Graph Readability

Issue #23として、成績画面の2つのグラフを比較しやすく、スマホでも読みやすくする。

### Task 22: 合計スコア・着順分布グラフの改善

- [x] 合計スコアに順位・平均順位・0軸・スケール説明を追加する
- [x] 着順分布バー内の細かい文字を外し、下段の回数・割合を主表示にする
- [x] グラフの内容をアクセシブルなラベルでも伝える
- [x] デスクトップ・390px幅で視覚確認し、`npm run check` と `npm run build` を通す

### Checkpoint: Stats Graph Readability Complete

- [x] Issue #23の受け入れ条件を満たす

## Phase 9: Webトップページ化

ルーム未指定時の画面を、内部アプリの起動画面から、サービスの価値と使い方が伝わるWebサイト型のトップページへ変更する。ルームURLから来た利用者は、これまで通り直接アプリへ入れる。

### Architecture Decisions

- `/`（room queryなし）はサービス紹介ページとして表示し、対局入力UIや同期状態を表示しない。
- `/?room=XXXX` は既存の対局アプリへ直接遷移し、招待リンクからの操作を増やさない。
- ルーム作成・参加処理は紹介ページから呼び出せる共有の `RoomEntry` として分離し、紹介文と業務ロジックを混在させない。
- ファーストビューには必ず「新しいルームを作る」「ルームコードで参加する」のCTAを残す。
- ルームURLを知る人が閲覧・編集できる制約は、紹介ページでも明示する。
- 開発者リンク（GitHub / X）はフッターにまとめ、サービスの主導線を邪魔しない。

### Task 23: LandingViewとルーム導線の分離

- [x] `LandingView`、`RoomEntry`を追加し、`roomCode`の有無でトップページとアプリを切り替える
- [x] ルームURLからの既存アプリ遷移、ルーム作成、ルームコード参加、board表示を維持する
- [x] トップページに同期バッジや対局用タブを表示しない

**Verification:** `npm run check`、ルームなし/ルームあり/board URLの手動確認

**Files likely touched:** `src/App.tsx`, `src/views/LandingView.tsx`, `src/views/RoomEntry.tsx`, `src/views/RoomView.tsx`

### Task 24: Webサイト型トップページの情報設計とビジュアル

- [x] ヒーローに「麻雀の対局を、みんなで記録・共有」と価値を表示する
- [x] 点数記録・局ログ・成績・モニター表示の特徴を紹介する
- [x] 「新しいルームを作る」「ルームコードで参加する」をファーストビューに配置する
- [x] 使い方を「ルーム作成 → メンバー登録 → 対局記録」の3ステップで説明する
- [x] 共有URLの閲覧・編集権限を注意表示する
- [x] フッターにGitHub（`https://github.com/Ruu5LP`）とX（`https://x.com/Ruu5LP`）を設置する

**Verification:** デスクトップ、390px幅、320px幅で視覚確認。横スクロールが発生しないこと。

**Files likely touched:** `src/views/LandingView.tsx`, `src/styles.css`

### Task 25: メタ情報と公開前QA

- [x] タイトル、description、OGタイトル・説明をWebサイト型トップページの内容に合わせる
- [x] ルームURLをSNSや検索向けの一般トップページとして誤って扱わない方針を確認する
- [x] 初回訪問からルーム作成・参加・対局開始までの導線を手動確認する

**Verification:** `npm run check`、`npm run build`、主要ブラウザでの手動確認

**Files likely touched:** `index.html`, `README.md`, `SETUP.md`, `tasks/plan.md`, `tasks/todo.md`

### Checkpoint: Webトップページ化 Complete

- [x] ルームなしの訪問者が、サービス内容と次の操作を理解できる
- [x] 招待リンク利用者が、紹介ページを経由せずアプリを開ける
- [x] デスクトップ・スマホでCTAと説明が崩れない
- [x] `npm run check` と `npm run build` が成功する

### Risks and Mitigations

| Risk                                     | Impact | Mitigation                                                          |
| ---------------------------------------- | ------ | ------------------------------------------------------------------- |
| 紹介を増やしてルーム操作が下がる         | Medium | CTAをファーストビューに固定し、作成・参加を最初の操作として残す     |
| `RoomView`の分離で既存のルーム状態を壊す | High   | ルームなし/あり/boardの3経路を手動確認し、RoomEntryの処理を共有する |
| ルームURLの権限説明が目立たなくなる      | High   | CTA付近に常設の注意表示を置く                                       |

## Phase 10: Production Hardening

このPhaseは、監査で見つかったデータ破壊・同期・認証・運用リスクを修正する。詳細仕様は `docs/production-hardening-spec.md`。

### Task 26: Runtime contract validation [x]

- [ ] RoomState、Draft、Game、Hand、RulesをWorkerとクライアントでruntime validationする
- [ ] 人数、重複ID、参照整合性、finite integer、日付、文字列長、hand typeを検証する
- [ ] malformed payloadが400になり、既存の正常データは読み込める

**Verification:** validator unit tests、Worker API contract tests、`npm run check`

**Dependencies:** Task 25

### Task 27: Request/response security boundary [x]

- [ ] 実体のrequest body上限、ゲーム件数、履歴件数、名前/メモ長を制限する
- [ ] security headers、request ID、structured error log、`/healthz`を追加する
- [ ] Rate Limiting bindingを導入し、namespace IDの設定手順を文書化する

**Verification:** header/health/rate-limit tests、`npx wrangler types --check`、dry run

**Dependencies:** Task 26

### Task 28: Atomic game mutation guards [x]

- [ ] 存在しないgame updateでroom revisionを増やさない
- [ ] room code、game ID、payloadの境界を一貫して検証する
- [ ] room isolationと競合のWorkerテストを追加する

**Verification:** Worker integration tests、local D1 API test

**Dependencies:** Task 26

### Checkpoint: Worker Foundation

- [ ] `npm run check`
- [ ] `npm run build`
- [ ] malformed state/gameが拒否される
- [ ] health/security headers/rate limitが確認できる

### Phase 11: Safe Shared Sync

### Task 29: Reconcile and rollback policy [x]

- [ ] write success/error/conflict/reconcileを明示的な同期状態として扱う
- [ ] 通信失敗時はサーバー再取得、失敗時は最後に同期済みのDBへ戻す
- [ ] room切替後の古いリクエストが現在のroom stateを変更しない

**Verification:** useRoomSync tests、通信遮断・復帰の手動確認

**Dependencies:** Task 28

### Task 30: Conditional polling [x]

- [ ] revisionが変わらないpollでゲーム全件を返さない
- [ ] API clientがnot-modifiedを扱う
- [ ] pollingとwrite queueの相互作用を検証する

**Verification:** API/client tests、local Worker polling test

**Dependencies:** Task 29

### Task 31: Settings commit flow and player invariant [x]

- [ ] 設定入力途中はAPIへ保存しない
- [ ] 保存・キャンセル・保存失敗を表示する
- [ ] 4人制とDraft参照中の削除禁止をUI/Worker双方で守る

**Verification:** Settings UI tests、390px manual check、`npm run check`

**Dependencies:** Task 29

### Task 32: Record input safeguards [x]

- [ ] quick modeの点数不一致に明確な確認を要求する
- [ ] 局タイプ変更時に不要なriichi/tenpaiを消す
- [ ] 途中流局に必要な立直情報を記録できるか仕様とUIを一致させる

**Verification:** Record UI tests、scoring regression tests

**Dependencies:** Task 31

### Checkpoint: Shared Data Safety

- [ ] 2端末のDraft共有と競合表示が確認できる
- [ ] 通信失敗後に保存済み表示が残らない
- [ ] settings/quick/recordの主要入力が不正値を保存しない

### Phase 12: Recovery, UX and Launch Operations

### Task 33: Error boundary and recovery UI [x]

- [ ] malformed/予期せぬ例外で白画面にならない
- [ ] 再試行・ルーム選択へ戻る導線を用意する
- [ ] Board表示にも再接続導線を追加する

**Verification:** malformed response simulation、desktop/390px manual check

**Dependencies:** Task 29

### Task 34: Backup restore as a new room [x]

- [ ] JSONファイルを検証して読み込める
- [ ] 既存roomを上書きせず、新規roomとして作成する
- [ ] restore失敗時に元のroom stateを変更しない

**Verification:** valid/invalid/legacy JSON tests、manual restore flow

**Dependencies:** Task 26, Task 31

### Task 35: Stats/history/accessibility corrections [x]

- [ ] adjustを局数の分母から除外する
- [ ] 局ログに内容を確認できる情報を追加する
- [ ] alert、focus、button state、同期文言を整える

**Verification:** stats tests、accessibility checks、390px manual check

**Dependencies:** Task 32

### Task 36: Launch automation and documentation [x]

- [ ] CIでvalidator/Worker契約テスト、wrangler types、dry runを実行する
- [ ] health smoke test、migration手順、rollback手順、rate-limit設定を文書化する
- [ ] OAuth本番確認とstaging smokeのチェックリストを更新する

**Verification:** GitHub Actions-equivalent local commands、`npm run check`、`npm run build`

**Dependencies:** Task 27, Task 33, Task 34

### Checkpoint: Production Release Gate

- [x] check/build/dry-runが成功
- [x] malformed API payloadが拒否される
- [ ] 2端末同期、再接続、復元、OAuthの手動確認が完了
- [x] health/observability/rollback手順が実行可能

## Phase 13: 未ログインのお試しモード

### Overview

Googleログイン前でも記録・成績機能を試せるようにする。お試しデータはタブ単位の`sessionStorage`にだけ保持し、ログイン後に新規共有ルームへ移行できるようにする。共有ルームの永続保存と別端末共有は引き続きログイン後に限定する。

### Architecture Decisions

- お試し状態の責務を`src/lib/guest-session.ts`へ分離し、`localStorage`の旧データ移行境界と混ぜない。
- `roomCode`の有無とは別に`guestMode`を持ち、既存のクラウド同期フックは共有ルームでだけ動かす。
- ログイン後の移行は既存の`POST /api/rooms`を利用し、既存ゲームも同じ新規ルームへ移行する。
- Googleログイン無効環境の既存ルームコード運用は後方互換のためWorker側で維持する。

### Tasks

- [x] Task 37: お試しセッション保存境界を追加
- [x] Task 38: トップページからお試しモードへ入れる導線を追加
- [x] Task 39: お試し画面の保存状態とログイン後移行を追加
- [x] Task 40: お試しモードの文書化と検証

### Checkpoint: Guest Mode Complete

- [x] 未ログインで記録・成績・履歴・設定を利用できる
- [x] 更新では復元し、タブを閉じるとお試しデータが消える
- [x] ログイン後に一時データを新規共有ルームへ移行できる
- [x] `npm run check` と `npm run build` が成功する
