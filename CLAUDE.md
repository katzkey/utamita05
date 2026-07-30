# うたみた05（次回のあなたへ）

歌詞動画制作ツール。ブラウザで編集 → JSON 保存 → After Effects で JSX 実行して main_comp を生成。

## アーキテクチャ

```
[ユーザ] ─→ [ブラウザアプリ] ─→ project.json ─→ [AE JSX] ─→ main_comp
              app/                                ae/
              Python server:8767                  build_project.jsx
```

- **編集はブラウザ**（HTML/CSS/JS + ES Modules、React 等未使用）
- **AE への反映は「エクスポート」方式**（連動じゃない）：save → 手動で JSX 実行
- **テンプレは AE の templates.aep が真実**、`scan_templates.jsx` で `templates.json` を書き出しアプリが読む

## ディレクトリ

```
app/           ブラウザアプリ
├ index.html
├ style.css
├ main.js       エントリ、タブ切替、ショートカット、renderAll
├ core/
│   ├ project.js       型と factory
│   ├ operations.js    純関数の編集操作（setLineIn 等）
│   ├ utils.js         splitChars, syncChars, deepClone
│   ├ validate.js      整合性チェック
│   └ templates_loader.js  templates.json 読込
└ ui/
    ├ state.js         getProject / setProject / subscribe
    ├ lyrics_tab.js    歌詞タブ（行リスト + 詳細）
    ├ background_tab.js
    ├ titles_tab.js
    ├ templates_tab.js
    ├ settings_tab.js  全体設定
    ├ playbar.js       下部の再生バー
    ├ file_io.js       新規/開く/保存/歌詞読込/楽曲読込
    └ tc.js            TC 変換 + ドラッグヘルパー

ae/
├ build_project.jsx     project.json → main_comp を組み立てる（本体）
├ scan_templates.jsx    templates.aep をスキャンして templates.json 出力

templates/
├ templates.aep         ★AE テンプレ本体（コンポの束）
├ templates.json        scan で自動生成、アプリが読む
└ templates.sample.json フォールバック

server.py               ローカル HTTP（8767）+ /pick-file + /file
start.bat / stop.bat
docs/                   PPT 3種（セットアップ / 使い方 / テンプレ作り方）
make_dist.py            配布 zip 生成
```

## テンプレ命名規則（超重要）

| 先頭 | slot | 用途 |
|---|---|---|
| `_entry_*`  | entry  | 文字の入りモーション |
| `_hold_*`   | hold   | 保持中のモーション |
| `_exit_*`   | exit   | 文字の出モーション |
| `_design_*` | design | 見た目（色・エフェクト・フォント） |
| `_title_*`  | title  | タイトル演出（precomp まるごと） |

先頭 `_` が無ければスキャン対象外 → 素材コンポと同居 OK。

## Design テンプレの内部構造

- コンポ内に `lv0` `lv1` `lv2` `lv3` の 4 レイヤ（強調レベル別）
- 各 lv レイヤはテキスト「あ」+ 色 / Effects / フォント
- Transform は触らない（Motion 側）
- **line モード** ではデザインテンプレ内の他レイヤも装飾として全コピーされ、text レイヤに親付け

## Title テンプレの内部構造

- 中の「`_target`」という名前のレイヤがユーザ入力で差替わる
  - フッテージレイヤ → `title.file`（画像/動画）で `replaceSource`
  - テキストレイヤ → `title.text` でテキスト上書き
- 他のレイヤは装飾/調整として保持
- 複製 → 差替 → precomp として main_comp 配置
- tOut が指定されてれば `layer.stretch` で時間ストレッチ

## データモデルの要点

