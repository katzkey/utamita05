// build_project.jsx
// AE ExtendScript の一部バージョンには JSON が無いためポリフィルを読み込む
//@include "lib/json2.jsx"
#include "lib/json2.jsx"
// うたみた05 のプロジェクトJSON (.utamita.json) を読み、
// 現在開いているAEプロジェクト (= templates.aep) 内に main_comp をフルビルドする。
//
// 使い方：
//   1. AEで templates.aep を開く
//   2. ファイル > スクリプト > スクリプトファイルを実行 > build_project.jsx
//   3. 初回は project.json をファイルダイアログで選択
//   4. 2回目以降は前回のパスを記憶（再選択するには Shift キーを押しながら実行）
//
// 段階：
//   4a：読込・バリデーション・件数表示              ← 済
//   4c：文字レイヤ配置（テンプレ転写なし）          ← 今ここ
//   4b：背景レイヤ配置                              ← 後で
//   4d：Entry/Hold/Exit キーフレ転写                ← 後で
//   4e：強調レベル対応（lv1〜3）                    ← 後で
//
// 現状の制限：
//   - 動きはまだ無い（Entry/Hold/Exit のキーフレは転写しない）
//   - 強調レベルは lv0 固定（emphasisLevel は無視）
//   - 背景は配置しない
//   - レイアウトは水平センタリングのみ

