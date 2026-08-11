# MaaNanoJa Cloudflare公開化 タスク

- [x] Task 1: D1 schemaとWorker APIの契約を追加
  - Acceptance: `rooms` と `games` のmigrationがあり、room作成・取得・revision付き更新・ゲーム追加/削除の契約が型とテストで確認できる
  - Verify: `npx wrangler d1 migrations apply mahjong-tracker --local`、Worker APIテスト、`npm run check`
  - Files: `worker/index.ts`, `migrations/0001_rooms.sql`, `src/lib/cloud-room.ts`, `src/lib/cloud-room.test.ts`
  - Dependencies: None

- [x] Task 2: ルーム作成・参加URLとクラウドAPIクライアントを追加
  - Acceptance: room codeを作成または入力でき、URLへroom queryを設定できる。存在しないroom・不正コード・409を表示できる
  - Verify: UI手動確認、APIクライアントテスト、`npm run check`
  - Files: `src/views/RoomView.tsx`, `src/lib/cloud-room.ts`, `src/main.tsx`, `src/styles.css`
  - Dependencies: Task 1

- [x] Task 3: App/BoardAppをroom query対応のクラウド同期へ接続
  - Acceptance: room queryがある場合はWorker APIを1秒程度でポーリングし、PC boardとスマホ入力が同じstateを表示する。旧local/LAN経路は後続のCloudflare-first化で廃止する
  - Verify: 2ブラウザ手動確認、同期判定テスト、`npm run check`
  - Files: `src/useRoomSync.ts`, `src/App.tsx`, `src/BoardApp.tsx`, `src/lib/remote.ts`, `src/main.tsx`
  - Dependencies: Task 1, Task 2

- [x] Task 4: 完了ゲームの永続化とルーム分離を実装
  - Acceptance: 半荘確定でgamesへ1件追加され、再入室後も履歴/成績に残る。別roomのデータを取得・変更できない。revision衝突は上書きしない
  - Verify: Worker統合テスト、APIのroom isolationテスト、`npm run check`
  - Files: `worker/index.ts`, `migrations/0001_rooms.sql`, `src/lib/cloud-room.test.ts`, `src/App.tsx`
  - Dependencies: Task 3

- [x] Task 5: draftから現在点を計算しboardへ表示
  - Acceptance: 確定済みhandsから進行中の現在点・親・本場を算出し、PC boardが更新される。draftが無い場合とquick modeも扱う
  - Verify: `draftPoints`の単体テスト、board手動確認、`npm run check`
  - Files: `src/lib/draft-stats.ts`, `src/lib/draft-stats.test.ts`, `src/views/BoardView.tsx`, `src/BoardApp.tsx`
  - Dependencies: Task 3

- [x] Task 6: Wrangler設定、migration手順、公開手順を追加
  - Acceptance: local/remote D1 migrationとWorkers Static Assetsの設定が再現可能で、workers.devへデプロイできる
  - Verify: `npx wrangler dev`、`npx wrangler deploy`、`npm run build`
  - Files: `wrangler.jsonc`, `package.json`, `package-lock.json`, `README.md`, `SETUP.md`
  - Dependencies: Task 1, Task 4

- [x] Task 7: エラー表示、再接続、JSON export/importとドキュメントを整備
  - Acceptance: 一時的な通信失敗をlocal状態と区別して表示し、再接続後に再同期できる。既存JSON入出力が機能し、公開手順がdocsにある
  - Verify: 通信遮断/復帰の手動確認、`npm run check`, `npm run build`
  - Files: `src/useRoomSync.ts`, `src/views/RoomView.tsx`, `src/styles.css`, `README.md`, `SETUP.md`
  - Dependencies: Task 3, Task 4, Task 6

## Cloud Room Local History Migration

- [x] Task 8: `POST /api/rooms` に任意の完了済みgames移行を追加
  - Acceptance: 新規ルーム作成とgames登録が同じ処理で成功し、移行件数が返る。空配列ではgamesを登録しない
  - Verify: `cloud-room` のpayloadテスト、`npm run check`, `npm run build`
  - Files: `worker/index.ts`, `src/lib/cloud-room.ts`, `src/lib/cloud-room-api.ts`, `src/lib/cloud-room.test.ts`
  - Dependencies: Task 1, Task 4

