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
  - Acceptance: Access identityから初回ユーザーを作成し、作成ルームがownerとして一覧に出る
  - Verify: ローカルmigration、`npm run check`, `npm run build`
  - Files: `migrations/0002_accounts.sql`, `worker/index.ts`, `src/lib/account.ts`, `src/lib/account-api.ts`
  - Dependencies: Task 13

- [x] Task 16: Googleログイン導線と自分のルーム一覧を追加
  - Acceptance: Googleログイン・ログアウト導線があり、所有・参加ルームを選択できる
  - Verify: `npm run check`, `npm run build`
  - Files: `src/App.tsx`, `src/views/RoomView.tsx`, `src/styles.css`
  - Dependencies: Task 15

- [ ] Task 17: Cloudflare AccessのGoogle設定と本番手動確認
  - Acceptance: Googleログイン、初回アカウント作成、ルーム所有、再ログイン後の一覧復元がworkers.devで成功する
  - Verify: Cloudflare Access設定、Google OAuth callback、`/api/me`, `/api/my/rooms`、ルーム作成・再入室
  - Files: `docs/account-auth-spec.md`, `SETUP.md`, `README.md`
  - Dependencies: Task 16
