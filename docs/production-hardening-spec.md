# Spec: MaaNanoJa 本番公開ハードニング

## Objective

MaaNanoJaを、共有ルームのデータを壊さず、保存失敗を誤認させず、認証・入力・運用境界を明確にした状態へ改善する。既存の日本式リーチ麻雀・4人打ち・Cloudflare Workers + D1という製品方針と、ルーム内のDraftを複数端末で共有する方針は維持する。

## Assumptions

1. OAuth Secretが設定された環境ではログイン必須のルームアクセスを正式仕様とする。
2. OAuth Secretが未設定の移行期間は、既存のルームコードアクセスを維持する。
3. Draftの共有編集は維持するが、未保存・競合・失敗状態を明示し、失敗時はサーバー状態へ戻す。
4. JSON復元は既存ルームを上書きせず、「復元データから新しいルームを作る」導線とする。
5. 新規外部依存は原則追加せず、既存のTypeScript型と手書きのruntime validatorを使う。
6. 既存データを壊さないため、古いrulesの欠損値は読み取り時に既定値へ補完する。

## Commands

- Check: `npm run check`
- Build: `npm run build`
- Worker type check: `npx wrangler types --check`
- Deployment dry run: `npx wrangler deploy --dry-run`
- Local D1 migration: `npm run cf:db:local`

## Project Structure

- `src/lib/room-validation.ts`: RoomState/Game/Draftのruntime validation
- `src/lib/cloud-room-api.ts`: API応答とconditional pollingの境界
- `src/useRoomSync.ts`: queue、reconcile、rollback、room世代管理
- `src/App.tsx`: optimistic updateとAPI actionの入口
- `src/views/SettingsView.tsx`: ローカル編集とcommit
- `worker/index.ts`: HTTP、認証、Rate Limiting、D1境界
- `worker/contract.test.ts`: Worker境界の契約テスト
- `src/components/AppErrorBoundary.tsx`: 壊れたデータからの画面復帰
- `docs/production-hardening-spec.md`: 本仕様

## Code Style

runtime validatorは「受け入れる条件」を名前に表す。外部入力を型アサーションで通さず、検証済みの値だけをdomain typeへ変換する。

```ts
export function parseRoomState(value: unknown): RoomState {
  const parsed = validateRoomState(value)
  if (!parsed.ok) throw new RequestError(parsed.message, 400)
  return parsed.value
}
```

Workerではprepared statement、固定レスポンスヘッダー、構造化ログを維持する。Reactでは入力途中の値をDB更新関数へ直接渡さず、画面のdraft stateから明示commitする。

## Testing Strategy

- runtime validator: 正常値、不正なネスト、重複ID、人数超過、数値範囲、日付、未知hand type
- Worker: APIが不正state/gameを400で拒否すること、存在しないgame updateでrevisionを増やさないこと、health/security headers、rate-limit拒否
- sync: 409、通信失敗、reconcile失敗、room切替後の古いレスポンスを無視すること
- UI: settingsの入力途中未保存、4人上限、quick入力の不一致確認、復元から新規room作成
- 既存純粋ロジック: `npm run check`
- 手動: desktop/390px、2端末共有、通信遮断・復帰、OAuth環境、staging smoke

## Boundaries

- Always: 外部入力をruntime validationし、保存成功前に「保存済み」と表示しない。公開前にcheck/buildを実行する。
- Ask first: D1の既存データ削除、既存roomの上書き復元、OAuthアクセス方針の変更、Cloudflare本番namespaceの変更。
- Never: 秘密値をリポジトリへ保存する。壊れたpayloadを「互換性」の名目で保存する。保存失敗を成功扱いにする。

## Success Criteria

1. malformed state/gameがAPIで保存されず、400で拒否される。
2. 通信失敗後にローカルだけのデータが「保存済み」と残らず、サーバー状態へreconcileまたはrollbackされる。
3. 設定値は入力途中ではAPIへ送られず、保存・キャンセルを選べる。
4. 4人制、unique player IDs、数値・日付・handの不変条件がUIとWorker双方で守られる。
5. OAuth有効時のUI・API・ドキュメントの認証仕様が一致し、戻り先が同一originに限定される。
6. JSON restoreは新規ルーム作成として安全に実行できる。
7. security headers、health endpoint、rate limiting、structured request logsが導入される。
8. `npm run check`、`npm run build`、Wrangler dry run、主要手動フローが成功する。

## Open Questions

- Rate Limiting bindingのnamespace IDはCloudflare account内で未使用の値に設定する必要がある。
- 本番workers.devのOAuth Secret登録、D1 migration、staging環境作成はCloudflare管理画面/Secretへのアクセスが必要。
