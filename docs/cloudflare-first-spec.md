# Spec: Cloudflare-first MaaNanoJa

## Objective

MaaNanoJaをCloudflare Workers + D1を前提にした共有Webアプリへ整理する。通常のデータ保存先をD1へ一本化し、端末や家庭内ネットワークに依存せず、PC・スマホが同じルームURLから同じ状態を扱えることを最終状態とする。

## Assumptions

- オフライン利用は要件に含めない。
- Cloudflareへの接続失敗時は、ローカルデータへフォールバックせず、再接続を案内する。
- 既存localStorage利用者の履歴は、移行期間中だけ明示的にD1へ移せる。
- LAN同期サーバは最終状態では不要とする。
- ルームコードを現行の簡易アクセスキーとして維持し、認証/PINは別フェーズの安全性向上として扱う。

## Target Architecture

- D1: players、rules、draft、gamesの正式な保存先
- ブラウザ: ルームURL、画面状態、一時入力だけを保持。共有ルームのDBデータはlocalStorageへ保存しない。未ログインのお試しモードだけはsessionStorageへタブ単位で一時保存する
- 起動導線: ルーム作成または既存ルーム参加が必須
- モニター表示: `?room=...&board=1` のCloudflareルームだけを対象にする
- バックアップ: 設定画面のJSON書き出しを残す。読み込みはCloudflareルームへの明示操作として再設計する
- 移行期間: 旧localStorageを一度だけ読み込むlegacy migrationを残し、通常の状態同期とは分離する

## User Flow

1. ルームURLなしで開くと、ルーム作成／参加画面だけを表示する。
2. 新規ルーム作成では、旧localStorageに履歴がある場合だけ「履歴を移行して作る」を選べる。
3. ルーム参加後はD1から初期状態を取得し、以後の変更はWorker APIへ保存する。
4. 通信失敗時はエラーと再接続状態を表示し、ローカル状態へ切り替えない。
5. 既存localStorageとLAN同期の通常経路は廃止する。

## Tech Stack and Commands

- React 18 + TypeScript + Vite
- Cloudflare Workers + D1
- Vitest / ESLint / Prettier

```bash
npm run check
npm run build
npm run cf:deploy
```

## Project Boundaries

- Always: D1を唯一の本体として扱い、通信失敗を隠さない。
- Always: 共有ルームのroom queryなしでは、共有用の記録・成績・設定などの本体UIを表示しない。未ログインのお試しモードは別の一時状態として例外扱いする。
- Always: 既存localStorageの移行はユーザーの明示操作に限定する。
- Ask first: ルームコード以外の認証、既存ルームへの自動統合、D1スキーマ変更。
- Never: D1の状態をlocalStorageへ自動ミラーリングしない。
- Never: 未ログインのお試し状態をD1やlocalStorageへ保存しない。
- Never: Cloudflare接続失敗時にlocal/LANへサイレントフォールバックしない。

## Implementation Phases

### Phase 1: Cloudflare-first runtime（完了）

- [x] localStorageの通常ロード・保存を停止する。
- [x] ルーム未指定時の画面をルーム導線に限定する。
- [x] `App` と `BoardApp` をCloudflare同期だけで起動する。
- [x] 旧localStorage移行は一時的な境界アダプタとして残す。

### Phase 2: Remove local and LAN runtime（完了）

- [x] `useLanSync`、LAN API境界、LANサーバ、関連スクリプトを削除する。
- [x] README、SETUP、CLAUDE、公開仕様からローカル/LAN運用を削除する。
- [x] localStorageを通常データとして参照するコードとテストを削除する。

### Phase 3: Backup and production hardening

- JSON exportをCloudflareルームのバックアップとして整理する。
- JSON importのCloudflare向け安全な導線を追加する。
- workers.devでルーム作成、参加、再接続、board表示、履歴永続化を確認する。
- ルームコード漏洩時の影響を明記し、必要ならPIN/認証を追加する。

## Testing Strategy

- D1同期の純粋な契約・変換テストを維持する。
- room queryなし、接続中、接続失敗、接続成功のUI状態を手動確認する。
- LAN専用テストは削除対象として扱う。
- `npm run check`、`npm run build`、workers.devの手動確認を完了条件にする。

## Success Criteria

- localStorageを削除または無効化しても、ルーム作成・参加後の記録、履歴、成績、boardが動く。
- ルーム未指定時に、ローカルDB画面やLAN同期画面へ入れない。
- D1に保存した状態がリロード後も復元される。
- Worker停止・通信失敗時に、誤ってローカル状態へ切り替わらない。
- LANサーバを起動しなくても、Cloudflare公開URLだけで全機能が使える。
- 旧localStorage履歴を必要なユーザーだけが一度移行できる。
