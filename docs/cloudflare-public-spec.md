# MaaNanoJa Cloudflare公開化 旧仕様

このファイルは、Cloudflare公開化の初期MVP仕様を参照するために残している履歴資料です。

現在の正式な仕様は [cloudflare-first-spec.md](./cloudflare-first-spec.md) です。現在のアプリでは、Cloudflare Workers + D1を唯一の正式な保存先とし、ローカル保存・LAN同期・LANサーバー運用は通常経路として提供していません。

旧localStorage履歴の移行だけは、移行期間中の互換機能として、新規ルーム作成時の明示操作に限って残しています。利用手順は [SETUP.md](../SETUP.md) を参照してください。