- [x] Task 9: 新規ルーム作成時の履歴移行選択UIを追加
  - Acceptance: ローカルgamesがある場合だけ「履歴を移行」「空のルーム」を選べる。既存ルーム参加では移行しない
  - Verify: UI手動確認、`npm run check`, `npm run build`
  - Files: `src/views/RoomView.tsx`, `src/lib/cloud-room-api.ts`
  - Dependencies: Task 8

- [x] Task 10: 移行仕様をドキュメント化し公開環境で確認
  - Acceptance: 移行を明示操作に限定し、既存ルームへ自動送信しないことが文書化され、ローカルWorkerで確認できる
  - Verify: 新規移行・空ルーム・既存ルーム参加の手動確認、`npm run check`, `npm run build`
  - Files: `README.md`, `SETUP.md`, `docs/cloud-room-migration-spec.md`
  - Dependencies: Task 9

## Cloudflare-first化

- [x] Task 11: Cloudflare専用ランタイムへ切り替え
  - Acceptance: room queryなしではルーム導線だけを表示し、App/BoardAppはD1同期だけで起動する。接続失敗時にlocal/LANへフォールバックしない
  - Verify: `npm run check`, `npm run build`, 接続中/失敗/成功の手動確認
  - Files: `src/App.tsx`, `src/BoardApp.tsx`, `src/views/RoomView.tsx`, `src/useRoomSync.ts`
  - Dependencies: Task 10

- [x] Task 12: 旧localStorage移行を一時境界へ分離
  - Acceptance: 旧localStorageは明示した移行時だけ読み、通常状態管理では使わない。JSON exportは残る
  - Verify: 移行テスト、`npm run check`, `npm run build`
  - Files: `src/lib/store.ts`, `src/lib/legacy-local-data.ts`, `src/views/RoomView.tsx`, `src/views/SettingsView.tsx`
  - Dependencies: Task 11

- [x] Task 13: LAN・ローカル運用コードを削除
  - Acceptance: `useLanSync`、LANサーバ、LAN API、関連ドキュメント・スクリプトがなく、Cloudflare公開URLだけで動く
  - Verify: `npm run check`, `npm run build`, LANサーバなしの静的確認
  - Files: `src/useLanSync.ts`, `src/lib/remote.ts`, `server/server.mjs`, `package.json`, docs
  - Dependencies: Task 12

- [ ] Task 14: Cloudflare-only本番確認
  - Acceptance: ルーム作成・参加・リロード・board・再接続・旧履歴移行がworkers.devで成功する
  - Verify: 本番手動確認、`npm run cf:deploy`
  - Files: `tasks/plan.md`, `tasks/todo.md`
  - Dependencies: Task 13

## Googleアカウントとルーム所有

- [x] Task 15: D1へユーザー・所有者・参加者モデルを追加
  - Acceptance: Google UserInfoのsubから初回ユーザーを作成し、作成ルームがownerとして一覧に出る
  - Verify: ローカルmigration、`npm run check`, `npm run build`
  - Files: `migrations/0002_accounts.sql`, `migrations/0003_google_auth.sql`, `worker/index.ts`, `src/lib/account.ts`, `src/lib/account-api.ts`
  - Dependencies: Task 13

- [x] Task 16: Googleログイン導線と自分のルーム一覧を追加
  - Acceptance: Googleログイン・ログアウト導線があり、所有・参加ルームを選択できる
  - Verify: `npm run check`, `npm run build`
  - Files: `src/App.tsx`, `src/views/RoomView.tsx`, `src/styles.css`
  - Dependencies: Task 15

- [ ] Task 17: Google OAuth設定と本番手動確認
  - Acceptance: Googleログイン、初回アカウント作成、ルーム所有、再ログイン後の一覧復元がworkers.devで成功する
  - Verify: Google OAuth Secret登録、OAuth callback、`/api/me`, `/api/my/rooms`、ルーム作成・再入室
  - Files: `docs/account-auth-spec.md`, `SETUP.md`, `README.md`
  - Dependencies: Task 16

