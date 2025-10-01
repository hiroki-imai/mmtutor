# 優先度マトリクス入門

## 目的
- `quadrantChart` でタスクの重要度・緊急度を手で調整し、座標の意味を理解する。
- 指示どおりに `playground.mmd` を差し替えて、プロット位置の変化を確認する。

## スタートコード
以下を `playground.mmd` に貼り付けて保存してください。

```mermaid
quadrantChart
  title Priorities
  x-axis Low --> High
  y-axis Urgent --> Not
  quadrant-1 Do Now
  quadrant-2 Plan
  quadrant-3 Delegate
  quadrant-4 Avoid
  "Bug#42": [0.8, 0.2]
```

---

### ハンズオン1: タイトルと軸ラベルを日本語にする
1. コードを次の内容に置き換えてください。

```mermaid
quadrantChart
  title 優先度マトリクス
  x-axis 低 --> 高
  y-axis 緊急 --> 非緊急
  quadrant-1 今すぐ対応
  quadrant-2 計画的に
  quadrant-3 任せる
  quadrant-4 後回し
  "バグ修正": [0.8, 0.2]
```

2. タイトルと軸ラベルが日本語に変わっていることを確認しましょう。

---

### ハンズオン2: 複数アイテムをプロットする
1. 上記コードを以下に置き換え、案件を増やします。

```mermaid
quadrantChart
  title 優先度マトリクス
  x-axis 低 --> 高
  y-axis 緊急 --> 非緊急
  quadrant-1 今すぐ対応
  quadrant-2 計画的に
  quadrant-3 任せる
  quadrant-4 後回し
  "バグ修正": [0.8, 0.2]
  "新機能要望": [0.5, 0.6]
  "ドキュメント整備": [0.3, 0.8]
```

2. 3 点が配置され、それぞれの象限が異なることを確認しましょう。

---

### ハンズオン3: 位置を調整して優先度を再評価する
1. 最後に以下のコードへ置き換えてください。

```mermaid
quadrantChart
  title 優先度マトリクス
  x-axis 低 --> 高
  y-axis 緊急 --> 非緊急
  quadrant-1 今すぐ対応
  quadrant-2 計画的に
  quadrant-3 任せる
  quadrant-4 後回し
  "バグ修正": [0.9, 0.15]
  "新機能要望": [0.6, 0.6]
  "ドキュメント整備": [0.25, 0.9]
  "調査タスク": [0.4, 0.4]
```

2. 座標を変更すると点の位置が動き、優先度の評価が視覚的に変わることを確認してください。

---

## 振り返り
- `x-axis` / `y-axis` は矢印の向きとラベルを一行で定義する。
- 座標は 0〜1 の範囲で指定し、0 が左/下、1 が右/上を意味する。
- 点を追加・位置変更するだけでチームの優先度の捉え方を即座に共有できる。
