# うたみた05

リリックビデオ制作の編集アプリ（v03 の後継、設計を一新）。

## v04 の方針

- **データモデル先行**：編集対象の構造を最初に固める
- **AE連動は最後（Phase 4）**：先に編集体験を完成させ、AE反映は「データモデルを写すだけ」のレンダラーとして実装
- **テンプレートレイヤー方式**：動きは AE 上のテンプレコンポを複製して適用（コードではない）
- **キーフレストレッチ無し**：行のIN/OUTが変わってもテンプレの内部キーフレ自体は固定

## v03 との違い

| | v03 | v04 |
|---|---|---|
| 開発順 | UI と AE 連動を並行 | データモデル → UI → プレビュー → AE |
| 動きの作り方 | コード（apply.jsx）で setValueAtTime | AE上でレイヤを作って duplicate |
| 行のID | line_idx（番号） | 内部 ID（auto-increment、再利用しない） |
| AE 連動の責務 | アプリ全体に分散 | renderers/ae.js に集約 |

## フォルダ構成

```
うたみた05/
├── README.md                  このファイル
├── docs/                      設計ドキュメント
│   ├── 00_overview.md         方針・全体像
│   ├── 01_data_model.md       データ型定義
│   ├── 02_operations.md       編集操作の純関数
│   ├── 03_templates.md        Entry/Hold/Exit テンプレ
│   ├── 04_ui.md               UI設計
│   ├── 05_renderers.md        プレビュー & AE レンダラー
│   └── 06_roadmap.md          Phase 0〜5 のチェックリスト
├── app/
│   ├── core/                  データモデル + 操作（純粋ロジック、UI/AE非依存）
│   ├── ui/                    UI 層
│   ├── audio/                 楽曲再生
│   └── renderers/             描画先別の実装
├── ae/
│   ├── listener.jsx           AE側エントリ（Phase 4 で作る）
│   └── handlers/              命令別ハンドラ
├── templates/                 templates.aep を置く
└── input/                     楽曲・歌詞・背景素材
```

## 続きを始める時の順番

1. `docs/00_overview.md` で全体像を再確認
2. `docs/06_roadmap.md` でどのフェーズか確認
3. 各フェーズに対応する docs/ を参照しながら実装
