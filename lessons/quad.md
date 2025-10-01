# Quadrant Chart（優先度マトリクス）
目的：重要度と緊急度を 2 軸で整理し、対応順の意思決定を支援する。

## 最小雛形
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

## よく使う
- 軸ラベル：`x-axis A -> B`、`y-axis C -> D`
 - 軸ラベル：`x-axis A --> B`、`y-axis C --> D`
- 象限名：`quadrant-1 名称` の形式で定義
- プロット：`"項目": [x, y]`
- 色変更：`class` 機能は未対応のためコメントで補足

## 演習
1. 新しい項目 `"Feature"` を `[0.4, 0.6]` で追加し、優先度を調整しよう。
2. `Bug#42` の位置を `[0.9, 0.1]` に変更し、緊急度を上げたケースを描いてみる。

## 注意
- 座標は 0〜1 の範囲で指定する。範囲外だと描画が崩れる。
- ラベルには必ず引用符を付けること。