## 公開前UI/UX改善（Issue #21）

- [x] Task 18: 共有編集と同期状態の可視化
  - Acceptance: 共有編集を維持したまま更新者・最終更新・競合反映が分かり、保存状態を区別できる
  - Verify: 同一ルームを2画面で開き、同時操作・通信失敗・復帰を手動確認。`npm run check`
  - Dependencies: Task 3

- [x] Task 19: データ保護と対局ルールの固定
  - Acceptance: 破棄・削除・空保存が安全で、過去対局のルールが後から変わらない
  - Verify: ルール変更前後の履歴・成績・board、破棄・削除確認、JSON互換テスト。`npm run check`
  - Dependencies: Task 4

- [x] Task 20: 初回導線・ルーム・入力UX
  - Acceptance: 初回利用者がルーム作成から対局開始まで迷わず、URLコピー・公開範囲・重複名が明確
  - Verify: 初回フロー、コピー失敗、重複名、設定入力の手動確認。`npm run check`
  - Dependencies: Task 2, Task 16

- [x] Task 21: スマホ・アクセシビリティ・公開向け仕上げ
  - Acceptance: 390px幅の主要操作が使いやすく、フォーム・タブ・選択状態に適切なアクセシブルネームと状態がある
  - Verify: 390px/デスクトップ手動確認、`npm run build`, `npm run check`
  - Dependencies: Task 18, Task 19, Task 20

## 成績グラフ改善（Issue #23）

- [x] Task 22: 合計スコア・着順分布グラフの改善
  - Acceptance: 順位・基準・平均順位が分かり、着順分布の数値がスマホでも読みやすい
  - Verify: デスクトップ/390px幅の手動確認、`npm run check`, `npm run build`
  - Files: `src/views/StatsPanels.tsx`, `src/styles.css`
  - Dependencies: Task 21

## Webトップページ化

- [x] Task 23: `LandingView`とルーム導線を分離
  - Acceptance: room queryなしではサービス紹介ページ、room queryありでは既存アプリ、board queryでは既存boardが表示される
  - Verify: `npm run check`、ルームなし/ルームあり/board URLの手動確認
  - Files: `src/App.tsx`, `src/views/LandingView.tsx`, `src/views/RoomEntry.tsx`, `src/views/RoomView.tsx`
  - Dependencies: Task 20, Task 21

- [x] Task 24: Webサイト型トップページの情報設計とビジュアルを実装
  - Acceptance: サービスの価値、4つの主な機能、3ステップの使い方、作成/参加CTA、共有権限の注意、GitHub/Xリンクが表示される
  - Verify: デスクトップ/390px/320px幅の手動確認、横スクロールがないこと
  - Files: `src/views/LandingView.tsx`, `src/styles.css`
  - Dependencies: Task 23

- [x] Task 25: メタ情報と公開前QAを更新
  - Acceptance: タイトル・description・OG情報がトップページの内容と一致し、初回訪問から対局開始までの導線を確認できる
  - Verify: `npm run check`, `npm run build`, 主要ブラウザの手動確認
  - Files: `index.html`, `README.md`, `SETUP.md`, `tasks/plan.md`, `tasks/todo.md`
  - Dependencies: Task 24

## Production Hardening Tasks

- [x] Task 26: Runtime contract validation
  - Acceptance: malformed RoomState/Draft/Game/Hand/Rules are rejected with 400
  - Verify: validator and Worker contract tests, `npm run check`
  - Files: `src/lib/room-validation.ts`, `src/lib/room-validation.test.ts`, `worker/index.ts`, `worker/index.test.ts`

- [x] Task 27: Request/response security boundary
  - Acceptance: body/record limits, security headers, request IDs, health endpoint, rate limiting
  - Verify: `npx wrangler types --check`, dry run, local HTTP checks
  - Files: `worker/index.ts`, `wrangler.jsonc`, `SETUP.md`, `docs/production-hardening-spec.md`

- [x] Task 28: Atomic game mutation guards
  - Acceptance: nonexistent update does not advance revision; isolation and conflict are tested
  - Verify: Worker/D1 integration tests
  - Files: `worker/index.ts`, `worker/index.test.ts`

