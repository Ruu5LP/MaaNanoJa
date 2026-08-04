# Implementation Plan: MaaNanoJa Cloudflare公開化

## Overview

既存のReact/ViteアプリをCloudflare Workersへ載せ、ルームコード単位でD1に共有状態と対局履歴を保存する。既存のLAN同期は残し、room queryがある場合だけクラウド同期を有効にする。モニター表示は進行中draftを再生して現在点を表示する。

## Architecture Decisions

- **Worker + D1を採用:** 静的アセット、API、永続履歴を同じCloudflareプロジェクトに置く。
- **roomsとgamesを分離:** 進行中状態の更新と完了済み履歴の蓄積を分離し、履歴が増えても1行JSONのサイズに依存しない。
- **ルームコードをcapability keyとして使う:** MVPではログインを導入せず、コードを知る人だけがアクセスできる。コード漏洩時の権限分離は対象外。
- **ポーリングを維持:** 現在の1秒ポーリングをクラウドAPIへ向ける。WebSocketは必要性が確認されてから追加する。
- **既存LANモードを保持:** room queryのないローカル利用は従来のlocalStorage/LAN同期へフォールバックする。
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
- [ ] `npx wrangler deploy` 後にworkers.devで同じ確認成功

## Risks and Mitigations

| Risk                                  | Impact | Mitigation                                                                       |
| ------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| 同時書き込みで片方の更新が消える      | High   | revision条件更新をAPIとテストで強制し、409をUIに表示する                         |
| room code漏洩で他人が閲覧・編集できる | High   | 推測困難なコードを生成し、MVPの制約として明記する。将来PIN/認証を追加可能にする  |
| draftの再生とboard表示がずれる        | High   | `draftPoints`を純粋関数化し、既存`replay`を使ってテストする                      |
| D1への1秒ポーリングが増える           | Medium | まず小規模利用を対象とし、利用量を確認。必要なら間隔・条件付き取得を調整する     |
| 既存LAN利用を壊す                     | Medium | room queryがない経路を残し、既存テストと手動確認を通す                           |
| localStorageデータ移行が曖昧になる    | Medium | 既存履歴の一括アップロードは別途確認を取る。新規ルーム作成後の記録はD1へ保存する |

## Verification Checkpoints

各タスク後に、対象テスト、`npm run check`、必要なら`npm run build`を実行する。Task 2、Task 5、Task 7後は人手で画面確認する。

## Open Questions

- MVPはworkers.dev公開で開始する。
- 既存localStorageを新規ルームへ取り込む初回seed UIは、共有データの一括送信になるため別途確認して追加する。
