# Spec: Cloud Room Local History Migration

## Objective

既存ブラウザの localStorage に保存されている完了済み対局を、Cloudflare の新規ルーム作成時に明示的な操作で移行できるようにする。家麻雀の過去履歴を共有ルームでも継続して閲覧・集計できることが目的。

### User flow

- ローカルDBに完了済みゲームがある場合、新規ルーム作成時に「履歴を移行して作る」と「空のルームを作る」を選べる。
- 「履歴を移行して作る」では、プレイヤー・ルール・draftと完了済みgamesを新規ルームへ登録する。
- 「空のルームを作る」では、gamesを送らず、既存の新規ルーム作成と同じ動作にする。
- 既存ルームへ参加するときは、ローカル履歴を自動送信しない。
- 移行後もブラウザのlocalStorageデータは削除しない。

## API contract

`POST /api/rooms` のリクエストに任意の `games` 配列を追加する。各ゲームは既存の `Game` 形式で検証し、ルーム作成とゲーム登録を同じD1 batchで処理する。

レスポンスは既存の `roomCode` / `revision` に加えて `migratedGames` を返す。空配列または省略時は `migratedGames: 0` とする。

## Tech Stack

- React 18 + TypeScript + Vite
- Cloudflare Workers + D1
- Vitest / ESLint / Prettier

## Commands

```bash
npm run check
npm run build
npm run cf:db:local
npm run cf:dev
```

## Project Structure

- `worker/index.ts` — ルーム作成APIとD1 batch
- `src/lib/cloud-room.ts` — ルームAPI境界の型と変換
- `src/lib/cloud-room-api.ts` — Worker APIクライアント
- `src/views/RoomView.tsx` — ルーム作成・参加UI
- `src/lib/*.test.ts` — 副作用のない契約・変換テスト
- `docs/` — 公開仕様と利用手順

## Code Style

既存の `toRoomState` のように、アプリの `DB` とAPI payloadの変換を境界モジュールへ置く。UIからWorkerのJSON形状を直接組み立てず、目的が明確な関数名を使う。

```ts
createRoom(db, { migrateGames: true })
```

## Testing Strategy

- `src/lib/cloud-room.test.ts` で移行payloadの変換と空移行を検証する。
- `src/lib/cloud-room-api` の契約変更は既存のAPIクライアント利用箇所をTypeScriptで検証する。
- `npm run check` と `npm run build` を必須とする。
- 手動で、新規ルーム作成時の移行／空ルーム／既存ルーム参加を確認する。

## Boundaries

- Always: ゲームID・日付・JSONサイズをWorker側でも検証し、localStorageを削除しない。
- Always: ルーム作成とゲーム登録を同一処理で扱い、途中状態のルームを作らない。
- Ask first: 既存gamesの削除・上書き、既存ルームへの自動移行、認証や権限モデルの追加。
- Never: 既存ルーム参加時にユーザー確認なしでローカルデータをアップロードしない。
- Never: 移行成功後にlocalStorageの履歴を自動削除しない。

## Success Criteria

- ローカルにgamesがある状態で「履歴を移行して作る」を選ぶと、新規ルームの履歴・成績に同じgamesが表示される。
- 「空のルームを作る」を選ぶと、新規ルームのgamesは0件になる。
- 既存ルームへの参加では、ローカルgamesがAPIへ送信されない。
- ページ再読み込み後も移行済みgamesが残る。
- 移行後にlocalStorageのJSONバックアップが削除されない。
- 既存のlocal/LAN/cloud同期と全テストが壊れない。

## Open Questions

なし。認証・既存ルームへの手動インポートは別機能として扱う。