(function () {
    // ==========================================================
    // 設定
    // ==========================================================
    var SETTINGS_FILE = File($.fileName).parent.fsName + "/build_project.settings.txt";
    var MAIN_COMP_NAME = "main_comp";
    var DEFAULT_EMPHASIS_LAYER = "lv0";

    // Transform 系プロパティ（モーション転写対象）
    // 巻き上げ問題回避のため先頭で初期化
    var TRANSFORM_PROPS = [
        { matchName: "ADBE Position",   kind: "position" },
        { matchName: "ADBE Scale",      kind: "value" },
        { matchName: "ADBE Rotate Z",   kind: "value" },
        { matchName: "ADBE Opacity",    kind: "value" }
    ];

    // ==========================================================
    // 前提チェック
    // ==========================================================
    var proj = app.project;
    if (!proj) {
        alert("AE プロジェクトが取得できません。AE を起動してから実行してください。");
        return;
    }
    // proj.file が null（保存前の新規プロジェクト）でも OK。テンプレは自動 import される。

    // ==========================================================
    // project.json 取得
    // ==========================================================
    // ファイル選択ダイアログを 1 回だけ開く。前回ファイルがあればその場所から。
    var jsonPath = loadLastPath();
    var jsonFile;
    var prevFile = jsonPath ? new File(jsonPath) : null;
    if (prevFile && prevFile.exists) {
        // 前回ファイルの場所を初期位置に。キャンセルされたらそのまま終了。
        jsonFile = prevFile.openDlg(
            "うたみた05 プロジェクト JSON を選択",
            "JSON files:*.json;All files:*.*"
        );
    } else {
        jsonFile = File.openDialog(
            "うたみた05 プロジェクト JSON を選択",
            "JSON files:*.json;All files:*.*"
        );
    }
    if (!jsonFile) return;
    saveLastPath(jsonFile.fsName);
    jsonFile.encoding = "UTF-8";
    if (!jsonFile.open("r")) {
        alert("project.json が開けません: " + jsonFile.fsName);
        return;
    }
    var jsonText = jsonFile.read();
    jsonFile.close();
    var data;
    try {
        data = JSON.parse(jsonText);
    } catch (e) {
        alert("project.json のパース失敗:\n" + e.toString());
        return;
    }
    if (!data || typeof data !== "object") {
        alert("project.json が不正です");
        return;
    }

    // ==========================================================
    // テンプレ一覧（コンポ名 → CompItem）
    // 現プロジェクトに無ければ templates.aep を自動 import
    // ==========================================================
    function detectSlot(name) {
        if (name.indexOf("_entry_") === 0)  return "entry";
        if (name.indexOf("_hold_") === 0)   return "hold";
        if (name.indexOf("_exit_") === 0)   return "exit";
        if (name.indexOf("_design_") === 0) return "design";
        if (name.indexOf("_title_") === 0)  return "title";
        return null;
    }
    function countTemplates() {
        var n = 0;
        for (var i = 1; i <= proj.numItems; i++) {
            var it = proj.item(i);
            if (it instanceof CompItem && detectSlot(it.name)) n++;
        }
        return n;
    }

    // テンプレが現プロジェクトに無ければ、隣の templates フォルダから自動取込
    if (countTemplates() === 0) {
        var defaultPath = File($.fileName).parent.parent.fsName + "/templates/templates.aep";
        var aepFile = new File(defaultPath);
        if (!aepFile.exists) {
            // 既定パスに無ければユーザに選ばせる
            aepFile = File.openDialog("templates.aep を選択してください", "AE Project:*.aep");
        }
        if (aepFile && aepFile.exists) {
            try {
                proj.importFile(new ImportOptions(aepFile));
            } catch (eImp) {
                alert("templates.aep の取込に失敗:\n" + eImp.toString());
            }
        } else {
            alert("templates.aep が見つかりません。配布フォルダの templates/ 配下に置くか、ダイアログでパスを指定してください。");
        }
    }

    var compsByName = {};
    for (var i = 1; i <= proj.numItems; i++) {
        var it = proj.item(i);
        if (it instanceof CompItem && detectSlot(it.name)) compsByName[it.name] = it;
    }

    // ==========================================================
    // 主要データ
    // ==========================================================
    var lines = data.lines || [];
    var bgs = data.backgrounds || [];
    var defaultsTmpl = (data.defaults && data.defaults.template) || {};
    var projFont = data.font || {};
    var fps = data.fps || 30;
    var resW = (data.resolution && data.resolution.w) || 1080;
    var resH = (data.resolution && data.resolution.h) || 1920;

    // ==========================================================
    // 参照テンプレ確認
    // ==========================================================
    function resolveLineTemplate(line) {
        var t = line.template || {};
        return {
            entry:  t.entry  || defaultsTmpl.entry,
            hold:   t.hold   || defaultsTmpl.hold,
            exit:   t.exit   || defaultsTmpl.exit,
            design: t.design || defaultsTmpl.design
        };
    }
    function resolveCharTemplate(ch, line) {
        var base = resolveLineTemplate(line);
        return {
            entry:  ch.overrideEntry  || base.entry,
            hold:   ch.overrideHold   || base.hold,
            exit:   ch.overrideExit   || base.exit,
            design: ch.overrideDesign || base.design
        };
    }

    // ==========================================================
    // duration 推定
    // ==========================================================
    var duration = (data.music && data.music.duration > 0) ? data.music.duration : 0;
    if (duration <= 0) {
        for (var di = 0; di < lines.length; di++) {
            if (lines[di].tOut && lines[di].tOut > duration) duration = lines[di].tOut;
        }
        duration = Math.max(duration + 1, 5);
    }

    // ==========================================================
    // main_comp 準備
    // ==========================================================
    var mainComp = null;
    for (var mi = 1; mi <= proj.numItems; mi++) {
        var it2 = proj.item(mi);
        if (it2 instanceof CompItem && it2.name === MAIN_COMP_NAME) {
            mainComp = it2;
            break;
        }
    }

    app.beginUndoGroup("うたみた05 ビルド");
    try {
        if (mainComp) {
            // 既存をクリア
            while (mainComp.numLayers > 0) mainComp.layer(1).remove();
            mainComp.frameRate = fps;
            mainComp.width = resW;
            mainComp.height = resH;
            try { mainComp.duration = duration; } catch (e) {}
        } else {
            mainComp = proj.items.addComp(MAIN_COMP_NAME, resW, resH, 1, duration, fps);
        }

        var stats = { placed: 0, bgPlaced: 0, skippedLines: 0, skippedChars: 0, errors: [], perLine: {} };

        // ==========================================================
        // 背景レイヤ配置（先にやって最下層に置く）
        // ==========================================================
        var jsonDir = jsonFile.parent.fsName;
        placeBackgrounds(bgs, jsonDir, stats);

        // ==========================================================
        // 楽曲ファイル取り込み（オーディオレイヤとして配置）
        // ==========================================================
        placeMusic(data.music || {}, jsonDir, stats);

        // ==========================================================
        // タイトル配置（素材＋テキストレイヤ）
        // ==========================================================
        placeTitles(data.titles || [], jsonDir, stats);

        // ==========================================================
        // 文字レイヤ配置
        // ==========================================================
        for (var li = 0; li < lines.length; li++) {
            var ln = lines[li];
            if (ln.skip) { stats.skippedLines++; continue; }
            if (ln.tIn == null || ln.tOut == null) {
                stats.errors.push("行 " + ln.id + ": tIn/tOut 未設定");
                continue;
            }
            if (ln.tOut <= ln.tIn) {
                stats.errors.push("行 " + ln.id + ": tOut (" + ln.tOut.toFixed(3) + "s) が tIn (" + ln.tIn.toFixed(3) + "s) 以下、スキップ");
                continue;
            }
            placeLine(ln, stats);
        }

        // ==========================================================
        // サマリー
        // ==========================================================
        var msg = "うたみた05 ビルド完了\n";
        msg += "─────────────────────\n";
        msg += "main_comp: " + resW + "x" + resH + " / " + fps + "fps / " + duration.toFixed(2) + "s\n";
        msg += "配置文字レイヤ: " + stats.placed + "\n";
        msg += "配置背景: " + stats.bgPlaced + "\n";
        msg += "配置タイトル: " + (stats.titlePlaced || 0) + "\n";
        msg += "楽曲: " + (stats.musicPlaced ? "配置済" : "なし") + "\n";
        if (stats.skippedLines > 0) msg += "スキップ行: " + stats.skippedLines + "\n";
        if (stats.skippedChars > 0) msg += "スキップ文字: " + stats.skippedChars + "\n";
        if (stats.errors.length > 0) {
            msg += "\nエラー (" + stats.errors.length + "):\n  ";
            msg += stats.errors.slice(0, 20).join("\n  ");
            if (stats.errors.length > 20) msg += "\n  ...他 " + (stats.errors.length - 20) + " 件";
        }
        // 期待数と実際数の差分（配置0 or 一部欠け）
        var shortLines = [];
        for (var lIdx = 0; lIdx < data.lines.length; lIdx++) {
            var lnRep = data.lines[lIdx];
            if (lnRep.skip) continue;
            var cnt = stats.perLine[lnRep.id] || 0;
            var expected = 0;
            if (lnRep.chars && lnRep.chars.length) {
                for (var ecI = 0; ecI < lnRep.chars.length; ecI++) if (!lnRep.chars[ecI].skip) expected++;
            } else if (lnRep.text) {
                expected = lnRep.text.length;
            }
            if (cnt < expected) shortLines.push("行 " + lnRep.id + "（期待 " + expected + " / 配置 " + cnt + "）: " + (lnRep.text || "").substring(0, 20));
        }
        if (shortLines.length > 0) {
            msg += "\n\n文字数不足の行:\n  " + shortLines.join("\n  ");
        }
        if (stats.zabInfo && stats.zabInfo.length > 0) {
            msg += "\n\n座布団配置:\n  " + stats.zabInfo.slice(0, 6).join("\n  ");
            if (stats.zabInfo.length > 6) msg += "\n  ...他 " + (stats.zabInfo.length - 6) + " 行";
        }

        // 診断：文字ごとの処理ログを build_debug.txt に書き出し
        try {
            if (stats.charLog && stats.charLog.length) {
                var dbgFile = new File(File($.fileName).parent.fsName + "/build_debug.txt");
                dbgFile.encoding = "UTF-8";
                dbgFile.open("w");
                dbgFile.write(stats.charLog.join("\n"));
                dbgFile.close();
            }
        } catch (eDbg) {}

        // 診断：main_comp の全レイヤを build_layers.txt に書き出し
        try {
            var dumpLines = [];
            dumpLines.push("main_comp layers: " + mainComp.numLayers);
            for (var dli = 1; dli <= mainComp.numLayers; dli++) {
                var dl = mainComp.layer(dli);
                var pos = "";
                try {
                    var pv = dl.property("ADBE Transform Group").property("ADBE Position").value;
                    pos = Math.round(pv[0]) + "," + Math.round(pv[1]);
                } catch (eDP) { pos = "?"; }
                var op = "";
                try { op = Math.round(dl.property("ADBE Transform Group").property("ADBE Opacity").valueAtTime((dl.inPoint + dl.outPoint) / 2, false)); } catch (eDO) { op = "?"; }
                dumpLines.push(dli + "\t" + dl.name + "\tin=" + dl.inPoint.toFixed(2) + "\tout=" + dl.outPoint.toFixed(2) + "\tpos=" + pos + "\top@mid=" + op);
            }
            var dumpFile = new File(File($.fileName).parent.fsName + "/build_layers.txt");
            dumpFile.encoding = "UTF-8";
            dumpFile.open("w");
            dumpFile.write(dumpLines.join("\n"));
            dumpFile.close();
        } catch (eDump) {}
        var resolvedList = getFontResolvedSummary();
        if (resolvedList.length > 0) {
            msg += "\n\nフォント解決成功 (" + resolvedList.length + " 件):\n  ";
            msg += resolvedList.join("\n  ");
        } else {
            msg += "\n\n※ フォント解決関数が1回も呼ばれてない（override 未指定 or project.font 未設定）";
        }
        var fallbackNames = getFontFallbackNames();
        if (fallbackNames.length > 0) {
            msg += "\n\nフォント解決失敗 (" + fallbackNames.length + " 件・design テンプレのフォントのまま):\n  ";
            msg += fallbackNames.join("\n  ");
            msg += "\n※ AE に無いフォント名。英語名で選び直してください。";
        }
        alert(msg);

    } catch (eOuter) {
        alert("ビルド中に例外:\n" + eOuter.toString());
    } finally {
        app.endUndoGroup();
    }

    // ==========================================================
    // テンプレ規約（C 案）：
    //   design テンプレは「静的」前提。動きは motion テンプレで扱う。
    //   design レイヤ内に Effects 等のキーフレを打っても、現状の時刻シフト無しで
    //   絶対時刻のまま転写されるので意図通りに動かない（既知）。
    //
    // 1コンポ内のレイヤ構造（新規推奨）：
    //   - 最上位レイヤ = 文字レイヤ
    //   - それより下のレイヤ = 装飾（背景プレート、下線、グロー用シェイプ等）
    //
    // line モードで上記構造を検知すると：
    //   - 全レイヤを main_comp にコピー
    //   - 装飾は文字レイヤに親付けして、追従するように
    //   - 装飾の位置は文字レイヤからの相対オフセットで保持
    //
    // レガシー（lv0/lv1/lv2/lv3 の複数レイヤを1コンポに同居させた）の場合は、
    // 指定 Lv の1レイヤだけコピー（装飾なし、従来挙動）。
    // ==========================================================

    // 1コンポ内に lv* レイヤが複数 → レガシー方式と判定
    function isLegacyMultiLvComp(designComp) {
        var n = 0;
        for (var i = 1; i <= designComp.numLayers; i++) {
            if (/^lv[0-3]$/.test(designComp.layer(i).name)) n++;
            if (n >= 2) return true;
        }
        return false;
    }

    // 新方式：design 全レイヤをコピー、最上位を text として、他は text にペアレント
    // 戻り値: { textLayer, decorationLayers: [] }
    function copyDesignWithDecorations(designComp) {
        var n = designComp.numLayers;
        if (n === 0) return null;

        // 元位置を先に控える（コピー後は別オブジェクトになる）
        var origPositions = [];
        for (var i = 1; i <= n; i++) {
            var pp = null;
            try { pp = designComp.layer(i).property("ADBE Transform Group").property("ADBE Position"); } catch (e) {}
            origPositions[i] = pp ? pp.value : [designComp.width / 2, designComp.height / 2];
        }

        // 下から順にコピー → main_comp 最上位が design の最上位（=text）になる
        var copied = [];
        for (var k = n; k >= 1; k--) {
            copied.unshift(copyLayerToMain(designComp.layer(k)));
        }

        var textLayer = copied[0];
        var textOrigPos = origPositions[1];  // design 最上位 = index 1
        var decorationLayers = [];

        for (var j = 1; j < copied.length; j++) {
            var dec = copied[j];
            var decOrigPos = origPositions[j + 1];
            var relX = decOrigPos[0] - textOrigPos[0];
            var relY = decOrigPos[1] - textOrigPos[1];

            try { dec.parent = textLayer; } catch (eP) {}
            setPositionRobust(dec, [relX, relY]);
            decorationLayers.push(dec);
        }

        return { textLayer: textLayer, decorationLayers: decorationLayers };
    }

    // ==========================================================
    // 1行分の配置：layerMode で分岐
    // ==========================================================
    function placeLine(line, stats) {
        var defaultMode = (data.defaults && data.defaults.layerMode) || "char";
        var mode = (line.layerMode === "char" || line.layerMode === "line") ? line.layerMode : defaultMode;
        // 縦組み（vl_/vc_/vr_）は char モード専用：line モード指定でも char で配置
        if (isVerticalLayout(line.layout)) return placeLineAsChars(line, stats);
        if (mode === "line") return placeLineAsSingleLayer(line, stats);
        return placeLineAsChars(line, stats);
    }

    // 縦組みレイアウトか（vl_* / vc_* / vr_*）
    function isVerticalLayout(layout) {
        var l = String(layout || "");
        return l.indexOf("vl_") === 0 || l.indexOf("vc_") === 0 || l.indexOf("vr_") === 0;
    }

    // 縦組みの列 X 座標（vl=15%, vc=50%, vr=85%）
    function layoutToX(layout) {
        var l = String(layout || "");
        if (l.indexOf("vl_") === 0) return resW * 0.15;
        if (l.indexOf("vr_") === 0) return resW * 0.85;
        return resW * 0.5;
    }

    // 縦組みで 90° 回転すべき文字
    function isRotateCharInVertical(c) {
        return "ー〜～－‐―…‥＝=（）()「」『』【】［］[]｛｝{}〈〉《》＜＞<>".indexOf(c) >= 0;
    }

    // 縦組みで右上寄りに配置する小書きかな
    // 通常は em ボックスの中央に描画されるが、視覚的には左下に寄って見える。
    // 右にシフトしてバランスを取る。
    function isSmallKanaChar(c) {
        return "ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ".indexOf(c) >= 0;
    }

    // line モード：1行=1テキストレイヤ（+ 装飾あれば一緒に）
    function placeLineAsSingleLayer(line, stats) {
        if (!line.text) return;
        try {
            var tmpl = resolveLineTemplate(line);
            var designCompName = tmpl.design;
            var designComp = compsByName[designCompName];
            if (!designComp) {
                stats.errors.push("行 " + line.id + ": design '" + designCompName + "' が無い");
                return;
            }

            // レガシー方式 or 新方式
            var newLayer;          // text 役のレイヤ
            var decorationLayers = []; // 装飾レイヤ群（newLayer 親付け済み）
            if (isLegacyMultiLvComp(designComp)) {
                var srcLayer = findLayerInComp(designComp, DEFAULT_EMPHASIS_LAYER);
                if (!srcLayer) {
                    stats.errors.push("design '" + designCompName + "': " + DEFAULT_EMPHASIS_LAYER + " レイヤが無い");
                    return;
                }
                newLayer = copyLayerToMain(srcLayer);
            } else {
                var grp = copyDesignWithDecorations(designComp);
                if (!grp || !grp.textLayer) {
                    stats.errors.push("行 " + line.id + ": design '" + designCompName + "' レイヤ無し");
                    return;
                }
                newLayer = grp.textLayer;
                decorationLayers = grp.decorationLayers;
            }

            // フォント：行 override > プロジェクトデフォルト > design テンプレのフォント
            var projFontFamily = (data.font && data.font.family) ? data.font.family : null;
            var projFontSize = (data.font && typeof data.font.size === "number" && data.font.size > 0) ? data.font.size : null;
            var lineFontExplicit = (line.fontOverride && line.fontOverride.family) ? line.fontOverride.family : projFontFamily;
            var lineSizeExplicit = (line.fontOverride && typeof line.fontOverride.size === "number") ? line.fontOverride.size : projFontSize;

            // テキスト：\n リテラルを実改行に変換
            var fullText = String(line.text || "").replace(/\\n/g, "\n");
            var textProp = getTextProp(newLayer);
            if (!textProp) {
                stats.errors.push("行 " + line.id + ": Source Text プロパティが取れない");
                return;
            }
            while (textProp.numKeys > 0) textProp.removeKey(1);
            var td = textProp.value;
            td.text = fullText;
            if (lineFontExplicit) {
                var lineFontPS = resolveFontToPostScript(lineFontExplicit);
                try { td.font = lineFontPS; } catch (e2) {}
            }
            if (lineSizeExplicit) { try { td.fontSize = lineSizeExplicit; } catch (e) {} }
            try { td.justification = ParagraphJustification.CENTER_JUSTIFY; } catch (e) {}
            textProp.setValue(td);

            // ベース位置（行は中央配置 + layout の Y）
            var posDx = (line.pos && line.pos.dx) || 0;
            var posDy = (line.pos && line.pos.dy) || 0;
            var basePos = [resW / 2 + posDx, layoutToY(line.layout) + posDy];

            clearTransformKeys(newLayer);
            setPositionRobust(newLayer, basePos);

            var charStart = line.tIn;
            var charEnd = line.tOut;

            transferMotion(newLayer, charStart, charEnd, basePos, tmpl, stats, line.id, 0);

            newLayer.inPoint = charStart;
            newLayer.outPoint = charEnd;
            newLayer.name = "L" + line.id + "_line_" + (line.text || "").substring(0, 8);

            // 装飾レイヤの時刻も同期
            for (var dIdx = 0; dIdx < decorationLayers.length; dIdx++) {
                var dLyr = decorationLayers[dIdx];
                try { dLyr.inPoint = charStart; } catch (eD) {}
                try { dLyr.outPoint = charEnd; } catch (eD2) {}
                try { dLyr.name = "L" + line.id + "_dec" + (dIdx + 1); } catch (eN) {}
            }

            // 座布団：sourceRect が取れれば実寸、無ければ fontSize ベースで推定
            if (line.zabuton && line.zabuton.enabled) {
                var zb = null;
                try {
                    var rect = newLayer.sourceRectAtTime(charStart, false);
                    if (rect && rect.width > 0) {
                        zb = {
                            cx: basePos[0] + rect.left + rect.width / 2,
                            cy: basePos[1] + rect.top + rect.height / 2,
                            w: rect.width,
                            h: rect.height
                        };
                    }
                } catch (eZR) {}
                if (!zb) {
                    // フォールバック：fontSize + 文字数から推定（視覚中心はベースライン -0.35×fontSize）
                    var estSize = lineSizeExplicit || 48;
                    var estLen = (line.text || "").length;
                    zb = {
                        cx: basePos[0],
                        cy: basePos[1] - 0.35 * estSize,
                        w: estSize * estLen * 1.1,
                        h: estSize
                    };
                }
                placeZabuton(line, stats, zb, newLayer, basePos);
            }

            stats.placed++;
            if (!stats.perLine[line.id]) stats.perLine[line.id] = 0;
            stats.perLine[line.id]++;
        } catch (e) {
            var info = e.toString();
            if (e.line !== undefined) info += " [jsx行" + e.line + "]";
            stats.errors.push("行 " + line.id + " (line mode): " + info);
        }
    }

    // char モード：1文字=1レイヤ（既存の動作）
    function placeLineAsChars(line, stats) {
        var chars = line.chars || [];
        if (chars.length === 0) return;

        var projFontFamilyC = (data.font && data.font.family) ? data.font.family : null;
        var projFontSizeC = (data.font && typeof data.font.size === "number" && data.font.size > 0) ? data.font.size : null;
        var lineFontExplicit = (line.fontOverride && line.fontOverride.family) ? line.fontOverride.family : projFontFamilyC;
        var lineSizeExplicit = (line.fontOverride && typeof line.fontOverride.size === "number") ? line.fontOverride.size : projFontSizeC;

        var lineTmpl = resolveLineTemplate(line);
        var designCompForRef = compsByName[lineTmpl.design];

        // Lv ごとの「実描画幅」キャッシュ
        // sourceRectAtTime で AE が算出した実際の文字幅を使う（fontSize 推定より正確）
        // 単純化のため、Lv 内で「あ」相当の代表文字の幅を全文字に流用（CJK は基本等幅）
        var lvWidthCache = {};
        function getLvCharWidth(level) {
            if (lvWidthCache[level] != null) return lvWidthCache[level];
            var width = null;
            // アプリ指定サイズが最優先：実際に適用されるフォントサイズなので
            // design テンプレ元レイヤの実測（旧フォント・旧サイズ）より正確。
            // CJK は全角 ≒ fontSize 幅。アプリのプレビュー（letter-spacing 計算）とも一致する。
            if (lineSizeExplicit) {
                lvWidthCache[level] = lineSizeExplicit;
                return lineSizeExplicit;
            }
            if (designCompForRef) {
                try {
                    var found = findEmphasisLayer(designCompForRef, level);
                    if (found && found.layer) {
                        // 元レイヤの sourceRect（テキスト「あ」等の実幅）
                        try {
                            var rect = found.layer.sourceRectAtTime(0, false);
                            if (rect && rect.width > 0) width = rect.width;
                        } catch (e1) {}
                        // Scale が 100% でなければ加味
                        if (width) {
                            try {
                                var spv = found.layer.property("ADBE Transform Group").property("ADBE Scale").value;
                                var sc = (spv && spv.length) ? spv[0] : (typeof spv === "number" ? spv : 100);
                                width = width * sc / 100;
                            } catch (e2) {}
                        }
                    }
                } catch (e) {}
            }
            // フォールバック：fontSize ベース
            if (!width || width <= 0) {
                var fs = null;
                if (lineSizeExplicit) fs = lineSizeExplicit;
                else if (designCompForRef) {
                    try {
                        var found2 = findEmphasisLayer(designCompForRef, level);
                        if (found2 && found2.layer) {
                            var tp = getTextProp(found2.layer);
                            if (tp && tp.value.fontSize > 0) fs = tp.value.fontSize;
                        }
                    } catch (eF) {}
                }
                width = fs || projFont.size || 48;
            }
            lvWidthCache[level] = width;
            return width;
        }

        // line.tracking で微調整可（負で詰める、正で開く）。デフォルト 1.1 で 10% 余裕。
        var tracking = (typeof line.tracking === "number") ? line.tracking : 0;
        var ratio = 1.10 + tracking;

        // ジッターおよび座布団 perBlock：フラグだけ先に決めておく
        // （オフセット計算は layout / charWidths が決まってから下でやる）
        var jitter = line.jitter;
        var jitterOn = !!(jitter && jitter.enabled);
        var perBlockZab = !!(line.zabuton && line.zabuton.enabled && line.zabuton.perBlock);
        var blockMode = jitterOn || perBlockZab;
        var jitBlocks = null;
        var jitBlockOf = null;
        var jitOffsets = null;
        var blockZabInfo = null;

        // 各文字の幅を Lv 別「実描画幅」から事前に算出
        var charWidths = [];
        var totalWidth = 0;
        var maxCharSize = 0;  // 座布団の高さ推定用
        for (var pi = 0; pi < chars.length; pi++) {
            var pch = chars[pi];
            if (pch.skip) { charWidths[pi] = 0; continue; }
            var pLevel = resolveCharEmphasis(pch, line, pi, chars);
            var pSize = getLvCharWidth(pLevel);
            if (pSize > maxCharSize) maxCharSize = pSize;
            var pw = pSize * ratio;
            charWidths[pi] = pw;
            totalWidth += pw;
        }
        var vertical = isVerticalLayout(line.layout);

        var posDx = (line.pos && line.pos.dx) || 0;
        var posDy = (line.pos && line.pos.dy) || 0;
        var stagger = (typeof line.stagger === "number" && !isNaN(line.stagger) && line.stagger > 0) ? line.stagger : 0;
        // stagger キャップ：最後の文字が「entry を完了して、exit が始まる前に表示状態になる」
        // ことを保証する。これを超えると entry(0%)→exit(0%) のキー並びになり
        // 最後の文字が一度も可視化されない（今回のバグの根本原因）。
        //   条件: charStart_last + entryDur <= tOut - exitDur
        //   →     (n-1)*stagger <= lineDur - entryDur - exitDur - margin
        if (stagger > 0 && chars.length > 1) {
            var lineDur = (line.tOut != null && line.tIn != null) ? (line.tOut - line.tIn) : 0;
            var entryDurCap = 0, exitDurCap = 0;
            try { var ecCap = compsByName[lineTmpl.entry]; if (ecCap) entryDurCap = ecCap.duration; } catch (eEDC) {}
            try { var xcCap = compsByName[lineTmpl.exit];  if (xcCap) exitDurCap  = xcCap.duration; } catch (eXDC) {}
            var maxTotal = lineDur - entryDurCap - exitDurCap - 0.1;
            if (maxTotal < 0) maxTotal = 0;
            if (stagger * (chars.length - 1) > maxTotal) {
                stagger = maxTotal / (chars.length - 1);
                if (stagger < 0) stagger = 0;
            }
        }

        // 横組み：X 中央揃え + layoutToY / 縦組み：layoutToX の列 + 縦方向に文字送り
        var startX, y, colX, startY;
        if (vertical) {
            colX = layoutToX(line.layout);
            var lv = String(line.layout || "");
            if (lv.indexOf("top") >= 0)         startY = resH * 0.15;                       // 上から下へ
            else if (lv.indexOf("bottom") >= 0) startY = resH * 0.85 - totalWidth;          // 下端 85% で終わる
            else                                startY = resH / 2 - totalWidth / 2;         // 中央揃え
        } else {
            startX = resW / 2 - totalWidth / 2;
            y = layoutToY(line.layout);
        }

        // ジッター / perBlock 座布団のブロック情報を組み立て（layout / charWidths 決定後）
        // - ブロックごとに jitter オフセット計算
        // - 画面境界クランプ：ブロック中心 (jitter 込み) が [margin, resW - margin] に収まるよう調整
        if (blockMode) {
            jitBlocks = parseJitterBlocks(line.text || "");
            jitOffsets = [];
            jitBlockOf = [];
            var clampMargin = (maxCharSize || 48) / 2; // 半文字分の余白
            var crossHalf = (maxCharSize || 48) / 2;   // 流れと直交する方向の文字半分
            // 各ブロックの中心と長さ（jitter 抜き、絶対座標基準）
            var blockCenters = [];
            var acc = vertical ? startY : startX;
            for (var bcI = 0; bcI < jitBlocks.length; bcI++) {
                var bk = jitBlocks[bcI];
                var bkLen = 0;
                for (var kkk = bk.start; kkk <= bk.end; kkk++) bkLen += (charWidths[kkk] || 0);
                blockCenters.push({ mid: acc + bkLen / 2, len: bkLen });
                acc += bkLen;
            }
            var jitInfos = [];
            for (var jbi = 0; jbi < jitBlocks.length; jbi++) {
                var jbo = jitterOn
                    ? jitterOffsetFor(jitter.seed | 0, ((line.id | 0) + 1) * 1000 + jbi, jitter.maxDx || 0, jitter.maxDy || 0)
                    : { dx: 0, dy: 0 };
                var bc = blockCenters[jbi];
                var absX = vertical ? (colX + posDx) : (bc.mid + posDx);
                var absY = vertical ? (bc.mid + posDy) : (y + posDy);
                var blockHalf = bc.len / 2;
                var halfX = vertical ? crossHalf : blockHalf;
                var halfY = vertical ? blockHalf : crossHalf;
                var minDx = clampMargin + halfX - absX;
                var maxDxLim = resW - clampMargin - halfX - absX;
                var minDy = clampMargin + halfY - absY;
                var maxDyLim = resH - clampMargin - halfY - absY;
                if (minDx > maxDxLim) jbo.dx = (minDx + maxDxLim) / 2;
                else { if (jbo.dx < minDx) jbo.dx = minDx; if (jbo.dx > maxDxLim) jbo.dx = maxDxLim; }
                if (minDy > maxDyLim) jbo.dy = (minDy + maxDyLim) / 2;
                else { if (jbo.dy < minDy) jbo.dy = minDy; if (jbo.dy > maxDyLim) jbo.dy = maxDyLim; }
                jitInfos.push({ off: jbo, absX: absX, absY: absY, blockHalf: blockHalf });
                for (var jki = jitBlocks[jbi].start; jki <= jitBlocks[jbi].end; jki++) {
                    jitBlockOf[jki] = jbi;
                }
            }
            // 重なり禁止・順序保持：流れ方向のみ、左（or 上）から順に押し出し
            if (jitter && jitter.preventOverlap && jitInfos.length > 1) {
                var prevEnd = -1e9;
                var screenLimit = (vertical ? resH : resW) - clampMargin;
                for (var poi = 0; poi < jitInfos.length; poi++) {
                    var info = jitInfos[poi];
                    var origAlong = vertical ? info.absY : info.absX;
                    var jitAlong = vertical ? info.off.dy : info.off.dx;
                    var center = origAlong + jitAlong;
                    var minCenter = prevEnd + info.blockHalf;
                    if (center < minCenter) center = minCenter;
                    var maxCenter = screenLimit - info.blockHalf;
                    if (center > maxCenter) center = maxCenter;
                    if (vertical) info.off.dy = center - info.absY;
                    else info.off.dx = center - info.absX;
                    prevEnd = center + info.blockHalf;
                }
            }
            for (var joi = 0; joi < jitInfos.length; joi++) jitOffsets.push(jitInfos[joi].off);
            if (perBlockZab) {
                blockZabInfo = [];
                for (var bzi = 0; bzi < jitBlocks.length; bzi++) blockZabInfo.push(null);
            }
        }

        // 累積カーソル（横：X / 縦：Y）
        var cursorX = startX;
        var cursorY = startY;
        var firstCharLayer = null;    // 座布団 follow の親付け先
        var firstCharBasePos = null;  // 親付け時のローカルオフセット計算用

        if (!stats.charLog) stats.charLog = [];
        for (var ci = 0; ci < chars.length; ci++) {
            var ch = chars[ci];
            if (ch.skip) { stats.skippedChars++; continue; }
            var dbgStep = "start";
            try {
                var tmpl = resolveCharTemplate(ch, line);
                var designCompName = tmpl.design;
                var designComp = compsByName[designCompName];
                if (!designComp) {
                    stats.errors.push("行 " + line.id + " 文字 " + ci + ": design '" + designCompName + "' が無い");
                    stats.charLog.push("L" + line.id + " ci=" + ci + " '" + (ch.ch || "") + "' FAIL noDesign");
                    continue;
                }
                dbgStep = "emphasis";
                var emphasisLevel = resolveCharEmphasis(ch, line, ci, chars);
                var found = findEmphasisLayer(designComp, emphasisLevel);
                if (!found) {
                    stats.errors.push("design '" + designCompName + "': lv0〜lv" + emphasisLevel + " どれも無い");
                    stats.charLog.push("L" + line.id + " ci=" + ci + " '" + (ch.ch || "") + "' FAIL noLvLayer lv=" + emphasisLevel);
                    continue;
                }
                var srcLayer = found.layer;
                var usedLevel = found.level;

                dbgStep = "copy";
                var newLayer = copyLayerToMain(srcLayer);
                stats.charLog.push("L" + line.id + " ci=" + ci + " '" + (ch.ch || "") + "' lv=" + emphasisLevel + "/" + usedLevel
                    + " new='" + newLayer.name + "'");

                dbgStep = "textProp";
                var textProp = getTextProp(newLayer);
                if (!textProp) {
                    stats.errors.push("行 " + line.id + " 文字 " + ci + ": Source Text プロパティが取れない");
                    stats.charLog.push("  -> FAIL noTextProp");
                    try { newLayer.remove(); } catch (eRm) {} // 孤児を掃除
                    continue;
                }
                dbgStep = "removeKeys";
                safeRemoveAllKeys(textProp);
                dbgStep = "setText";
                var td = textProp.value;
                td.text = ch.ch || "";
                if (lineFontExplicit) {
                    var lineFontPS2 = resolveFontToPostScript(lineFontExplicit);
                    try { td.font = lineFontPS2; } catch (eFont) {}
                }
                if (lineSizeExplicit) { try { td.fontSize = lineSizeExplicit; } catch (eSize) {} }
                textProp.setValue(td);

                // ベース位置（累積カーソル + 自身の幅の半分 = 中心）
                dbgStep = "pos-calc";
                var thisW = charWidths[ci];
                var basePos;
                var cursorBeforeCh = vertical ? cursorY : cursorX;
                if (vertical) {
                    var vy = cursorY + thisW / 2 + posDy;
                    cursorY += thisW;
                    // 縦組み小書きかな：フォントによる右寄りバイアスを打ち消して左にシフト
                    var xShift = 0;
                    if (isSmallKanaChar(ch.ch || "")) {
                        var refSize = lineSizeExplicit || 48;
                        xShift = -refSize * 0.04;
                    }
                    basePos = [colX + posDx + xShift, vy];
                } else {
                    var x = cursorX + thisW / 2 + posDx;
                    cursorX += thisW;
                    basePos = [x, y + posDy];
                }
                // perBlockZab：ブロックのバウンディング情報を記録（ジッター加算前 = 絶対位置基準）
                if (perBlockZab && blockZabInfo && jitBlockOf) {
                    var bzIdx = jitBlockOf[ci];
                    if (bzIdx != null) {
                        if (!blockZabInfo[bzIdx]) {
                            blockZabInfo[bzIdx] = {
                                firstLayer: null,
                                firstBasePos: null,
                                startCursor: cursorBeforeCh,
                                endCursor: cursorBeforeCh + thisW
                            };
                        } else {
                            blockZabInfo[bzIdx].endCursor = cursorBeforeCh + thisW;
                        }
                    }
                }
                // ジッター：ブロックのオフセットを basePos に加算（カーソルは動かさない = 次文字に影響なし）
                if (jitterOn && jitBlockOf) {
                    var jbIdx = jitBlockOf[ci];
                    if (jbIdx != null && jitOffsets[jbIdx]) {
                        basePos[0] += jitOffsets[jbIdx].dx;
                        basePos[1] += jitOffsets[jbIdx].dy;
                    }
                }

                // 時刻：最優先で設定
                dbgStep = "tc";
                var charStart = (ch.tIn != null) ? ch.tIn : (line.tIn + ci * stagger);
                var charEnd   = (ch.tOut != null) ? ch.tOut : line.tOut;
                // stagger が行末を超えた場合は行末 0.1s 前にクランプ（文字が消えるのを防ぐ）
                if (charEnd != null && charStart != null && charEnd <= charStart && ch.tIn == null) {
                    charStart = Math.max(line.tIn, charEnd - 0.1);
                }
                if (charStart == null || charEnd == null || isNaN(charStart) || isNaN(charEnd) || charEnd <= charStart) {
                    stats.errors.push("行 " + line.id + " 文字 " + ci + ": TC 無効（tIn=" + charStart + " tOut=" + charEnd + "）");
                    try { newLayer.remove(); } catch (eRm) {} // 孤児を掃除
                    continue;
                }
                try { newLayer.inPoint = charStart; } catch (eIn) {}
                try { newLayer.outPoint = charEnd; } catch (eOut) {}

                dbgStep = "transform";
                clearTransformKeys(newLayer);
                setPositionRobust(newLayer, basePos);

                // 縦組み：長音・括弧類は 90° 回転
                // （モーションテンプレに Rotation キーフレがあると上書きされる制限あり）
                if (vertical && isRotateCharInVertical(ch.ch || "")) {
                    try {
                        newLayer.property("ADBE Transform Group").property("ADBE Rotate Z").setValue(90);
                    } catch (eRot) {}
                }

                dbgStep = "motion";
                transferMotion(newLayer, charStart, charEnd, basePos, tmpl, stats, line.id, ci);

                dbgStep = "name";
                var emphSuffix = usedLevel > 0 ? ("_e" + usedLevel) : "";
                newLayer.name = "L" + line.id + "_" + (ci + 1) + emphSuffix + "_" + (ch.ch || "");

                if (!firstCharLayer) { firstCharLayer = newLayer; firstCharBasePos = [basePos[0], basePos[1]]; }
                // perBlockZab：各ブロックの firstLayer / firstBasePos を記録
                if (perBlockZab && blockZabInfo && jitBlockOf) {
                    var bzIdx2 = jitBlockOf[ci];
                    if (bzIdx2 != null && blockZabInfo[bzIdx2] && !blockZabInfo[bzIdx2].firstLayer) {
                        blockZabInfo[bzIdx2].firstLayer = newLayer;
                        blockZabInfo[bzIdx2].firstBasePos = [basePos[0], basePos[1]];
                    }
                }
                stats.placed++;
                if (!stats.perLine[line.id]) stats.perLine[line.id] = 0;
                stats.perLine[line.id]++;
                stats.charLog.push("  -> OK " + newLayer.name);
            } catch (eChar) {
                var info = eChar.toString();
                if (eChar.line !== undefined) info += " [jsx行" + eChar.line + "]";
                if (eChar.source) info += " src: " + String(eChar.source).substring(0, 80);
                stats.errors.push("行 " + line.id + " 文字 " + ci + " [step=" + dbgStep + "]: " + info);
                stats.charLog.push("  -> FAIL step=" + dbgStep + " err=" + info);
            }
        }

        // 座布団：perBlock ならブロックごとに、そうでなければ行全体で 1 個
        if (line.zabuton && line.zabuton.enabled) {
            var refSize = lineSizeExplicit || maxCharSize || 48;
            var crossThickness = refSize * 1.3;

            if (perBlockZab && blockZabInfo) {
                // 各ブロックに 1 個ずつ
                for (var pbi = 0; pbi < blockZabInfo.length; pbi++) {
                    var info = blockZabInfo[pbi];
                    if (!info || !info.firstLayer) continue;
                    var blockLen = info.endCursor - info.startCursor;
                    if (blockLen <= 0) continue;
                    var bMid = (info.startCursor + info.endCursor) / 2;
                    var adjXB = 0, adjYB = -0.35 * refSize;
                    try {
                        // stagger のとき第2以降ブロックの firstLayer は line.tIn 時点で
                        // inPoint 前 → sourceRect が空になり adjXB=0 の fallback に落ちて
                        // ブロックが数十 px ズレる。必ず inPoint 時点で問い合わせる。
                        var probeT = info.firstLayer.inPoint;
                        var rCB = info.firstLayer.sourceRectAtTime(probeT, false);
                        if (rCB && rCB.width > 0 && rCB.height > 0) {
                            adjXB = rCB.left + rCB.width / 2;
                            adjYB = rCB.top + rCB.height / 2;
                        }
                    } catch (eRCB) {}
                    // ジッター分をブロックの絶対位置に加算（座布団の parent = firstLayer は
                    // jitter 込み位置なので、abs から local を引くと jitter が打ち消されて
                    // 座布団だけ jitter 抜きの位置に描画されてしまう → 縦一直線バグ）
                    var jitDx = (jitOffsets && jitOffsets[pbi]) ? jitOffsets[pbi].dx : 0;
                    var jitDy = (jitOffsets && jitOffsets[pbi]) ? jitOffsets[pbi].dy : 0;
                    var bBounds;
                    if (vertical) {
                        bBounds = {
                            cx: colX + posDx + adjXB + jitDx,
                            cy: bMid + posDy + adjYB + jitDy,
                            w: crossThickness,
                            h: blockLen
                        };
                    } else {
                        bBounds = {
                            cx: bMid + posDx + adjXB + jitDx,
                            cy: y + posDy + adjYB + jitDy,
                            w: blockLen,
                            h: crossThickness
                        };
                    }
                    placeZabuton(line, stats, bBounds, info.firstLayer, info.firstBasePos);
                }
            } else if (firstCharLayer) {
                // 行全体で 1 個
                var adjX = 0;
                var adjY = -0.35 * refSize;
                try {
                    var rC = firstCharLayer.sourceRectAtTime(line.tIn, false);
                    if (rC && rC.width > 0 && rC.height > 0) {
                        adjX = rC.left + rC.width / 2;
                        adjY = rC.top + rC.height / 2;
                    }
                } catch (eRC) {}
                var zbBounds;
                if (vertical) {
                    zbBounds = {
                        cx: colX + posDx + adjX,
                        cy: startY + totalWidth / 2 + posDy + adjY,
                        w: crossThickness,
                        h: totalWidth
                    };
                } else {
                    zbBounds = {
                        cx: resW / 2 + posDx + adjX,
                        cy: y + posDy + adjY,
                        w: totalWidth,
                        h: crossThickness
                    };
                }
                placeZabuton(line, stats, zbBounds, firstCharLayer, firstCharBasePos);
            }
        }
    }

    // 座布団 Shape Layer を生成して parentLayer の直下（Z順）に置く
    // bounds = { cx, cy, w, h }（テキスト実寸、padding 含まず、絶対座標）
    // parentBasePos = 親レイヤの本来の最終位置（モーションキーフレを考慮せず）
    function placeZabuton(line, stats, bounds, parentLayer, parentBasePos) {
        var zab = line.zabuton;
        if (!zab || !zab.enabled) return;
        if (!stats.zabInfo) stats.zabInfo = [];
        stats.zabInfo.push("行" + line.id + ": abs=(" + Math.round(bounds.cx) + "," + Math.round(bounds.cy) + ") wh=(" + Math.round(bounds.w) + "," + Math.round(bounds.h) + ") parentBase=(" + Math.round(parentBasePos[0]) + "," + Math.round(parentBasePos[1]) + ")");
        try {
            var padX = (typeof zab.paddingX === "number") ? zab.paddingX : 0;
            var padY = (typeof zab.paddingY === "number") ? zab.paddingY : 0;
            var w = bounds.w + padX * 2;
            var h = bounds.h + padY * 2;
            var shape = String(zab.shape || "round");

            var sl = mainComp.layers.addShape();
            sl.name = "L" + line.id + "_zabuton";

            var rootGrp = sl.property("ADBE Root Vectors Group");
            var grp = rootGrp.addProperty("ADBE Vector Group");
            var content = grp.property("ADBE Vectors Group");

            if (shape === "circle") {
                var d = Math.max(w, h);
                var ell = content.addProperty("ADBE Vector Shape - Ellipse");
                ell.property("ADBE Vector Ellipse Size").setValue([d, d]);
            } else {
                var rectShape = content.addProperty("ADBE Vector Shape - Rect");
                rectShape.property("ADBE Vector Rect Size").setValue([w, h]);
                var roundness = 0;
                if (shape === "round") roundness = (typeof zab.cornerRadius === "number") ? zab.cornerRadius : 16;
                else if (shape === "pill") roundness = Math.min(w, h) / 2;
                try { rectShape.property("ADBE Vector Rect Roundness").setValue(roundness); } catch (eR) {}
            }

            var zMode = String(zab.mode || "fill");
            if (zMode === "stroke") {
                var stroke = content.addProperty("ADBE Vector Graphic - Stroke");
                try { stroke.property("ADBE Vector Stroke Color").setValue(hexToRgb01(zab.color || "#000000")); } catch (eSC) {}
                var sw = (typeof zab.strokeWidth === "number" && zab.strokeWidth >= 0) ? zab.strokeWidth : 2;
                try { stroke.property("ADBE Vector Stroke Width").setValue(sw); } catch (eSW) {}
            } else {
                var fill = content.addProperty("ADBE Vector Graphic - Fill");
                try { fill.property("ADBE Vector Fill Color").setValue(hexToRgb01(zab.color || "#000000")); } catch (eC) {}
            }

            // レイヤ全体の不透明度
            var opv = (typeof zab.opacity === "number") ? Math.max(0, Math.min(1, zab.opacity)) : 0.5;
            var slOpacity = sl.property("ADBE Transform Group").property("ADBE Opacity");

            if (line.tIn != null && !isNaN(line.tIn))   { try { sl.inPoint = line.tIn; } catch (eIT) {} }
            if (line.tOut != null && !isNaN(line.tOut)) { try { sl.outPoint = line.tOut; } catch (eOT) {} }

            if (String(zab.timingMode || "follow") === "static") {
                // 独立フェード：絶対座標のまま、親付けなし。フェード秒はパラメータ化
                setPositionRobust(sl, [bounds.cx, bounds.cy]);
                var fadeDur = (typeof zab.fade === "number" && zab.fade >= 0) ? zab.fade : 0.3;
                var span = line.tOut - line.tIn;
                var f = Math.min(fadeDur, span / 3);
                try {
                    if (f > 0) {
                        slOpacity.setValueAtTime(line.tIn, 0);
                        slOpacity.setValueAtTime(line.tIn + f, opv * 100);
                        slOpacity.setValueAtTime(line.tOut - f, opv * 100);
                        slOpacity.setValueAtTime(line.tOut, 0);
                    } else {
                        slOpacity.setValue(opv * 100);  // fade=0 は即表示
                    }
                } catch (eK) {}
            } else {
                // follow：親付けを先にしてから、本来の最終位置基準の local オフセットを直接設定
                // （AE の自動 preserve は「現在時刻」の親位置を見るため、モーション途中だとズレる）
                try { sl.parent = parentLayer; } catch (eP) {}
                var localX = bounds.cx - parentBasePos[0];
                var localY = bounds.cy - parentBasePos[1];
                setPositionRobust(sl, [localX, localY]);

                // entry/exit テンプレの Opacity キーを座布団にも転写（文字のフェードと同期）
                // ※ opacity は親子伝播しないため。値は座布団の不透明度でスケール
                var opacityKeyed = false;
                try {
                    var zTmpl = resolveLineTemplate(line);
                    var eComp = zTmpl.entry ? compsByName[zTmpl.entry] : null;
                    var xComp = zTmpl.exit ? compsByName[zTmpl.exit] : null;
                    if (eComp && eComp.numLayers > 0) {
                        var eOp = eComp.layer(1).property("ADBE Transform Group").property("ADBE Opacity");
                        if (eOp && eOp.numKeys > 0) {
                            for (var ke = 1; ke <= eOp.numKeys; ke++) {
                                slOpacity.setValueAtTime(line.tIn + eOp.keyTime(ke), eOp.keyValue(ke) * opv);
                            }
                            opacityKeyed = true;
                        }
                    }
                    if (xComp && xComp.numLayers > 0) {
                        var xOp = xComp.layer(1).property("ADBE Transform Group").property("ADBE Opacity");
                        if (xOp && xOp.numKeys > 0) {
                            var xStart = line.tOut - xComp.duration;
                            for (var kx = 1; kx <= xOp.numKeys; kx++) {
                                slOpacity.setValueAtTime(xStart + xOp.keyTime(kx), xOp.keyValue(kx) * opv);
                            }
                            opacityKeyed = true;
                        }
                    }
                } catch (eOpT) {}
                if (!opacityKeyed) {
                    try { slOpacity.setValue(opv * 100); } catch (eO) {}
                }
            }

            // Z 順：親テキストレイヤの直下へ
            try { sl.moveAfter(parentLayer); } catch (eM) {}
            // addShape はレイヤを選択状態にする。選択が残ると copyToComp の挿入位置が
            // ズレる（AE 26）ため必ず解除する
            try { sl.selected = false; } catch (eSel) {}
        } catch (eZ) {
            var infoZ = eZ.toString();
            if (eZ.line !== undefined) infoZ += " [jsx行" + eZ.line + "]";
            stats.errors.push("行 " + line.id + " 座布団: " + infoZ);
        }
    }

    // レイヤを main_comp にコピーし、新規レイヤを id 差分で確実に特定して返す。
    // AE 26 の copyToComp は選択レイヤの上に挿入するため layer(1) 決め打ちは危険
    // （前行の最後の文字レイヤを乗っ取って上書きするバグの原因だった）。
    function copyLayerToMain(srcLayer) {
        var idsBefore = {};
        for (var ib = 1; ib <= mainComp.numLayers; ib++) idsBefore[mainComp.layer(ib).id] = true;
        srcLayer.copyToComp(mainComp);
        var newLayer = null;
        for (var ia = 1; ia <= mainComp.numLayers; ia++) {
            var candL = mainComp.layer(ia);
            if (!idsBefore[candL.id]) { newLayer = candL; break; }
        }
        if (!newLayer) newLayer = mainComp.layer(1); // フォールバック（起きないはず）
        try { newLayer.moveToBeginning(); } catch (eMv) {}  // Z順は従来どおり最上位へ
        return newLayer;
    }

    function findLayerInComp(comp, name) {
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name === name) return comp.layer(i);
        }
        return null;
    }

    // design コンポの lv0 レイヤの fontSize を読む（無ければ null）
    function readDesignFontSize(designComp) {
        if (!designComp) return null;
        try {
            var lyr = findLayerInComp(designComp, "lv0");
            if (!lyr) lyr = designComp.layer(1);
            if (!lyr) return null;
            var tp = getTextProp(lyr);
            if (!tp) return null;
            var s = tp.value.fontSize;
            return (typeof s === "number" && s > 0) ? s : null;
        } catch (e) {
            return null;
        }
    }

    // layout 文字列から Y 座標を返す（h_top=15%, h_center=50%, h_bottom=85%）
    function layoutToY(layout) {
        var l = String(layout || "h_bottom");
        if (l.indexOf("top") >= 0)    return resH * 0.15;
        if (l.indexOf("bottom") >= 0) return resH * 0.85;
        return resH * 0.5;
    }

    // ==========================================================
    // 背景レイヤ配置（Phase 4b）
    // ==========================================================

    function placeBackgrounds(bgList, jsonDir, stats) {
        for (var i = 0; i < bgList.length; i++) {
            var bg = bgList[i];
            var label = "背景 #" + (bg.id != null ? bg.id : i);
            var isSolid = !!bg.solidColor;
            if (!isSolid && !bg.file) {
                stats.errors.push(label + ": file も solidColor も空");
                continue;
            }
            try {
                var layer;
                var tIn = (bg.tIn != null) ? bg.tIn : 0;
                var tOut = (bg.tOut != null && bg.tOut > tIn) ? bg.tOut : mainComp.duration;

                if (isSolid) {
                    var rgb = hexToRgb01(bg.solidColor);
                    layer = mainComp.layers.addSolid(rgb, "BG_solid_" + (bg.id != null ? bg.id : i),
                                                    mainComp.width, mainComp.height, 1.0);
                    try { layer.moveToEnd(); } catch (eMove) {}
                    layer.inPoint = tIn;
                    layer.outPoint = tOut;
                    // 単色は fit 不要（コンポサイズで作成済）。中央配置のみ。
                    var grp = getTransformGroup(layer);
                    if (grp) {
                        try { grp.property("ADBE Position").setValue([mainComp.width / 2, mainComp.height / 2]); } catch (e) {}
                    }
                    applyBgOpacityWithFade(layer, bg);
                    applyBlendMode(layer, bg.blend || "normal");
                    layer.name = "BG_solid_" + (bg.id != null ? bg.id : i) + "_" + bg.solidColor;
                } else {
                    var path = resolveBgPath(bg.file, jsonDir);
                    var footage = importOrReuseFootage(path);
                    if (!footage) {
                        stats.errors.push(label + ": 読込失敗 " + path);
                        continue;
                    }
                    layer = mainComp.layers.add(footage);
                    try { layer.moveToEnd(); } catch (eMove) {}
                    layer.inPoint = tIn;
                    layer.outPoint = tOut;
                    applyBgFit(layer, bg.fit || "cover", footage);
                    applyBgOpacityWithFade(layer, bg);
                    applyBlendMode(layer, bg.blend || "normal");
                    layer.name = "BG_" + (bg.id != null ? bg.id : i) + "_" + basename(bg.file);
                }
                stats.bgPlaced++;
            } catch (e) {
                var info = e.toString();
                if (e.line !== undefined) info += " [jsx行" + e.line + "]";
                stats.errors.push(label + ": " + info);
            }
        }
    }

    // "#rrggbb" → [r, g, b]（0〜1）
    function hexToRgb01(hex) {
        var s = String(hex || "").replace("#", "");
        if (s.length !== 6) return [0, 0, 0];
        var r = parseInt(s.substring(0, 2), 16) / 255;
        var g = parseInt(s.substring(2, 4), 16) / 255;
        var b = parseInt(s.substring(4, 6), 16) / 255;
        return [r, g, b];
    }

    function basename(p) {
        var s = String(p || "");
        var idx = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/"));
        return idx >= 0 ? s.substring(idx + 1) : s;
    }

    function isAbsolutePath(p) {
        var s = String(p || "");
        return /^[A-Za-z]:[\\\/]/.test(s) || s.charAt(0) === "/" || s.charAt(0) === "\\";
    }

    function resolveBgPath(file, jsonDir) {
        if (isAbsolutePath(file)) return file;
        return jsonDir + "/" + file;
    }

    function importOrReuseFootage(path) {
        // 既に project に同じファイルパスで取り込まれていれば再利用
        var proj = app.project;
        var targetFs = new File(path).fsName;
        for (var i = 1; i <= proj.numItems; i++) {
            var it = proj.item(i);
            if (it instanceof FootageItem && it.file && it.file.fsName === targetFs) {
                return it;
            }
        }
        var f = new File(path);
        if (!f.exists) return null;
        try {
            var io = new ImportOptions(f);
            return proj.importFile(io);
        } catch (e) {
            return null;
        }
    }

    function applyBgFit(layer, fit, footage) {
        var sw = footage.width, sh = footage.height;
        var dw = mainComp.width, dh = mainComp.height;
        var scaleX = 100, scaleY = 100;
        if (fit === "cover") {
            var s = Math.max(dw / sw, dh / sh) * 100;
            scaleX = scaleY = s;
        } else if (fit === "contain") {
            var s2 = Math.min(dw / sw, dh / sh) * 100;
            scaleX = scaleY = s2;
        } else if (fit === "stretch") {
            scaleX = dw / sw * 100;
            scaleY = dh / sh * 100;
        } else if (fit === "original") {
            scaleX = scaleY = 100;
        }
        var grp = getTransformGroup(layer);
        if (grp) {
            try { grp.property("ADBE Scale").setValue([scaleX, scaleY]); } catch (e) {}
            try { grp.property("ADBE Position").setValue([dw / 2, dh / 2]); } catch (e) {}
        }
    }

    function applyBgOpacityWithFade(layer, bg) {
        var grp = getTransformGroup(layer);
        if (!grp) return;
        var op;
        try { op = grp.property("ADBE Opacity"); } catch (e) { return; }
        if (!op) return;
        var baseOpa = ((bg.opacity != null && !isNaN(bg.opacity)) ? bg.opacity : 1) * 100;
        var fadeIn = bg.fadeIn || 0;
        var fadeOut = bg.fadeOut || 0;
        // 既存キーフレを除去
        while (op.numKeys > 0) op.removeKey(1);
        if (fadeIn <= 0 && fadeOut <= 0) {
            op.setValue(baseOpa);
            return;
        }
        var tIn = layer.inPoint;
        var tOut = layer.outPoint;
        if (fadeIn > 0) {
            try { op.setValueAtTime(tIn, 0); } catch (e) {}
            try { op.setValueAtTime(tIn + fadeIn, baseOpa); } catch (e) {}
        } else {
            try { op.setValueAtTime(tIn, baseOpa); } catch (e) {}
        }
        if (fadeOut > 0) {
            try { op.setValueAtTime(tOut - fadeOut, baseOpa); } catch (e) {}
            try { op.setValueAtTime(tOut, 0); } catch (e) {}
        } else {
            try { op.setValueAtTime(tOut, baseOpa); } catch (e) {}
        }
    }

    function placeTitles(titles, jsonDir, stats) {
        for (var i = 0; i < titles.length; i++) {
            var t = titles[i];
            var label = "タイトル #" + (t.id != null ? t.id : i);
            if (t.tIn == null) {
                stats.errors.push(label + ": tIn 未設定");
                continue;
            }
            // tOut は素材があれば素材尺で決まるので未設定でも OK
            if (t.tOut != null && t.tOut <= t.tIn) {
                stats.errors.push(label + ": tOut <= tIn");
                continue;
            }
            try {
                var font = t.font || {};
                var mainSize = font.size || 96;
                var subSize = font.subSize || 36;
                var fontFamily = font.family || "Yu Mincho";
                var y = layoutToY(t.layout);
                var hasText = t.text && t.text.length > 0;
                var hasSub = t.subtext && t.subtext.length > 0;
                var hasFile = t.file && t.file.length > 0;
                var hasTemplate = t.template && t.template.length > 0;

                if (!hasText && !hasSub && !hasFile && !hasTemplate) {
                    stats.errors.push(label + ": テキストも素材もテンプレも無い、スキップ");
                    continue;
                }

                // テンプレ指定がある場合：複製 + _target 置換 + precomp 配置
                // その後 text/subtext は通常通り上に積む
                var tmplOutPoint = null;
                if (hasTemplate) {
                    tmplOutPoint = placeTitleViaTemplate(t, i, label, jsonDir, stats);
                    if (tmplOutPoint != null) {
                        stats.titlePlaced = (stats.titlePlaced || 0) + 1;
                    }
                    // 素材直配置はスキップ（テンプレに集約）。続けて下のテキスト配置へ
                    hasFile = false;
                }

                // 素材（画像/動画）：テキストの下に配置
                // 動画は素材の尺で再生、画像はテキストと同じ tIn〜tOut
                var matDurForText = null;  // 素材尺（テキストの tOut にも使う可能性）
                if (hasFile) {
                    var path = resolveBgPath(t.file, jsonDir);
                    var footage = importOrReuseFootage(path);
                    if (!footage) {
                        stats.errors.push(label + ": 素材読込失敗 " + path);
                    } else {
                        // タイトル素材は背景の上に置く。moveToEnd しない（add の直後 = 最上位のまま）
                        // 後で text レイヤが addText で更に上に来る順序になる
                        var matLyr = mainComp.layers.add(footage);
                        matLyr.inPoint = t.tIn;
                        // 素材自体に duration があれば（動画）それを使う、無ければ tOut
                        var srcDur = footage.duration || 0;
                        var matOut;
                        if (srcDur > 0) {
                            matOut = t.tIn + srcDur;
                            matDurForText = matOut;  // テキストの outPoint デフォルトに使う
                        } else {
                            matOut = t.tOut;
                        }
                        matLyr.outPoint = matOut;
                        applyBgFit(matLyr, t.fit || "cover", footage);
                        applyBgOpacityWithFade(matLyr, {
                            opacity: t.opacity != null ? t.opacity : 1,
                            fadeIn: t.fadeIn, fadeOut: t.fadeOut
                        }, matLyr.inPoint, matLyr.outPoint);
                        matLyr.name = "TITLE_" + (t.id != null ? t.id : i) + "_素材_" + basename(t.file);
                    }
                }

                // テキストの outPoint：明示指定 > 素材尺 > テンプレ尺 > null
                var textOut = (t.tOut != null)
                    ? t.tOut
                    : (matDurForText != null
                        ? matDurForText
                        : (tmplOutPoint != null ? tmplOutPoint : null));

                // メインタイトル（テキストがある時だけ）
                if (hasText) {
                    var lyr = mainComp.layers.addText(t.text);
                    var tp = getTextProp(lyr);
                    if (tp) {
                        var td = tp.value;
                        td.text = t.text;
                        var titleFontPS = resolveFontToPostScript(fontFamily);
                        try { td.font = titleFontPS; } catch (e) {}
                        try { td.fontSize = mainSize; } catch (e) {}
                        try { td.fillColor = hexToRgb01(t.color || "#FFFFFF"); } catch (e) {}
                        try { td.justification = ParagraphJustification.CENTER_JUSTIFY; } catch (e) {}
                        tp.setValue(td);
                    }
                    var pp = getPositionProp(lyr);
                    if (pp) {
                        var mainY = hasSub ? y - mainSize * 0.6 : y;
                        pp.setValue([resW / 2, mainY]);
                    }
                    lyr.inPoint = t.tIn;
                    lyr.outPoint = (textOut != null) ? textOut : (t.tIn + 5);
                    applyTitleOpacityFade(lyr, t);
                    lyr.name = "TITLE_" + (t.id != null ? t.id : i);
                }

                // サブタイトル（あれば）
                if (hasSub) {
                    var sub = mainComp.layers.addText(t.subtext);
                    var stp = getTextProp(sub);
                    if (stp) {
                        var std = stp.value;
                        std.text = t.subtext;
                        var subFontPS = resolveFontToPostScript(fontFamily);
                        try { std.font = subFontPS; } catch (e) {}
                        try { std.fontSize = subSize; } catch (e) {}
                        try { std.fillColor = hexToRgb01(t.subColor || "#CADCFC"); } catch (e) {}
                        try { std.justification = ParagraphJustification.CENTER_JUSTIFY; } catch (e) {}
                        stp.setValue(std);
                    }
                    var sp = getPositionProp(sub);
                    if (sp) sp.setValue([resW / 2, y + subSize * 0.8]);
                    sub.inPoint = t.tIn;
                    sub.outPoint = (textOut != null) ? textOut : (t.tIn + 5);
                    applyTitleOpacityFade(sub, t);
                    sub.name = "TITLE_" + (t.id != null ? t.id : i) + "_sub";
                }

                stats.titlePlaced = (stats.titlePlaced || 0) + 1;
            } catch (e) {
                stats.errors.push(label + ": " + e.toString());
            }
        }
    }

    // タイトルテンプレ適用：複製コンポを作って _target を置換、main_comp に precomp 配置
    // 成功時は精密な outPoint（main_comp 時刻）を返す。失敗時 null。
    function placeTitleViaTemplate(t, idx, label, jsonDir, stats) {
        var tmplComp = compsByName[t.template];
        if (!tmplComp) {
            stats.errors.push(label + ": テンプレ '" + t.template + "' が AE に無い");
            return null;
        }

        // 1. テンプレを複製
        var dupComp;
        try {
            dupComp = tmplComp.duplicate();
            dupComp.name = t.template + "_t" + (t.id != null ? t.id : idx);
        } catch (eDup) {
            stats.errors.push(label + ": テンプレ複製失敗: " + eDup.toString());
            return null;
        }

        // 2. _target レイヤを全部集める（診断のため全レイヤ名も収集）
        var targetLayers = [];
        var allLayerNames = [];
        for (var li = 1; li <= dupComp.numLayers; li++) {
            var lyrName = dupComp.layer(li).name;
            allLayerNames.push(lyrName);
            if (lyrName === "_target") {
                targetLayers.push(dupComp.layer(li));
            }
        }
        // 診断ログ：templates.aep 側で名前が違ったり、ネスト内にある時の手がかり
        if (targetLayers.length === 0) {
            stats.errors.push(label + ": '_target' レイヤ 0個。テンプレ '" + t.template + "' のレイヤ名一覧: [" + allLayerNames.join(", ") + "]");
        }

        // 3. 全 _target をユーザ入力で置換
        //    - テキストレイヤ → title.text で上書き
        //    - フッテージレイヤ → title.file の素材で replaceSource
        var hasFile = t.file && t.file.length > 0;
        var hasText = t.text && t.text.length > 0;
        if (targetLayers.length > 0) {
            // 素材があれば import を1回だけ
            var footage = null;
            if (hasFile) {
                try {
                    var path = resolveBgPath(t.file, jsonDir);
                    footage = importOrReuseFootage(path);
                    if (!footage) {
                        stats.errors.push(label + ": 素材読込失敗 " + path);
                    }
                } catch (eF) {
                    stats.errors.push(label + ": 素材読込エラー: " + eF.toString());
                }
            }

            for (var ti = 0; ti < targetLayers.length; ti++) {
                var tl = targetLayers[ti];
                var isText = false;
                try { isText = (tl instanceof TextLayer); } catch (eT) {}

                if (isText) {
                    // テキストレイヤ：text を上書き（title.text or subtext）
                    if (hasText) {
                        var tp = getTextProp(tl);
                        if (tp) {
                            safeRemoveAllKeys(tp);
                            var td = tp.value;
                            td.text = t.text;
                            tp.setValue(td);
                            // 検証
                            try {
                                var verified = tp.value.text;
                                if (verified !== t.text) {
                                    stats.errors.push(label + ": '_target' #" + (ti + 1) + " テキスト書込み未反映 (got: '" + verified + "', want: '" + t.text + "')");
                                }
                            } catch (eVer) {}
                        } else {
                            stats.errors.push(label + ": '_target' #" + (ti + 1) + " Source Text 取得失敗");
                        }
                    } else {
                        stats.errors.push(label + ": '_target' #" + (ti + 1) + " はテキストレイヤだが title.text 未指定");
                    }
                } else {
                    // フッテージレイヤ：素材で置換
                    if (footage) {
                        try {
                            tl.replaceSource(footage, true);
                            // 検証：source が変わったか
                            try {
                                if (tl.source && tl.source.name !== footage.name) {
                                    stats.errors.push(label + ": '_target' #" + (ti + 1) + " replaceSource 未反映 (now: " + tl.source.name + ")");
                                }
                            } catch (eVerS) {}
                        } catch (eRepl) {
                            stats.errors.push(label + ": '_target' #" + (ti + 1) + " replaceSource 失敗: " + eRepl.toString());
                        }
                    } else if (!hasFile) {
                        stats.errors.push(label + ": '_target' #" + (ti + 1) + " はフッテージだが title.file 未指定");
                    }
                }
            }
        } else if (hasFile || hasText) {
            stats.errors.push(label + ": テンプレ内に '_target' レイヤが見つからない");
        }
        // hasFile=false なら _target はテンプレのプレースホルダーのまま

        // 4. precomp として main_comp に配置
        var precompLayer;
        try {
            precompLayer = mainComp.layers.add(dupComp);
            // moveToEnd しない → 背景の上、文字の下
        } catch (eAdd) {
            stats.errors.push(label + ": precomp 配置失敗: " + eAdd.toString());
            return null;
        }
        var dur = dupComp.duration;

        // startTime を tIn にしてアニメ開始位置を tIn に
        try { precompLayer.startTime = t.tIn; } catch (eS) {}

        // tOut が指定されてれば、テンプレを tOut-tIn に時間ストレッチ
        if (t.tOut != null && t.tOut > t.tIn && dur > 0) {
            var desiredDur = t.tOut - t.tIn;
            var stretchPct = (desiredDur / dur) * 100;
            try {
                precompLayer.stretch = stretchPct;
            } catch (eStr) {
                stats.errors.push(label + ": stretch 設定失敗: " + eStr.toString());
            }
            // stretch 後の outPoint は startTime + desiredDur になっているはず
            try { precompLayer.inPoint = t.tIn; } catch (eI) {}
            try { precompLayer.outPoint = t.tOut; } catch (eO) {}
        } else {
            // tOut 未指定：テンプレ尺そのまま
            try { precompLayer.inPoint = t.tIn; } catch (eI) {}
            try { precompLayer.outPoint = t.tIn + dur; } catch (eO) {}
        }

        // 5. fade とオパシティを precomp 外側に適用
        applyTitleOpacityFade(precompLayer, t);

        precompLayer.name = "TITLE_" + (t.id != null ? t.id : idx) + "_tpl_" + t.template;
        // 実際の outPoint（テキスト配置時の参考に）
        var resultOut = (t.tOut != null) ? t.tOut : (t.tIn + dur);
        return resultOut;
    }

    function applyTitleOpacityFade(layer, t) {
        var grp = getTransformGroup(layer);
        if (!grp) return;
        var op;
        try { op = grp.property("ADBE Opacity"); } catch (e) { return; }
        if (!op) return;
        while (op.numKeys > 0) op.removeKey(1);
        var fIn = t.fadeIn || 0;
        var fOut = t.fadeOut || 0;
        if (fIn <= 0 && fOut <= 0) { op.setValue(100); return; }
        var tIn = layer.inPoint;
        var tOut = layer.outPoint;
        if (fIn > 0) {
            try { op.setValueAtTime(tIn, 0); } catch (e) {}
            try { op.setValueAtTime(tIn + fIn, 100); } catch (e) {}
        } else {
            try { op.setValueAtTime(tIn, 100); } catch (e) {}
        }
        if (fOut > 0) {
            try { op.setValueAtTime(tOut - fOut, 100); } catch (e) {}
            try { op.setValueAtTime(tOut, 0); } catch (e) {}
        } else {
            try { op.setValueAtTime(tOut, 100); } catch (e) {}
        }
    }

    function placeMusic(music, jsonDir, stats) {
        if (!music || !music.file) return;
        try {
            var path = resolveBgPath(music.file, jsonDir);
            var footage = importOrReuseFootage(path);
            if (!footage) {
                stats.errors.push("楽曲: 読込失敗 " + path);
                return;
            }
            var layer = mainComp.layers.add(footage);
            try { layer.moveToEnd(); } catch (e) {}
            layer.startTime = 0;
            layer.inPoint = 0;
            // duration が指定されてれば outPoint 設定
            if (music.duration > 0) layer.outPoint = music.duration;
            layer.name = "MUSIC_" + basename(music.file);
            stats.musicPlaced = true;
        } catch (e) {
            stats.errors.push("楽曲: " + e.toString());
        }
    }

    function applyBlendMode(layer, blend) {
        var key = String(blend || "normal").toLowerCase();
        var map = {
            "normal":      BlendingMode.NORMAL,
            "multiply":    BlendingMode.MULTIPLY,
            "screen":      BlendingMode.SCREEN,
            "overlay":     BlendingMode.OVERLAY,
            "darken":      BlendingMode.DARKEN,
            "lighten":     BlendingMode.LIGHTEN,
            "color_burn":  BlendingMode.COLOR_BURN,
            "color_dodge": BlendingMode.COLOR_DODGE,
            "soft_light":  BlendingMode.SOFT_LIGHT,
            "hard_light":  BlendingMode.HARD_LIGHT,
            "difference":  BlendingMode.DIFFERENCE,
            "exclusion":   BlendingMode.EXCLUSION,
            "add":         BlendingMode.ADD,
            "alpha_add":   BlendingMode.ALPHA_ADD,
            "hue":         BlendingMode.HUE,
            "saturation":  BlendingMode.SATURATION,
            "color":       BlendingMode.COLOR,
            "luminosity":  BlendingMode.LUMINOSITY
        };
        var mode = map[key];
        if (mode != null) {
            try { layer.blendingMode = mode; } catch (e) {}
        }
    }

    // ==========================================================
    // ジッター（app/core/utils.js の parseJitterBlocks / jitterOffsetFor と同等の移植）
    // ==========================================================

    // "/" で区切ったブロック情報を返す。"/" が無ければ全体 1 ブロック。
    // 戻り値: [{start, end}, ...]（chars インデックス基準、end は inclusive）
    // app 側 splitChars と同じく "\\n" リテラルと実改行は除外。
    function parseJitterBlocks(text) {
        var cleaned = String(text == null ? "" : text)
            .replace(/\\n/g, "").replace(/\n/g, "");
        var blocks = [];
        var cur = 0, start = 0;
        for (var i = 0; i < cleaned.length; i++) {
            var c = cleaned.charAt(i);
            if (c === "/") {
                if (cur > start) blocks.push({ start: start, end: cur - 1 });
                start = cur;
            } else {
                cur++;
            }
        }
        if (cur > start) blocks.push({ start: start, end: cur - 1 });
        if (blocks.length === 0 && cur > 0) blocks.push({ start: 0, end: cur - 1 });
        return blocks;
    }

    // Math.imul 相当（ExtendScript には無い）
    function _imul32(a, b) {
        a = a | 0; b = b | 0;
        var aHi = (a >>> 16) & 0xffff;
        var aLo = a & 0xffff;
        var bHi = (b >>> 16) & 0xffff;
        var bLo = b & 0xffff;
        return ((aLo * bLo) + (((aHi * bLo + aLo * bHi) << 16) >>> 0)) | 0;
    }

    // mulberry32 ベースのシード付き擬似乱数（app 側と同じ挙動）
    function jitterOffsetFor(seed, key, maxDx, maxDy) {
        var s = (_imul32((seed | 0), 2654435761) + _imul32((key | 0), 40503)) | 0;
        function next() {
            s = (s + 0x6D2B79F5) | 0;
            var t = s;
            t = _imul32(t ^ (t >>> 15), t | 1);
            t = t ^ (t + _imul32(t ^ (t >>> 7), t | 61));
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
        var dx = (next() * 2 - 1) * (maxDx || 0);
        var dy = (next() * 2 - 1) * (maxDy || 0);
        return { dx: dx, dy: dy };
    }

    // ==========================================================
    // 強調レベル解決（Phase 4e）
    // ==========================================================

    // 文字 ch に適用する強調レベル（0-3）を返す
    // 1. Char.emphasisLevel が直接指定されていればそれ
    // 2. Line.emphasis の部分文字列スペック（text/occurrence/level）にマッチすればそれ
    // 3. デフォルト 0
    function resolveCharEmphasis(ch, line, charIndex, allChars) {
        if (typeof ch.emphasisLevel === "number") return ch.emphasisLevel;

        var specs = line.emphasis || [];
        if (specs.length === 0) return 0;

        // chars 配列の ch を連結した文字列で位置検索（line.text は \n 等を含む可能性があるため）
        var joined = "";
        for (var j = 0; j < allChars.length; j++) joined += (allChars[j].ch || "");

        for (var s = 0; s < specs.length; s++) {
            var spec = specs[s];
            if (!spec || !spec.text || typeof spec.level !== "number") continue;
            var want = (typeof spec.occurrence === "number" && spec.occurrence > 0) ? spec.occurrence : 1;
            var startIdx = 0;
            var nth = 0;
            while (true) {
                var found = joined.indexOf(spec.text, startIdx);
                if (found < 0) break;
                nth++;
                if (nth === want) {
                    if (charIndex >= found && charIndex < found + spec.text.length) return spec.level;
                    break;
                }
                startIdx = found + 1;
            }
        }
        return 0;
    }

    // design コンポから "lv<level>" レイヤを取得。無ければ level-1, ..., lv0 にフォールバック。
    function findEmphasisLayer(designComp, level) {
        var lv = (typeof level === "number" && level >= 0) ? Math.floor(level) : 0;
        for (var n = lv; n >= 0; n--) {
            var lay = findLayerInComp(designComp, "lv" + n);
            if (lay) return { layer: lay, level: n };
        }
        return null;
    }

    // AE の app.fonts（v24+）で表示名 → PostScript 名に解決。
    // 見つからない場合は入力をそのまま返す。
    var _fontResolveCache;
    var _fontDebugShown;
    var _styleCandidates;
    var _cjkAliasMap;
    var _fontFallbackLog;   // 解決失敗したフォント名を集める（重複排除）
    function getStyleCandidates() {
        if (!_styleCandidates) {
            _styleCandidates = ["Regular", "Roman", "Medium", "Book", "Normal", "R", "W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W12", "Light", "Bold", "Demibold", "Heavy", ""];
        }
        return _styleCandidates;
    }
    function getCjkAliasMap() {
        if (_cjkAliasMap) return _cjkAliasMap;
        _cjkAliasMap = {};
        // 外部 JSON からロード（ae/font_aliases.json）
        try {
            var f = new File(File($.fileName).parent.fsName + "/font_aliases.json");
            if (f.exists) {
                f.encoding = "UTF-8";
                if (f.open("r")) {
                    var text = f.read();
                    f.close();
                    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                    var obj = JSON.parse(text);
                    if (obj && obj.aliases) {
                        for (var k in obj.aliases) if (obj.aliases.hasOwnProperty(k)) {
                            _cjkAliasMap[k] = obj.aliases[k];
                        }
                    }
                }
            }
        } catch (e) {}
        return _cjkAliasMap;
    }
    function noteFontFallback(family) {
        if (!_fontFallbackLog) _fontFallbackLog = {};
        _fontFallbackLog[family] = true;
    }
    function getFontFallbackNames() {
        if (!_fontFallbackLog) return [];
        var arr = [];
        for (var k in _fontFallbackLog) if (_fontFallbackLog.hasOwnProperty(k)) arr.push(k);
        return arr;
    }
    var _fontResolvedLog;
    function noteFontResolved(input, output, method) {
        if (!_fontResolvedLog) _fontResolvedLog = {};
        _fontResolvedLog[input] = { output: output, method: method };
    }
    function getFontResolvedSummary() {
        if (!_fontResolvedLog) return [];
        var arr = [];
        for (var k in _fontResolvedLog) if (_fontResolvedLog.hasOwnProperty(k)) {
            arr.push("'" + k + "' → '" + _fontResolvedLog[k].output + "' [" + _fontResolvedLog[k].method + "]");
        }
        return arr;
    }

    // AE 26 は「配列」を返す。len=0 なら見つからず、len>=1 なら [0] を採用。
    function _pickPS(res) {
        try {
            if (!res) return null;
            if (typeof res.length === "number") {
                if (res.length === 0) return null;
                var f0 = res[0];
                if (f0 && f0.postScriptName) return f0.postScriptName;
                return null;
            }
            // 念のため単体対応（他バージョン向け）
            if (res.postScriptName) return res.postScriptName;
        } catch (e) {}
        return null;
    }
    function tryGetFontPS(family, style) {
        try { return _pickPS(app.fonts.getFontsByFamilyNameAndStyleName(family, style)); } catch (e) { return null; }
    }
    function tryGetPSByName(name) {
        try { return _pickPS(app.fonts.getFontsByPostScriptName(name)); } catch (e) { return null; }
    }

    function resolveFontToPostScript(familyName) {
        if (!_fontResolveCache) _fontResolveCache = {};
        if (!familyName) return familyName;
        if (_fontResolveCache.hasOwnProperty(familyName)) return _fontResolveCache[familyName];
        var origInput = familyName;
        var result = familyName;
        var method = "fallback";

        // 0) 日本語エイリアス → 英語名にリライト
        var aliasMap = getCjkAliasMap();
        if (aliasMap.hasOwnProperty(familyName)) {
            familyName = aliasMap[familyName];
        }

        if (typeof app !== "undefined" && app.fonts) {
            // 1) 入力を PS 名として直接
            var ps = tryGetPSByName(familyName);
            if (ps) { result = ps; method = "byPostScriptName(input)"; }

            // 2) 入力を family として、候補 style で総当たり
            if (method === "fallback") {
                var styles = getStyleCandidates();
                for (var i = 0; i < styles.length; i++) {
                    var st = styles[i];
                    var got = tryGetFontPS(familyName, st);
                    if (got) { result = got; method = "byFamily+Style('" + st + "')"; break; }
                }
            }

            // 3) 入力を "family style" と空白分割で試す
            if (method === "fallback") {
                var parts = familyName.split(/\s+/);
                for (var cut = parts.length - 1; cut >= 1; cut--) {
                    var famPart = parts.slice(0, cut).join(" ");
                    var styPart = parts.slice(cut).join(" ");
                    var got2 = tryGetFontPS(famPart, styPart);
                    if (got2) { result = got2; method = "split('" + famPart + "'/'" + styPart + "')"; break; }
                }
            }

            // 4) 空白なしの CJK フォント対策：末尾のスタイルトークンを正規表現で切り出す
            //    例：'AH白洲真楷書体W1' → family='AH白洲真楷書体' style='W1'
            if (method === "fallback") {
                var re = /^(.+?)(W12|W1|W2|W3|W4|W5|W6|W7|W8|W9|DemiBold|Demibold|Demi|SemiBold|Semibold|ExtraLight|Extralight|ExtraBold|Extrabold|Bold|Light|Heavy|Medium|Regular|Book|Thin|Black)$/;
                var m = re.exec(familyName);
                if (m && m[1] && m[2]) {
                    var got3 = tryGetFontPS(m[1], m[2]);
                    if (got3) { result = got3; method = "regex('" + m[1] + "'/'" + m[2] + "')"; }
                }
            }
        }

        _fontResolveCache[origInput] = result;
        if (method === "fallback") noteFontFallback(origInput);
        else noteFontResolved(origInput, result, method);
        return result;
    }

    // match name で Source Text プロパティを取る（日本語版 AE 対応）
    function getTextProp(layer) {
        try {
            // 推奨：シンタックスシュガー
            if (layer.text && layer.text.sourceText) return layer.text.sourceText;
        } catch (e) {}
        try {
            return layer.property("ADBE Text Properties").property("ADBE Text Document");
        } catch (e) {}
        try {
            return layer.property("Source Text");
        } catch (e) {}
        return null;
    }

    // match name で Position を取る
    function getPositionProp(layer) {
        try {
            return layer.property("ADBE Transform Group").property("ADBE Position");
        } catch (e) {}
        try {
            return layer.property("Transform").property("Position");
        } catch (e) {}
        return null;
    }

    // 次元分割 / 統合 を吸収して安全に位置を設定
    function setPositionRobust(layer, pos) {
        var grp = getTransformGroup(layer);
        if (!grp) return false;
        var posUni = null;
        try { posUni = grp.property("ADBE Position"); } catch (e) {}
        if (posUni) {
            // 分割されてたら統合に戻す
            try {
                if (posUni.dimensionsSeparated) posUni.dimensionsSeparated = false;
            } catch (eD) {}
            safeRemoveAllKeys(posUni);
            try { posUni.setValue(pos); return true; } catch (eS) {}
        }
        // フォールバック：分割プロパティに直接書く
        try {
            var px = grp.property("ADBE Position_0");
            var py = grp.property("ADBE Position_1");
            safeRemoveAllKeys(px);
            safeRemoveAllKeys(py);
            if (px) { try { px.setValue(pos[0]); } catch (e1) {} }
            if (py) { try { py.setValue(pos[1]); } catch (e2) {} }
            return true;
        } catch (eSep) {}
        return false;
    }

    // ==========================================================
    // モーション転写（Phase 4d）
    // ==========================================================

    function getTransformGroup(layer) {
        try { return layer.property("ADBE Transform Group"); } catch (e) {}
        try { return layer.property("Transform"); } catch (e) {}
        return null;
    }

    // プロパティのキーフレを安全に全削除
    function safeRemoveAllKeys(p) {
        if (!p) return;
        try {
            if (p.numKeys <= 0) return;
        } catch (e) { return; }
        try {
            while (p.numKeys > 0) p.removeKey(1);
        } catch (e) {}
    }

    // Transform 系すべての既存キーフレを除去（次元分割 Position 考慮）
    function clearTransformKeys(layer) {
        var grp = getTransformGroup(layer);
        if (!grp) return;
        // Position だけ特別扱い：分割なら unified は hidden なので分割側を消す
        try {
            var posUni = grp.property("ADBE Position");
            if (posUni) {
                var separated = false;
                try { separated = !!posUni.dimensionsSeparated; } catch (e) {}
                if (separated) {
                    safeRemoveAllKeys(grp.property("ADBE Position_0"));
                    safeRemoveAllKeys(grp.property("ADBE Position_1"));
                } else {
                    safeRemoveAllKeys(posUni);
                }
            }
        } catch (e) {}
        // 他の Transform プロパティ
        var others = ["ADBE Scale", "ADBE Rotate Z", "ADBE Opacity"];
        for (var i = 0; i < others.length; i++) {
            try { safeRemoveAllKeys(grp.property(others[i])); } catch (e) {}
        }
    }

    // Entry/Hold/Exit のキーフレを文字レイヤに転写
    function transferMotion(dstLayer, charStart, charEnd, basePos, tmpl, stats, lineId, ci) {
        var entryComp = tmpl.entry ? compsByName[tmpl.entry] : null;
        var holdComp  = tmpl.hold  ? compsByName[tmpl.hold]  : null;
        var exitComp  = tmpl.exit  ? compsByName[tmpl.exit]  : null;

        var entryDur = entryComp ? entryComp.duration : 0;
        var exitDur  = exitComp  ? exitComp.duration  : 0;
        var totalAvail = charEnd - charStart;

        // Entry + Exit がトータルより長い場合は比例縮小
        if (entryDur + exitDur > totalAvail && (entryDur + exitDur) > 0) {
            var k = totalAvail / (entryDur + exitDur);
            entryDur *= k;
            exitDur  *= k;
        }
        var holdDur = Math.max(0, totalAvail - entryDur - exitDur);

        var entryStartAbs = charStart;
        var holdStartAbs  = charStart + entryDur;
        var exitStartAbs  = charEnd - exitDur;

        if (entryComp) transferTransform(entryComp, dstLayer, entryStartAbs, basePos, stats, lineId, ci, "entry");
        if (holdComp)  transferTransform(holdComp,  dstLayer, holdStartAbs,  basePos, stats, lineId, ci, "hold");
        if (exitComp)  transferTransform(exitComp,  dstLayer, exitStartAbs,  basePos, stats, lineId, ci, "exit");
    }

    function transferTransform(srcComp, dstLayer, dstStartAbs, basePos, stats, lineId, ci, slotLabel) {
        if (srcComp.numLayers === 0) return;
        var srcLayer = srcComp.layer(1);
        var srcGrp = getTransformGroup(srcLayer);
        var dstGrp = getTransformGroup(dstLayer);
        if (!srcGrp || !dstGrp) return;
        var srcCenter = [srcComp.width / 2, srcComp.height / 2];

        // Position（次元分割対応）
        transferPosition(srcGrp, dstGrp, dstStartAbs, basePos, srcCenter, stats, lineId, ci, slotLabel);

        // Scale / Rotation / Opacity（次元分割不要、値オフセット不要）
        transferSimple(srcGrp, dstGrp, "ADBE Scale",    dstStartAbs, stats, lineId, ci, slotLabel);
        transferSimple(srcGrp, dstGrp, "ADBE Rotate Z", dstStartAbs, stats, lineId, ci, slotLabel);
        transferSimple(srcGrp, dstGrp, "ADBE Opacity",  dstStartAbs, stats, lineId, ci, slotLabel);
    }

    // Position 専用：dimensionsSeparated を src→dst で揃えてから転写
    // src にキーフレが無いスロットは dst の状態を絶対に触らない（前スロットでセットした分割状態を維持）
    function transferPosition(srcGrp, dstGrp, dstStartAbs, basePos, srcCenter, stats, lineId, ci, slotLabel) {
        var srcPos, dstPos;
        try { srcPos = srcGrp.property("ADBE Position"); } catch (e1) { return; }
        try { dstPos = dstGrp.property("ADBE Position"); } catch (e2) { return; }
        if (!srcPos || !dstPos) return;

        var srcSep = false;
        try { srcSep = !!srcPos.dimensionsSeparated; } catch (e) {}

        if (srcSep) {
            // 分割 src
            var sX, sY;
            try { sX = srcGrp.property("ADBE Position_0"); } catch (e) {}
            try { sY = srcGrp.property("ADBE Position_1"); } catch (e) {}
            var sxKeys = (sX && sX.numKeys > 0);
            var syKeys = (sY && sY.numKeys > 0);
            if (!sxKeys && !syKeys) return; // キーフレ無し：何もしない
            // dst を分割に揃える
            try { dstPos.dimensionsSeparated = true; } catch (eDs) {}
            var dX, dY;
            try { dX = dstGrp.property("ADBE Position_0"); } catch (e) {}
            try { dY = dstGrp.property("ADBE Position_1"); } catch (e) {}
            if (sxKeys && dX) transferKeyframes1D(sX, dX, dstStartAbs, basePos[0] - srcCenter[0], false, stats, lineId, ci, slotLabel, "PosX");
            if (syKeys && dY) transferKeyframes1D(sY, dY, dstStartAbs, basePos[1] - srcCenter[1], false, stats, lineId, ci, slotLabel, "PosY");
        } else {
            // 統合 src
            if (srcPos.numKeys === 0) return; // キーフレ無し：何もしない（dst の状態は触らない）

            var dstSep = false;
            try { dstSep = !!dstPos.dimensionsSeparated; } catch (e) {}
            if (dstSep) {
                // 既に dst が分割（前スロットで分割した）→ 統合 src を X/Y に分けて書き込む
                var dX2, dY2;
                try { dX2 = dstGrp.property("ADBE Position_0"); } catch (e) {}
                try { dY2 = dstGrp.property("ADBE Position_1"); } catch (e) {}
                if (dX2 && dY2) transferUnifiedToSeparated(srcPos, dX2, dY2, dstStartAbs, basePos, srcCenter, stats, lineId, ci, slotLabel);
            } else {
                // dst も統合
                transferKeyframes2DSpatial(srcPos, dstPos, dstStartAbs, basePos, srcCenter, stats, lineId, ci, slotLabel, "Position");
            }
        }
    }

    // 統合 2D Position の src を、分割 dst の X/Y それぞれに転写
    function transferUnifiedToSeparated(srcPos, dX, dY, dstStartAbs, basePos, srcCenter, stats, lineId, ci, slotLabel) {
        var dstTimes = [];
        for (var k = 1; k <= srcPos.numKeys; k++) {
            var kTime = srcPos.keyTime(k);
            var v = srcPos.keyValue(k);
            var dstTime = dstStartAbs + kTime;
            try { dX.setValueAtTime(dstTime, v[0] - srcCenter[0] + basePos[0]); } catch (e) {}
            try { dY.setValueAtTime(dstTime, v[1] - srcCenter[1] + basePos[1]); } catch (e) {}
            dstTimes[k] = dstTime;
        }
        for (var k2 = 1; k2 <= srcPos.numKeys; k2++) {
            if (dstTimes[k2] == null) continue;
            var dXIdx, dYIdx;
            try { dXIdx = dX.nearestKeyIndex(dstTimes[k2]); } catch (e) { continue; }
            try { dYIdx = dY.nearestKeyIndex(dstTimes[k2]); } catch (e) { continue; }
            // 補間タイプ
            try {
                var iT = srcPos.keyInInterpolationType(k2);
                var oT = srcPos.keyOutInterpolationType(k2);
                dX.setInterpolationTypeAtKey(dXIdx, iT, oT);
                dY.setInterpolationTypeAtKey(dYIdx, iT, oT);
            } catch (e) {}
            // 時間イーズ（src は 2D 配列なので軸別に分配）
            try {
                var iE = srcPos.keyInTemporalEase(k2);
                var oE = srcPos.keyOutTemporalEase(k2);
                dX.setTemporalEaseAtKey(dXIdx, [iE[0]], [oE[0]]);
                dY.setTemporalEaseAtKey(dYIdx, [iE[1] || iE[0]], [oE[1] || oE[0]]);
            } catch (e) {}
        }
    }

    // Scale / Rotation / Opacity 用：値オフセットなし、空間タンジェントなし
    function transferSimple(srcGrp, dstGrp, matchName, dstStartAbs, stats, lineId, ci, slotLabel) {
        var sp, dp;
        try { sp = srcGrp.property(matchName); } catch (e) { return; }
        try { dp = dstGrp.property(matchName); } catch (e) { return; }
        if (!sp || !dp) return;
        if (sp.numKeys === 0) return;
        // Pass 1：全キーフレを置く
        var dstTimes = [];
        for (var k = 1; k <= sp.numKeys; k++) {
            var kTime = sp.keyTime(k);
            var kVal = sp.keyValue(k);
            var dstTime = dstStartAbs + kTime;
            try { dp.setValueAtTime(dstTime, kVal); dstTimes[k] = dstTime; }
            catch (e) { stats.errors.push("行 " + lineId + " 文字 " + ci + " " + slotLabel + " " + matchName + " key#" + k + ": " + e.toString()); dstTimes[k] = null; }
        }
        // Pass 2：属性を設定（隣接キーが揃った状態で）
        for (var k2 = 1; k2 <= sp.numKeys; k2++) {
            if (dstTimes[k2] == null) continue;
            var dstIdx; try { dstIdx = dp.nearestKeyIndex(dstTimes[k2]); } catch (e) { continue; }
            copyKeyframeAttrs(sp, k2, dp, dstIdx, false);
        }
    }

    // 1次元プロパティ用（分割後の PosX / PosY）
    function transferKeyframes1D(sp, dp, dstStartAbs, valOffset, isSpatial, stats, lineId, ci, slotLabel, label) {
        if (sp.numKeys === 0) return;
        var dstTimes = [];
        for (var k = 1; k <= sp.numKeys; k++) {
            var kTime = sp.keyTime(k);
            var kVal = sp.keyValue(k) + valOffset;
            var dstTime = dstStartAbs + kTime;
            try { dp.setValueAtTime(dstTime, kVal); dstTimes[k] = dstTime; }
            catch (e) { stats.errors.push("行 " + lineId + " 文字 " + ci + " " + slotLabel + " " + label + " key#" + k + ": " + e.toString()); dstTimes[k] = null; }
        }
        for (var k2 = 1; k2 <= sp.numKeys; k2++) {
            if (dstTimes[k2] == null) continue;
            var dstIdx; try { dstIdx = dp.nearestKeyIndex(dstTimes[k2]); } catch (e) { continue; }
            copyKeyframeAttrs(sp, k2, dp, dstIdx, isSpatial);
        }
    }

    // 2次元空間プロパティ用（統合 Position）
    function transferKeyframes2DSpatial(sp, dp, dstStartAbs, basePos, srcCenter, stats, lineId, ci, slotLabel, label) {
        if (sp.numKeys === 0) return;
        var dstTimes = [];
        for (var k = 1; k <= sp.numKeys; k++) {
            var kTime = sp.keyTime(k);
            var srcVal = sp.keyValue(k);
            var kVal = [
                srcVal[0] - srcCenter[0] + basePos[0],
                srcVal[1] - srcCenter[1] + basePos[1]
            ];
            var dstTime = dstStartAbs + kTime;
            try { dp.setValueAtTime(dstTime, kVal); dstTimes[k] = dstTime; }
            catch (e) { stats.errors.push("行 " + lineId + " 文字 " + ci + " " + slotLabel + " " + label + " key#" + k + ": " + e.toString()); dstTimes[k] = null; }
        }
        for (var k2 = 1; k2 <= sp.numKeys; k2++) {
            if (dstTimes[k2] == null) continue;
            var dstIdx; try { dstIdx = dp.nearestKeyIndex(dstTimes[k2]); } catch (e) { continue; }
            copyKeyframeAttrs(sp, k2, dp, dstIdx, true);
        }
    }

    // キーフレの属性（補間タイプ・時間イーズ・空間タンジェント・bezier flags・Roving）を転写
    function copyKeyframeAttrs(sp, srcIdx, dp, dstIdx, isSpatial) {
        // 補間タイプ（Linear / Bezier / Hold）
        var inType, outType;
        try {
            inType = sp.keyInInterpolationType(srcIdx);
            outType = sp.keyOutInterpolationType(srcIdx);
            dp.setInterpolationTypeAtKey(dstIdx, inType, outType);
        } catch (e) {}

        // 時間イーズ（速度・影響度。ハンドル調整値はここに乗る）
        try {
            var inEase = sp.keyInTemporalEase(srcIdx);
            var outEase = sp.keyOutTemporalEase(srcIdx);
            dp.setTemporalEaseAtKey(dstIdx, inEase, outEase);
        } catch (e) {}

        // 空間タンジェント（Position 系のみ）
        if (isSpatial) {
            try {
                var inTan = sp.keyInSpatialTangent(srcIdx);
                var outTan = sp.keyOutSpatialTangent(srcIdx);
                dp.setSpatialTangentsAtKey(dstIdx, inTan, outTan);
            } catch (e) {}
            try { dp.setSpatialAutoBezierAtKey(dstIdx, sp.keySpatialAutoBezier(srcIdx)); } catch (e) {}
            try { dp.setSpatialContinuousAtKey(dstIdx, sp.keySpatialContinuous(srcIdx)); } catch (e) {}
            try { dp.setRovingAtKey(dstIdx, sp.keyRoving(srcIdx)); } catch (e) {}
        }
    }

    // ==========================================================
    // 設定ファイル（前回パス記憶）
    // ==========================================================
    function loadLastPath() {
        var f = new File(SETTINGS_FILE);
        if (!f.exists) return null;
        if (!f.open("r")) return null;
        var s = f.read();
        f.close();
        s = String(s || "").replace(/^\s+|\s+$/g, "");
        return s.length > 0 ? s : null;
    }
    function saveLastPath(path) {
        var f = new File(SETTINGS_FILE);
        f.encoding = "UTF-8";
        if (!f.open("w")) return;
        f.write(path);
        f.close();
    }
})();
