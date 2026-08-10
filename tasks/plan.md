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
