// dump_ae_fonts.jsx
// AE のフォント一覧を ae_fonts.json に書き出す。
// 発見済み：app.fonts.allFonts は 2次元配列。all[i] が1ファミリ分の Font[], all[i][j] が Font。
// Font には familyName / styleName / postScriptName / nativeFamilyName / nativeStyleName /
// nativeFullName / fullName / location など。

(function () {
    var LOGPATH = File($.fileName).parent.fsName + "/ae_fonts_dump.log";
    var OUTPATH = File($.fileName).parent.fsName + "/ae_fonts.json";
    var diag = [];

    function errStr(e) {
        var s = null;
        try { s = e.message; } catch (x) {}
        if (s == null) { try { s = e.description; } catch (x) {} }
        if (s == null) { try { s = e.toString(); } catch (x) {} }
        if (s == null) { try { s = "" + e; } catch (x) {} }
        try { return s == null ? "(err)" : String(s); } catch (x) { return "(String err)"; }
    }
    function flush() {
        try { var f = new File(LOGPATH); f.encoding = "UTF-8"; f.open("w"); f.write(diag.join("\n")); f.close(); } catch (e) {}
    }
    function log(s) { try { diag.push(String(s)); } catch (e) { diag.push("(log err)"); } flush(); }

    log("=== dump_ae_fonts (extract) ===");
    try { log("app.version: " + app.version); } catch (e) { log("app.version ERR: " + errStr(e)); }

    if (!app.fonts) { log("app.fonts なし。終了。"); alert("app.fonts なし"); return; }

    var all;
    try { all = app.fonts.allFonts; } catch (e) { log("allFonts ERR: " + errStr(e)); return; }
    var totalLen = 0;
    try { totalLen = all.length; } catch (e) { log("length ERR: " + errStr(e)); }
    log("allFonts (families) length: " + totalLen);

    // 個別 Font から安全にプロパティを取り出す
    function pick(f) {
        function get(name) { try { var v = f[name]; return (v === undefined || v === null) ? "" : String(v); } catch (e) { return ""; } }
        return {
            postScriptName:   get("postScriptName"),
            familyName:       get("familyName"),
            styleName:        get("styleName"),
            nativeFamilyName: get("nativeFamilyName"),
            nativeStyleName:  get("nativeStyleName"),
            nativeFullName:   get("nativeFullName"),
            fullName:         get("fullName"),
            location:         get("location"),
            technology:       get("technology")
        };
    }

    var fonts = [];
    var seen = {};
    var famErr = 0, subLenErr = 0, fontErr = 0;

    for (var i = 0; i < totalLen; i++) {
        var group = null;
        try { group = all[i]; } catch (e) { famErr++; continue; }
        if (!group) continue;
        var glen = 0;
        try { glen = group.length; } catch (e) { subLenErr++; continue; }
        for (var j = 0; j < glen; j++) {
            var f = null;
            try { f = group[j]; } catch (e) { fontErr++; continue; }
            if (!f) continue;
            var rec = null;
            try { rec = pick(f); } catch (e) { fontErr++; continue; }
            if (!rec || !rec.postScriptName) continue;
            if (seen[rec.postScriptName]) continue;
            seen[rec.postScriptName] = true;
            fonts.push(rec);
        }
        if ((i & 63) === 0) flush();
    }

    log("extract done: " + fonts.length + " fonts");
    log("famErr=" + famErr + " subLenErr=" + subLenErr + " fontErr=" + fontErr);

    // サンプル 3 件
    for (var s = 0; s < 3 && s < fonts.length; s++) {
        var r = fonts[s];
        log("  [" + s + "] ps='" + r.postScriptName + "' fam='" + r.familyName + "' sty='" + r.styleName + "' native='" + r.nativeFamilyName + " " + r.nativeStyleName + "'");
    }

    // json2 ロード
    var jsonlib = new File(File($.fileName).parent.fsName + "/lib/json2.jsx");
    if (jsonlib.exists) { try { $.evalFile(jsonlib.fsName); } catch (e) {} }

    var stamp = new Date();
    var payload = {
        generatedAt: stamp.getFullYear() + "-" +
            ("0" + (stamp.getMonth() + 1)).slice(-2) + "-" +
            ("0" + stamp.getDate()).slice(-2) + "T" +
            ("0" + stamp.getHours()).slice(-2) + ":" +
            ("0" + stamp.getMinutes()).slice(-2) + ":" +
            ("0" + stamp.getSeconds()).slice(-2),
        aeVersion: app.version,
        count: fonts.length,
        fonts: fonts
    };

    var jsonText = null;
    try { jsonText = JSON.stringify(payload, null, 2); } catch (e) { log("stringify ERR: " + errStr(e)); }

    if (jsonText) {
        try {
            var out = new File(OUTPATH);
            out.encoding = "UTF-8"; out.open("w"); out.write(jsonText); out.close();
            log("saved: " + OUTPATH);
        } catch (e) { log("save ERR: " + errStr(e)); }
    }

    flush();

    var head = "完了：" + fonts.length + " フォントを ae_fonts.json に書き出しました。\n\n";
    if (fonts.length > 0) {
        for (var k = 0; k < 5 && k < fonts.length; k++) {
            var rk = fonts[k];
            head += (rk.nativeFullName || rk.fullName || rk.postScriptName) + "  (" + rk.postScriptName + ")\n";
        }
    }
    alert(head);
})();
