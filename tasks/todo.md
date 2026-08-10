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
  - Acceptance: room queryがある場合はWorker APIを1秒程度でポーリングし、無い場合は従来のlocalStorage/LANモードを使う。PC boardとスマホ入力が同じstateを表示する
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

- [ ] Task 10: 移行仕様をドキュメント化し公開環境で確認
  - Acceptance: 移行後もlocalStorageを削除しないことと、既存ルームへ自動送信しないことが文書化され、workers.devで確認できる
  - Verify: 新規移行・空ルーム・既存ルーム参加の手動確認、`npm run check`, `npm run build`
  - Files: `README.md`, `SETUP.md`, `docs/cloud-room-migration-spec.md`
  - Dependencies: Task 9
