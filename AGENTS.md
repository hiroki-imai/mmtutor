# mmtutor（MVP・Webプレビューのみ）仕様書

## 0. ゴールと非ゴール

* **ゴール**

  1. `mmtutor [topic]` 実行でローカル Web（例：`http://localhost:5678`）を自動起動。
  2. 画面は**左右 2 ペイン**：左＝教材（Markdown）、右＝Mermaid プレビュー。
  3. `playground.mmd` を**保存するたび即プレビュー更新**（SSE/WS 経由）。
  4. ブラウザ側でも最小限の**テキストエディタ（textarea）**で編集→サーバに保存可。
  5. テーマ切替（light/dark）と、サンプル差し替え（topic 切替）。

* **非ゴール（MVPではやらない）**

  * ターミナル内図示（kitty/wezterm などへの画像埋め込み）。
  * CI 画像生成（PNG/SVG の静的エクスポート）。
  * クイズ／採点などの TUI。
  * Homebrew / バイナリ配布。

---

## 1. 提供コマンドとオプション

### 1.1 CLI

```bash
mmtutor [topic]

# 例
mmtutor              # デフォルト topic=flow を起動
mmtutor seq          # シーケンス章の教材とサンプルで起動
```

### 1.2 オプション

* `--port <number>`: 既定 `5678`。使用中なら自動で次を探索。
* `--cwd <path>`: ワークスペース（`playground.mmd` を置く）基準ディレクトリ。既定は `process.cwd()`。
* `--no-open`: ブラウザ自動オープンを無効化。
* `--topic <slug>`: 明示指定（`flow|seq|class|state|er|gantt|pie|git|journey|mind|timeline|quad`）。

**期待動作**

* 初回起動時、`<cwd>/.mmtutor/` を作り、`playground.mmd` と `lesson.md`（topic別）を配置。
* 既存ファイルがある場合は**上書きしない**（`--force` は今回は実装不要）。

---

## 2. 技術スタック

* **Runtime**: Node.js ≥ 18（ESM） / TypeScript
* **CLI**: `commander`（引数パース）、`open`（ブラウザ起動）
* **Webサーバ**: `express`（または `fastify`）
* **ホット更新**: **SSE**（Server-Sent Events）推奨（実装が軽い）。WebSocket でも可。
* **ファイル監視**: `chokidar`
* **フロントエンド**:

  * `mermaid`（ブラウザで描画。**CDNは使わず**ローカル配布）
  * `marked`（レッスン Markdown → HTML）
  * `DOMPurify`（教材 HTML のサニタイズ）
  * `highlight.js`（教材側のコードハイライト）
* **バンドル**: フロント側は素の `<script type="module">` でも可（MVP）。必要なら `esbuild` で単一 JS に同梱。

**バージョン固定**

* `mermaid`: **10.x の安定版**に固定（例：`10.9.x`）。`package.json` は**厳密ピン**（`"mermaid": "10.9.x"` のように）。
* フロントの `mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' })` を使用。

---

## 3. ディレクトリ構成（パッケージ内）

```
mmtutor/
  package.json
  src/
    cli.ts
    server.ts
    watcher.ts
    lessons.ts          # 教材メタ／ルーティング
    types.ts
  web/
    index.html          # 左教材・右プレビューの2ペインUI
    client.js           # SSE受信、Mermaid描画、簡易エディタ連携
    styles.css
    vendor/
      mermaid.min.js    # ローカル配布
      marked.min.js
      dompurify.min.js
      highlight.min.js
  lessons/              # 教材MD（topic別）
    flow.md
    seq.md
    class.md
    state.md
    er.md
    gantt.md
    pie.md
    git.md
    journey.md
    mind.md
    timeline.md
    quad.md
  templates/            # 初期サンプル（topic別）
    flow.mmd
    seq.mmd
    class.mmd
    state.mmd
    er.mmd
    gantt.mmd
    pie.mmd
    git.mmd
    journey.mmd
    mind.mmd
    timeline.mmd
    quad.mmd
```

**ユーザー環境に作るもの（実行時）**

```
<cwd>/.mmtutor/
  playground.mmd   # 編集対象（監視）
  lesson.md        # レッスン本文のコピー（任意：編集可）
```

---

## 4. サーバ API とイベント

### 4.1 HTTP ルート

* `GET /` → `web/index.html` を返す（クエリ `?topic=flow` 対応）。
* `GET /static/*` → `web/` 以下の静的配信。
* `GET /api/lesson?topic=<slug>` → `{ title, markdown }` を返す（`lessons/<slug>.md` 読込）。
* `GET /api/diagram` → `{ content }`（`playground.mmd` の現在内容）。
* `POST /api/diagram` → ボディ `{ content: string }` を `playground.mmd` に保存（エディタからの保存用）。

### 4.2 SSE（Server-Sent Events）

* `GET /events`（`text/event-stream`）

  * **event: diagram** — データ：`{ content: string, ts: number }`
  * **event: topic** — データ：`{ topic: string }`（将来：教材側からのトピック切替通知用）

**監視トリガ**

