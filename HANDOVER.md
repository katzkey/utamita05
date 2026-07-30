# うたみた05 → 05 ハンドオーバー

うたみた05 は動作する状態。うたみた05 として複製した後、この文書 + `CLAUDE.md` を新しい Claude Code スレッドに読ませて続きから始められる。

---

## 直近の状態

**アプリ側**：問題なく動く（ブラウザで編集 → 保存できる）

**AE 側**：`build_project.jsx` 実行で main_comp が組まれる。テンプレ自動 import、precomp タイトル、Lv 別強調、ストレッチ、次元分割 Position、イーズ転写まで実装済み

**配布**：`utamita05_20260702.zip` を親フォルダに生成済み（約 200KB）

---

## 完了済みタスク（総 47件）

主な機能で分類：

### コア
- データモデル + operations（純関数）
- Undo/Redo、Ctrl+S 保存、開く / 新規
- 歌詞ファイル読込（テキスト）
- ES Module ベース、Python http.server + `/pick-file` + `/file`

### 歌詞
- 行 CRUD、分割 (Ctrl+/)、結合 (Ctrl+J)、削除、TC マーク (I/O)
- 詳細パネル：テキスト / TC / モーション各 slot（固定チェック）/ Design / フォント / 配置 / 強調 / メモ
- 強調：`ふたり:2` みたいなスペックで部分文字列に Lv 適用
- 文字単位の開始ずらし（stagger）
- 行 layerMode（char / line）
- TC 逆転検知（赤ハイライト + ⚠ バッジ）
- 再生バー：▶ / ループ / マーキング / I / O / スクラブ

### 背景
- 画像・動画・単色（カラーピッカー付き）
- fadeIn / fadeOut / fit / blend / opacity
- 新規追加時は tOut = 曲尺、前の bg の tOut から連続

### タイトル
- タブ独立、テキスト + サブテキスト + 素材 + テンプレ
- 素材はアルファ付き動画/画像可、fadeIn/Out、opacity
- テンプレ機能：`_title_*` コンポを複製 → `_target` レイヤを差替 → precomp 配置
- `_target` が text / footage どちらでも自動判別
- 複数 `_target` 全置換
- tIn/tOut 指定で precomp を時間ストレッチ

### テンプレ
- `scan_templates.jsx` で templates.aep から `_entry_*` / `_hold_*` / `_exit_*` / `_design_*` / `_title_*` を検出
- アプリのドロップダウンに反映
- コメント欄が displayName、duration も拾う
- 配布フォルダの `templates/templates.aep` から自動 import

### AE ビルド
- `build_project.jsx`：main_comp をフルビルド（毎回全レイヤ削除→再構築）
- Entry/Hold/Exit のキーフレ転写（Transform 系のみ、次元分割対応、補間・イーズ・空間タンジェント全部）
- Design レイヤコピー（char モードは lv0〜3 単一、line モードは全レイヤ + 親付け）
- Title precomp
- 楽曲を音声レイヤとして自動配置
- 背景（画像/動画/単色）を最下層に配置

### 配布 / ドキュメント
- PPT 3種（セットアップ / 使い方 / テンプレ作り方）
- `make_dist.py` で個人設定除外の配布 zip

---

## 未完了 / 保留

| 項目 | 状態 | メモ |
|---|---|---|
| モーションテンプレ B 案（Entry/Hold/Exit → Motion 1 スロット統合） | 提案 → OK 済み | AE 側テンプレの整備が一段落してからにする話で保留 |
| Lv 混在時のカーニング精度向上 | 保留 | 2 パス再挑戦 or 手動係数の 2 択、優先度低 |
| アプリの「AE でビルド」ボタン | 未着手 | 手順リマインダーだけの UI |
| 配布 exe 化（PyInstaller） | 未着手 | 需要出てきたら |

---

## 既知の癖

- **Design テンプレのキーフレ**は転写時に絶対時刻で運ばれるため意図通り動かない → 「Design は静的」規約
- **モーションテンプレの Effects** は転写されない（Transform 系のみ）
- **Char モード + Lv 混在** で若干カーニングがズレる（許容範囲）
- **ES Module のブラウザキャッシュ**：コード変更後は Ctrl+Shift+R 必須
- **サーバ停止時に audio 要素が壊れる**：復帰後リロード推奨

---

## 05 で最初にやりたいこと候補

作業テーマの例（05 で追加/改善したいこと。何もなければユーザ判断）：

- モーションテンプレ B 案の統合実施
- カーニング精度上げ（sourceRect 2 パス再挑戦）
- 「AE でビルド」ボタン実装
- タイトル・design のプリセット追加
- 新機能：kana-by-kana 表示のプリセット、字幕連動、コーラス強調 等

---

## 05 でフォルダコピー時の注意

```
1. C:\...\projects\うたみた05 を C:\...\projects\うたみた05 に複製
2. 05 の中で以下を削除（個人設定 / キャッシュ）：
   - ae/build_project.settings.txt
   - templates/templates.json（scan で再生成）
   - .claude/（Claude Code キャッシュ）
3. 04 と同時起動するなら server.py のポートを変更（8767 → 8768 等）
   - server.py, start.bat, stop.bat の 8767 を書き換え
   - app 側は同一オリジンで動くので影響なし
4. 新しい Claude Code スレッドで cd C:\...\うたみた05
5. CLAUDE.md が自動読込されて開始
```

---

## ドキュメント / 参考

- `CLAUDE.md`：アーキ / 規約 / 決定事項（毎回 Claude が読む）
- `docs/00_overview.md` 〜 `06_roadmap.md`：初期設計文書
- `docs/utamita05_setup_Lv1.pptx`：新規ユーザ配布用セットアップ手順
- `docs/utamita05_usage.pptx`（`_v2` はスクショ入り）：使い方
- `docs/utamita05_templates.pptx`：テンプレの作り方

以上。