- `Char.ch`（`.text` じゃない）で 1 文字保持
- `Line.template.{entry,hold,exit,design}` は null で project.defaults 継承、非null で固定
- `Line.layerMode`: `"char"` / `"line"` / null（project.defaults.layerMode 継承）
- `Line.stagger`: 秒/文字（0 = 同時、正で kana-by-kana）
- `Line.tracking`: カーニング調整（負で詰め、正で開き）
- `Line.emphasis`: `[{text, level, occurrence}]` 部分文字列マッチで char に Lv 反映
- `Title.template`: null なら従来配置、指定なら precomp
- `Title.file`: 画像/動画パス。`_target` がフッテージなら差替対象
- ID は auto-increment、再利用しない

## build_project.jsx の要点

- 起動時に AE プロジェクトに `_*_*` コンポが無ければ `../templates/templates.aep` を自動 import
- テンプレコンポは `compsByName` にキャッシュ
- `placeLineAsChars` / `placeLineAsSingleLayer` で layerMode に応じて分岐
- **char モードは単一パス**（sourceRect 2 パスは動作不安定で reverted）
- キーフレは補間タイプ・時間イーズ・空間タンジェント・次元分割全部対応
- `setPositionRobust` / `safeRemoveAllKeys` で dimensionsSeparated 対策

## 既知の制約 / 決定事項

- **Design テンプレのキーフレは絶対時刻**で転写されるので、意図通りに動かない（**C 案：Design は静的前提**という規約に落着）
- **モーションテンプレの Effects は転写されない**（Transform 系のみ）
- **char モード × Lv 混在**でカーニングが完璧に合わない（fontSize ベースの単純計算）
  - 2 パス化を試みたが text 上書き経由の sourceRect 取得で不安定になり revert 済み
- **フォントはアプリ側で指定**（05 で変更）：
  - `dump_ae_fonts.jsx` を AE で1回実行 → `ae/ae_fonts.json` に AE フォント一覧（592件・日本語名＋PS名）を書き出す
  - アプリは `ae_fonts.json` を読み、ドロップダウンに**日本語名（nativeFullName）で表示**、**保存値は postScriptName**
  - JSX ビルド時は `td.font = PS名` をそのままセット（`resolveFontToPostScript` は旧データ互換のフォールバック）
  - フォント追加時：Windows にインストール → AE 再起動 → `dump_ae_fonts.jsx` 再実行だけ
  - **AE 26 の罠**：`app.fonts.allFonts` は**2次元配列**（`all[i][j]` が Font）、`td.fontFamily` は read-only、`getFontsByFamilyNameAndStyleName` は**配列**を返す、日本語エイリアス名（"游ゴシック"等）は lookup 不可
- **AE 26 の最重要罠：`copyToComp` は選択レイヤの上に挿入する**（最上位とは限らない）
  - `mainComp.layer(1)` を「今のコピー」と決め打ちすると、**既存レイヤを乗っ取って上書き**する（前行の最後の文字が消えるバグの原因だった）
  - 必ず `copyLayerToMain()`（コピー前後の layer id 差分で新規レイヤを特定 + moveToBeginning）を使う
  - `layers.addShape()` 等で作ったレイヤは**選択状態が残る** → 作成後に `selected = false` 必須
  - プレビュー（ブラウザ）は `cssFamilyFor()` で PS名 → nativeFamilyName に変換して CSS に使う
- **ジッター（Line.jitter）**：行内の単語ブロック単位でランダム位置オフセット（05 で追加）
  - `{enabled, seed, maxDx, maxDy}`
  - `Line.text` 中の `/` がブロック区切り。`/` 無しなら行全体 = 1 ブロック
  - `splitChars` が `/` を除外するので `Line.chars` には `/` が入らない = emphasis マッチや AE 側は無影響
  - 乱数は mulberry32、`(seed, key=((line.id+1)*1000 + blockIndex))` で決定的
  - `Math.imul` 使用必須（32bit 乗算じゃないと app/JSX で結果ズレる）
  - **char モードのみ対応**（AE 側 line モードは非対応、プレビューは line モードでも見える）
  - 座布団 follow との併用時、座布団は最初の文字（＝ジッター込みの位置）に親付けされるので座布団も一緒にズレる（意図的）
  - **画面境界クランプ**：各ブロックの端（ブロック半幅 + 半文字余白）が画面内に収まるよう自動でオフセットを縮める
  - **`preventOverlap`**：ON でブロック同士の重なりを禁止し歌詞順を維持（左→右 or 上→下の Greedy Push）。OFF ならブロックは独立にランダム