* `chokidar.watch(<cwd>/.mmtutor/playground.mmd)` の変更で `diagram` を push。

---

## 5. フロントエンド UI 振る舞い（index.html / client.js）

### 5.1 レイアウト

* 左ペイン：教材（`/api/lesson?topic=...` の Markdown を `marked` で HTML 化 → `DOMPurify`）。
* 右ペイン：

  * 上部：**コードエリア（textarea）**（初期値＝`/api/diagram`）。
  * 下部：**Mermaid プレビュー**（`<div id="preview">`）。

### 5.2 イベント

* **初期化**

  1. `topic` を URL から取得（なければ `flow`）。
  2. 教材を取得して左に描画（`marked` + `highlight.js`）。
  3. `/api/diagram` を取得→textareaへ反映→`renderMermaid()`。

* **保存**

  * textarea の `input` を 300ms デバウンス→`POST /api/diagram` で保存→`renderMermaid()` 即反映。
  * ローカルエディタで変更した場合は SSE の通知で textarea とプレビューを更新。

* **描画**

  * `renderMermaid()` は毎回 `preview` 子要素をクリア→新しい ID で `mermaid.render(id, code)` を実行→SVG を差し替え。
  * エラー時は右下にエラー表示（スタックは隠し、メッセージのみ）。

* **テーマ切替**

  * `select` で `default` / `dark` を用意。`mermaid.initialize({ theme })` 再実行後に再描画。

---

## 6. 監視・保存フロー

```
[User Editor] --(save)--> playground.mmd
        chokidar 監視
               └──> server emits SSE: event "diagram" {content}
                       client EventSource onmessage
                           ├─ textarea.value = content
                           └─ renderMermaid(content)

[Browser textarea] --(debounced POST)--> /api/diagram
        server writes playground.mmd
               └──> (ローカルエディタ側も同じファイルを見る)
```

---

## 7. エラー処理・フォールバック

* サーバ起動時に `playground.mmd` が存在しなければ**topic のテンプレートをコピー**。
* ポート使用中→次の空きポート（最大 10 回試行、ダメならエラー終了）。
* Mermaid パースエラー→右ペインに**エラー枠**（赤帯）を表示。
* SSE 切断→自動再接続（EventSource 既定）。
* ファイル書込権限なし→`POST /api/diagram` は 403/500 を返し、UI で警告。

---

## 8. 受け入れ条件（Definition of Done）

* [ ] `mmtutor` 実行だけでブラウザが開き、**flow** の教材とサンプルが表示される。
* [ ] `playground.mmd` を外部エディタで編集→**1 秒未満**で右ペインが更新される。
* [ ] ブラウザの textarea を編集→**保存（自動）**で右ペインに即反映＆ファイルにも保存される。
* [ ] テーマ切替が機能（default/dark）。
* [ ] 12 topic の教材エンドポイントが応答（MD はプレースホルダでもよい）。
* [ ] Windows / macOS / Linux の Node 18+ で動作。

---

## 9. パッケージ定義（要点）

**package.json（要点のみ）**

```json
{
  "name": "@asia-quest/mmtutor",
  "version": "0.1.0",
  "type": "module",
  "bin": { "mmtutor": "dist/cli.js" },
  "engines": { "node": ">=18" },
  "dependencies": {
    "commander": "^12.0.0",
    "chokidar": "^3.6.0",
    "express": "^4.19.0",
    "open": "^10.0.0"
  }
}
```

※ フロントのライブラリ（mermaid/marked/DOMPurify/highlight.js）は `web/vendor/` に同梱して配布。

---

## 10. 主要モジュールの責務

* `src/cli.ts`

  * 引数を解釈→topic 決定、ポート確保、ワークスペース生成（`<cwd>/.mmtutor/`）。
  * `server.start({ port, cwd, topic })` を呼び、ブラウザを開く。

* `src/server.ts`

  * Express で静的配信、API、SSE を提供。
  * `watcher.ts` を初期化し、変更時に SSE 配信。
  * `GET /api/lesson` は `lessons/<topic>.md` を読み返す。
  * `GET/POST /api/diagram` は `playground.mmd` を読み書き。

* `src/watcher.ts`

  * `chokidar` で `playground.mmd` を監視し、変更内容をコールバックに渡す。

* `web/index.html / client.js / styles.css`

  * 2 ペイン UI、SSE 受信、textarea 双方向、Mermaid 描画、テーマ切替。

---

## 11. topic スラッグと初期テンプレ（`templates/*.mmd`）

MVP は**短い雛形**で OK（ユーザーが上書き前提）。

* `flow.mmd`

  ```mermaid
  flowchart TD
    A[Start] --> B{OK?}
    B -- Yes --> C[Done]
    B -- No --> A
  ```
* `seq.mmd`

  ```mermaid
  sequenceDiagram
    participant U as User
    participant S as Server
    U->>S: GET /hello
    S-->>U: 200 OK
  ```
* `class.mmd`

  ```mermaid
  classDiagram
    class Order { +id: string +total(): number }
    Order "1" *-- "many" LineItem
  ```
