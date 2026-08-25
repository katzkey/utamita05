// font_probe.jsx  — 防弾版
// 各ステップごとにファイルへ逐次書き出す。途中で落ちても font_probe_result.txt に残る。
// 使い方：ファイル > スクリプト > スクリプトファイルを実行 > font_probe.jsx
// 実行後、ae/font_probe_result.txt の中身を貼ってください。

(function () {
    var LOGPATH = File($.fileName).parent.fsName + "/font_probe_result.txt";
    var out = [];

    // エラーを絶対に落ちずに文字列化する
    function errStr(e) {
        var s = null;
        try { s = e.message; } catch (x1) {}
        if (s == null) { try { s = e.description; } catch (x2) {} }
        if (s == null) { try { s = e.toString(); } catch (x3) {} }
        if (s == null) { try { s = "" + e; } catch (x4) {} }
        if (s == null) return "(stringify不能なエラー)";
        try { return String(s); } catch (x5) { return "(String()不能)"; }
    }

    function flush() {
        try {
            var f = new File(LOGPATH);
            f.encoding = "UTF-8";
            f.open("w");
            f.write(out.join("\n"));
            f.close();
        } catch (e) {}
    }
    function log(s) { out.push(String(s)); flush(); }
    function logErr(label, e) { out.push(label + ": " + errStr(e)); flush(); }

    log("=== app.fonts API ===");
    try { log("app.version: " + app.version); } catch (e) { logErr("app.version ERR", e); }
    var hasFonts = false;
    try { hasFonts = (typeof app.fonts !== "undefined") && app.fonts != null; } catch (e) { logErr("app.fonts check ERR", e); }
    log("app.fonts exists: " + hasFonts);
    if (hasFonts) {
        try { log("getFontsByFamilyNameAndStyleName: " + (typeof app.fonts.getFontsByFamilyNameAndStyleName)); } catch (e) { logErr("m1", e); }
        try { log("getFontsByPostScriptName: " + (typeof app.fonts.getFontsByPostScriptName)); } catch (e) { logErr("m2", e); }
        try { log("getFontsByFamilyName: " + (typeof app.fonts.getFontsByFamilyName)); } catch (e) { logErr("m3", e); }
    }

    // 返り値を安全に説明（各プロパティ独立 try）
    function describe(v) {
        if (v === null || v === undefined) {
            try { return String(v); } catch (e) { return "(null/undef)"; }
        }
        var s = "";
        try { s += "typeof=" + (typeof v); } catch (e) {}
        try { s += " len=" + v.length; } catch (e) {}
        try { if (v.postScriptName) s += " ps='" + v.postScriptName + "'"; } catch (e) {}
        try { if (v.familyName) s += " fam='" + v.familyName + "'"; } catch (e) {}
        try { if (v.styleName) s += " sty='" + v.styleName + "'"; } catch (e) {}
        try {
            if (v.length && v[0]) {
                var e0 = v[0];
                var sub = "";
                try { sub += "ps='" + e0.postScriptName + "'"; } catch (e) {}
                try { sub += " fam='" + e0.familyName + "'"; } catch (e) {}
                try { sub += " sty='" + e0.styleName + "'"; } catch (e) {}
                s += " | [0]: " + sub;
            }
        } catch (e) {}
        return s;
    }

    log("");
    log("=== lookup tests ===");
    var families = ["Yu Gothic", "游ゴシック", "Arial", "Yu Mincho", "游明朝"];
    if (hasFonts) {
        for (var i = 0; i < families.length; i++) {
            var name = families[i];
            log("--- '" + name + "' ---");
            try { log("  byFam+Regular: " + describe(app.fonts.getFontsByFamilyNameAndStyleName(name, "Regular"))); }
            catch (e) { logErr("  byFam+Regular ERR", e); }
            try {
                if (typeof app.fonts.getFontsByFamilyName === "function") {
                    log("  byFamilyName: " + describe(app.fonts.getFontsByFamilyName(name)));
                }
            } catch (e) { logErr("  byFamilyName ERR", e); }
            try { log("  byPostScript: " + describe(app.fonts.getFontsByPostScriptName(name))); }
            catch (e) { logErr("  byPostScript ERR", e); }
        }
    }

    log("");
    log("=== set font test ===");
    var comp = null;
    try {
        comp = app.project.items.addComp("__font_probe__", 400, 200, 1, 3, 30);
        var tl = comp.layers.addText("あいうAbc");
        var tp = tl.property("ADBE Text Properties").property("ADBE Text Document");

        try { log("初期 font: " + tp.value.font); } catch (e) { logErr("初期font", e); }
        try { log("初期 fontFamily: " + tp.value.fontFamily); } catch (e) { logErr("初期fontFamily", e); }
        try { log("初期 fontStyle: " + tp.value.fontStyle); } catch (e) { logErr("初期fontStyle", e); }

        var setTargets = ["Yu Gothic", "游ゴシック", "Arial"];
        for (var t = 0; t < setTargets.length; t++) {
            var nm = setTargets[t];
            log("--- set '" + nm + "' ---");

            // A: fontFamily に表示名
            try {
                var tdA = tp.value;
                tdA.fontFamily = nm;
                tp.setValue(tdA);
                var rA = tp.value;
                var famA = "?"; try { famA = rA.fontFamily; } catch (e) {}
                log("  [A fontFamily] → font='" + rA.font + "' family='" + famA + "'");
            } catch (eA) { logErr("  [A fontFamily] ERR", eA); }

            // B: 解決してから font
            try {
                var fo = app.fonts.getFontsByFamilyNameAndStyleName(nm, "Regular");
                var fontObj = null;
                try { fontObj = (fo && fo.length) ? fo[0] : fo; } catch (e) { fontObj = fo; }
                var ps = null;
                try { ps = fontObj ? fontObj.postScriptName : null; } catch (e) {}
                log("  [B resolve] ps='" + ps + "'");
                if (ps) {
                    var tdB = tp.value;
                    tdB.font = ps;
                    tp.setValue(tdB);
                    log("    → readback font='" + tp.value.font + "'");
                }
            } catch (eB) { logErr("  [B resolve] ERR", eB); }
        }
    } catch (eComp) {
        logErr("comp test ERR", eComp);
    }
    try { if (comp) comp.remove(); } catch (e) {}

    log("");
    log("=== 完了 ===");
    try { alert("完了。ae/font_probe_result.txt を貼ってください。\n\n" + out.join("\n").slice(0, 1500)); } catch (e) {}
})();
