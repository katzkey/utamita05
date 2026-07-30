// font_inspector.jsx
// 使い方：
//   1. AE で新規テキストレイヤーを作り、Character パネルで目的のフォントを選ぶ
//   2. その テキストレイヤーを 1つだけ選択した状態で本スクリプトを実行
//   3. 出たダイアログの内容を貼ってください（AE 内でその フォントが何と呼ばれてるかが分かる）

(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("コンポを開いてください"); return; }
    var sel = comp.selectedLayers;
    if (!sel || sel.length === 0) { alert("テキストレイヤを1つ選択してください"); return; }
    var lyr = sel[0];
    var tp;
    try { tp = lyr.property("ADBE Text Properties").property("ADBE Text Document"); }
    catch (e) { alert("テキストレイヤではないかも: " + e); return; }
    if (!tp) { alert("Source Text が取れませんでした"); return; }

    var td = tp.value;
    var lines = [];
    function safe(name, fn) {
        try { lines.push(name + ": " + fn()); } catch (e) { lines.push(name + ": (err) " + (e.message || e)); }
    }
    lines.push("=== 選択テキストレイヤーのフォント情報 ===");
    safe("font (PostScript)", function () { return td.font; });
    safe("fontFamily",         function () { return td.fontFamily; });
    safe("fontStyle",          function () { return td.fontStyle; });
    safe("text",               function () { return String(td.text).slice(0, 40); });

    // AE の Font DB から逆引き（PS 名 → Font オブジェクト）
    if (app.fonts && typeof app.fonts.getFontsByPostScriptName === "function") {
        try {
            var fo = app.fonts.getFontsByPostScriptName(td.font);
            var f = (fo && fo.length) ? fo[0] : fo;
            if (f) {
                lines.push("");
                lines.push("=== app.fonts DB から逆引き ===");
                safe("  familyName",     function () { return f.familyName; });
                safe("  styleName",      function () { return f.styleName; });
                safe("  postScriptName", function () { return f.postScriptName; });
                try { if (typeof f.nativeFontName !== "undefined") safe("  nativeFontName", function () { return f.nativeFontName; }); } catch (e) {}
                try { if (typeof f.technology !== "undefined") safe("  technology", function () { return f.technology; }); } catch (e) {}
            } else {
                lines.push("(getFontsByPostScriptName でヒットなし)");
            }
        } catch (e) {
            lines.push("逆引きエラー: " + (e.message || e));
        }
    }

    var text = lines.join("\n");
    // ファイルにも保存
    try {
        var out = new File(File($.fileName).parent.fsName + "/font_inspector_result.txt");
        out.encoding = "UTF-8";
        out.open("w"); out.write(text); out.close();
        text += "\n\n→ font_inspector_result.txt に保存済";
    } catch (e) {}
    alert(text);
})();