- [x] Task 29: Reconcile and rollback policy
  - Acceptance: write failure never presents unsaved local state as saved; stale room responses are ignored
  - Verify: `useRoomSync` tests and failure simulation
  - Files: `src/useRoomSync.ts`, `src/App.tsx`, `src/useRoomSync.test.ts`

- [x] Task 30: Conditional polling
  - Acceptance: unchanged revision does not download full room history
  - Verify: API/client polling tests
  - Files: `worker/index.ts`, `src/lib/cloud-room-api.ts`, `src/useRoomSync.ts`

- [x] Task 31: Settings commit flow and player invariant
  - Acceptance: input is local until commit; maximum four players; Draft references protect deletion
  - Verify: UI tests and 390px manual check
  - Files: `src/views/SettingsView.tsx`, `src/App.tsx`, `src/lib/room-validation.ts`

- [x] Task 32: Record input safeguards
  - Acceptance: quick mismatch confirmation and clean mode transitions
  - Verify: Record UI/scoring tests
  - Files: `src/views/RecordView.tsx`, `src/lib/stats.ts`, `src/lib/stats.test.ts`

- [x] Task 33: Error boundary and recovery UI
  - Acceptance: malformed responses and unexpected errors show recovery UI, including Board
  - Verify: UI manual checks
  - Files: `src/components/AppErrorBoundary.tsx`, `src/main.tsx`, `src/App.tsx`, `src/BoardApp.tsx`, `src/views/BoardView.tsx`

- [x] Task 34: Backup restore as a new room
  - Acceptance: valid JSON creates a new room; invalid JSON leaves current room untouched
  - Verify: JSON validator tests and manual flow
  - Files: `src/views/SettingsView.tsx`, `src/App.tsx`, `src/lib/cloud-room-api.ts`, `src/lib/room-validation.ts`

- [x] Task 35: Stats/history/accessibility corrections
  - Acceptance: adjustments do not distort hand rates; details and errors are accessible
  - Verify: stats/accessibility tests
  - Files: `src/lib/stats.ts`, `src/views/HistoryView.tsx`, `src/views/SettingsView.tsx`, `src/styles.css`

- [x] Task 36: Launch automation and documentation
  - Acceptance: CI checks contract tests, types, dry run; release and rollback steps are documented
  - Verify: local CI-equivalent commands
  - Files: `.github/workflows/deploy.yml`, `SETUP.md`, `README.md`, `tasks/plan.md`, `tasks/todo.md`

## 未ログインのお試しモード

- [x] Task 37: お試しセッション保存境界を追加
  - Acceptance: `sessionStorage`へ安全に保存・復元・削除でき、壊れた値は無視される。`localStorage`は使用しない
  - Verify: `npm run test -- src/lib/guest-session.test.ts`, `npm run check`
  - Files: `src/lib/guest-session.ts`, `src/lib/guest-session.test.ts`
  - Dependencies: None

- [x] Task 38: トップページからお試しモードへ入れる導線を追加
  - Acceptance: 未ログインで「ログインなしで試す」を押すと記録画面へ入り、更新後も再開導線が表示される
  - Verify: UI手動確認、`npm run check`
  - Files: `src/App.tsx`, `src/views/RoomEntry.tsx`, `src/views/LandingView.tsx`
  - Dependencies: Task 37

- [x] Task 39: お試し画面の保存状態とログイン後移行を追加
  - Acceptance: 一時保存が明示され、ログイン後に既存お試しデータを新規共有ルームへ移行できる。成功後に一時データを削除する
  - Verify: 未ログイン/ログイン済み移行の手動確認、`npm run check`, `npm run build`
  - Files: `src/App.tsx`, `src/views/SettingsView.tsx`, `src/styles.css`
  - Dependencies: Task 38

- [x] Task 40: お試しモードの文書化と検証
  - Acceptance: README/SETUP/仕様書が一時保存と永続保存の境界を説明し、主要テストが成功する
  - Verify: `npm run check`, `npm run build`
  - Files: `README.md`, `SETUP.md`, `docs/guest-mode-spec.md`, `tasks/plan.md`, `tasks/todo.md`
  - Dependencies: Task 39