* `state.mmd`

  ```mermaid
  stateDiagram-v2
    [*] --> Draft
    Draft --> Published: approve
    Published --> [*]
  ```
* `er.mmd`

  ```mermaid
  erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ ORDER_ITEM : contains
    USER { string id }
  ```
* `gantt.mmd`

  ```mermaid
  gantt
    dateFormat  YYYY-MM-DD
    section Dev
    Impl      :a1, 2025-10-01, 3d
    Test      :after a1, 2d
  ```
* `pie.mmd`

  ```mermaid
  pie title Usage
    "Flow" : 45
    "Seq"  : 25
    "Other": 30
  ```
* `git.mmd`

  ```mermaid
  gitGraph
    commit
    branch feature
    checkout feature
    commit
    checkout main
    merge feature
  ```
* `journey.mmd`

  ```mermaid
  journey
    title Signup
    section Visit
      Browse: 3: User
    section Convert
      Sign up: 4: User
  ```
* `mind.mmd`

  ```mermaid
  mindmap
    root((Design))
      UI
      UX
        Research
  ```
* `timeline.mmd`

  ```mermaid
  timeline
    title Release
    2025-10 : alpha
    2025-11 : beta
    2025-12 : GA
  ```
* `quad.mmd`

  ```mermaid
  quadrantChart
    title Priorities
    x-axis Low -> High
    y-axis Urgent -> Not
    quadrant-1 Do Now
    quadrant-2 Plan
    quadrant-3 Delegate
    quadrant-4 Avoid
    "Bug#42": [0.8, 0.2]
  ```

---

## 12. 教材（`lessons/*.md`）の最低フォーマット

* 先頭にタイトルと目的（**What/When** を 3–5 行）。
* 「最小雛形」コードブロック（上記テンプレと同等）。
* よく使う 3～5 記法（箇条書き）。
* ミニ演習（1～2題）：**「playground.mmd を◯◯に書き換えよ」**という指示。
* 注意点（1～3項目）。

*例：`lessons/flow.md`（抜粋）*

````md
# Flowchart（最小セット）
目的：分岐と繰り返しを最短の記法で表現できるようになる。

## 最小雛形
```mermaid
flowchart TD
  A[Start] --> B{OK?}
  B -- Yes --> C[Done]
  B -- No --> A
````

## よく使う

* 方向: `TD` / `LR`
* ノード形: `[rect]`, `(round)`, `{diamond}`
* 矢印: `-->`, `-.->`, `==>`
* サブグラフ: `subgraph Name ... end`

## 演習

1. `B -- No --> A` を `B -->|Retry| A` に変更してみよう。
2. `C[Done]` の前に `D[Cleanup]` を挿入して直列に接続。

````

---

## 13. セキュリティ・互換性
- ローカルホストのみで待受（`127.0.0.1`）。  
- 教材 Markdown は `DOMPurify` でサニタイズ。  
- `mermaid.securityLevel = 'loose'` だが、外部リンクや script は教材では使用しない前提。  
- 文字化け対策：`<meta charset="UTF-8">`、等幅フォント指定。  

---

## 14. ロギング & デバッグ
- サーバ起動時に **起動URL** と **ワークスペースパス** を表示。  
- 監視イベント（change/add）を DEBUG ログで出力（環境変数 `DEBUG=mmtutor:*`）。  
- Mermaid レンダ失敗時はフロントに短いエラー（詳細は DevTools）。

---

## 15. 実装タスク分解（順序）

1) CLI ひな形（commander、ポート確保、open）。  
2) ワークスペース作成＆テンプレ／教材コピー。  
3) Express サーバ（静的配信、API、SSE）。  
4) chokidar 監視 → SSE 配信。  
5) フロント UI（2ペイン・marked・Mermaid・textarea・テーマ切替）。  
6) textarea → POST 保存 → 即描画。  
7) 12 topic のテンプレ・教材の雛形配置。  
8) 動作確認（Win/macOS/Linux）。  
9) README（Quick Start とトラブルシュート）。

---

## 16. README（Quick Start）ドラフト

```md
# mmtutor (MVP)
Mermaid を「手で覚える」ためのローカル教材 + ライブプレビュー。

## Install
npm i -g @asia-quest/mmtutor

## Run
mmtutor           # デフォルト：flow 章
mmtutor seq       # topic 指定

ブラウザが自動で開きます。右の textarea を編集するか、
<cwd>/.mmtutor/playground.mmd をお好みのエディタで編集してください。
保存すると即プレビューされます。
````

---

## 17. 既知の落とし穴（回避策）

* Mermaid の**バージョン差異**（timeline / quadrant の仕様変化）→ 10.x に固定し教材も 10.x 前提で書く。
* Windows のファイルロックで chokidar がイベントを落とす → `usePolling` は不要だが再現時のみ有効化。
* 大サイズ図の再描画コスト → 入力をデバウンス（300ms）。

---

## 18. 将来拡張（MVP後）

* `mmtutor export diagram.svg/png`（サーバ経由で静的生成）。
* クイズ／ドリル（TUI or Web）。
* VS Code タスク同梱。
* npx 配布、GitHub Packages（Private）、Homebrew Tap。
