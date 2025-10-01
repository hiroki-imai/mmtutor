# mmtutor (MVP)

Mermaid を「手で覚える」ためのローカル教材とライブプレビュー環境です。`mmtutor` コマンドを実行すると教材とプレビューがブラウザで立ち上がり、`playground.mmd` を保存するたびに即時反映されます。

## Install

```bash
npm install -g @asia-quest/mmtutor
```

## Run

```bash
mmtutor            # デフォルト（flow 章）
mmtutor seq        # topic を指定して起動
```

起動するとブラウザが自動で開きます。右ペインの textarea を編集するか、`<cwd>/.mmtutor/playground.mmd` をお好みのエディタで編集してください。保存すると即プレビューされます。

## Features

- 12 種類の Mermaid ダイアグラム教材（Markdown）とテンプレートを同梱
- `playground.mmd` の変更を chokidar で監視し、SSE でブラウザへ即時配信
- ブラウザ内の簡易エディタからも保存可能（300ms デバウンス）
- テーマ切り替え（default / dark）と topic 切り替え UI
- ローカル配布のライブラリ（mermaid 10.9.x / marked / DOMPurify / highlight.js）

## Development

```bash
npm install
npm run dev -- --no-open      # CLI を直接起動（tsx）
npm run build                 # TypeScript -> dist
npm run prepare:vendor        # vendor JS/CSS を再生成
```

- `dist/` 以下に CLI / サーバの ESM を出力します。
- `scripts/prepare-vendor.mjs` が `web/vendor` を最新化します（初回 `npm install` でも実行されます）。
- `DEBUG=mmtutor:* mmtutor` で監視イベント等の詳細ログを取得できます。

## Project Structure

```
├── src/            # TypeScript ソース
├── web/            # フロントの静的アセット
├── lessons/        # topic 別教材（Markdown）
├── templates/      # topic 別テンプレ（Mermaid）
├── scripts/        # ビルド補助スクリプト
└── dist/           # ビルド成果物（npm run build）
```

## Troubleshooting

- ブラウザが開かない場合は `--no-open` を付けずに実行できるか確認し、必要なら URL を手動で開いてください。
- 既存の `playground.mmd` を上書きしたい場合は削除した上で再起動してください（現状 `--force` は未実装）。
- chokidar が変更を拾わない場合は OS の監視リミットやファイルロックを確認してください。