- **座布団（Line.zabuton）**：行単位のパラメトリック背景（05 で追加）
  - `{enabled, shape(rect/round/pill/circle), color, opacity, paddingX, paddingY, cornerRadius, timingMode, mode(fill/stroke), strokeWidth, perBlock}`
  - JSX で Shape Layer 生成、テキストレイヤ直下に配置
  - `timingMode: "follow"`（デフォルト）= 親付けで文字と一緒に動く / `"static"` = 独立フェード（0.3s）
  - `mode: "fill"` = 塗り / `"stroke"` = 枠だけ（strokeWidth px）。プレビューは box-shadow inset で表現
  - `perBlock: true` = ジッター区切り `/` ごとに 1 個ずつ敷く（char モードのみ）
  - サイズ推定：line モードは sourceRectAtTime、char モードは totalWidth × maxCharSize×1.2
  - カスタム形状は非対応（必要なら design テンプレの装飾レイヤで）
- **タイトル素材はアルファ付き想定**、`moveToEnd` しないで背景の上に配置
- **z 順**（main_comp 上→下）：char/text > title text/sub > title precomp / title material > bg > music

## サーバ（server.py）

- `/pick-file?accept={any|image|video|audio|image,video|json}` → PowerShell OpenFileDialog で絶対パス取得
  - WinForms なので `-STA` 必須、Owner form で TopMost 制御
- `/file?path=<abs>` → 任意パスのファイルを Range 対応でストリーミング（audio/video 再生用）

## ワークフロー変更履歴（決定の流れ）

1. Phase 4：AE 連動 → **エクスポート方式に切替**（連動は Preview なしで管理コスト高）
2. Design にキーフレ動的シフト → **やめる（静的規約）**
3. char モード 2 パスカーニング → **単一パスに revert**（挙動不安定）
4. 「テンプレ + テキスト」併用 → **text/subtext は precomp の上に別レイヤで積む**
5. TC ドラッグは `0.25秒/4px`（デフォルト）、`Shift=1F`、`Ctrl=1秒`
6. **再生 timeupdate では setUi しない**（全 UI 再レンダで行クリック不安定になってた）
7. **ループ範囲は timeupdate 毎に line から引き直す**（TC 編集が即反映）

## 開発ワークフロー

- 変更したら Ctrl+Shift+R でハードリロード（ES Module キャッシュ回避）
- サーバ起動：`start.bat` or `python server.py`
- サーバ停止：`stop.bat` or Ctrl+C
- AE 側：`build_project.jsx` を「ファイル→スクリプト→スクリプトファイルを実行」
- テンプレ変更後は `scan_templates.jsx` を1回実行して `templates.json` 更新
- 配布 zip：`python make_dist.py`

## ペンディング / 将来やりたいこと

- Lv 混在時のカーニング精度向上（sourceRect 2 パス再挑戦 or 手動係数）
- タイトルテンプレ・素材テンプレのサンプル充実
- 「AE でビルド」ボタン（アプリ側リマインダー）… 現状未実装
- モーションテンプレを 3 スロット統合（B 案）— 提案してユーザ OK もらった状態、実装保留
- 配布 exe 化（PyInstaller）

## ユーザとの対話スタイル

- 日本語
- 簡潔・的確に。修正実装は即やる、大きな設計変更は提案 → OK 待ち
- コード変更はミニマムに（他をいじらない）
- 「〜のスライドを作りたい」等はスキル（pptx / xlsx / docx）で対応
