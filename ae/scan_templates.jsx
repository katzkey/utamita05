// scan_templates.jsx
// AE ExtendScript の一部バージョンには JSON が無いためポリフィルを読み込む
//@include "lib/json2.jsx"
#include "lib/json2.jsx"
// templates.aep を開いた状態で実行 → 同階層に templates.json を書き出す。
//
// docs/03_templates.md「templates.json 契約」に準拠。
//
// 検出ルール：
//   "_entry_*"  → slot: "entry"
//   "_hold_*"   → slot: "hold"
//   "_exit_*"   → slot: "exit"
//   "_design_*" → slot: "design"
//   それ以外    → スキップ
//
// displayName：コンポの comment 欄に書いた1行目を使う。空ならコンポ名そのまま。
// duration: コンポの duration（秒）
// emphasisLayers: design スロットで、"lv0".."lv3" 形式のレイヤ名を列挙

(function () {
    var proj = app.project;
    if (!proj || !proj.file) {
        alert("AE プロジェクトが開かれていません。templates.aep を開いてから実行してください。");
        return;
    }

    var sourceFile = proj.file.name;
    var outDir = proj.file.parent;
    var outFile = new File(outDir.fsName + "/templates.json");

    var SLOT_PREFIX = {
        "_entry_":  "entry",
        "_hold_":   "hold",
        "_exit_":   "exit",
        "_design_": "design",
        "_title_":  "title"
    };

    function detectSlot(name) {
        for (var prefix in SLOT_PREFIX) {
            if (name.indexOf(prefix) === 0) return SLOT_PREFIX[prefix];
        }
        return null;
    }

    function isEmphasisLayerName(name) {
        // "lv0" "lv1" "lv2" "lv3"
        return /^lv[0-3]$/.test(String(name || ""));
    }

    function collectEmphasisLayers(comp) {
        var found = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            var ly = comp.layer(i);
            if (isEmphasisLayerName(ly.name)) found.push(ly.name);
        }
        // ソートして重複を除去
        found.sort();
        var uniq = [];
        for (var j = 0; j < found.length; j++) {
            if (uniq[uniq.length - 1] !== found[j]) uniq.push(found[j]);
        }
        return uniq;
    }

    function firstLine(s) {
        if (!s) return "";
        var m = String(s).split(/\r?\n/);
        return m[0] || "";
    }

    var entries = [];
    for (var i = 1; i <= proj.numItems; i++) {
        var item = proj.item(i);
        if (!(item instanceof CompItem)) continue;
        var slot = detectSlot(item.name);
        if (!slot) continue;

        var entry = {
            name: item.name,
            slot: slot,
            displayName: firstLine(item.comment) || item.name,
            duration: Number(item.duration.toFixed(3)),
            tags: []
        };
        if (slot === "design") {
            entry.emphasisLayers = collectEmphasisLayers(item);
        }
        if (slot === "title") {
            // _target レイヤの有無を確認
            var hasTarget = false;
            for (var ti = 1; ti <= item.numLayers; ti++) {
                if (item.layer(ti).name === "_target") { hasTarget = true; break; }
            }
            entry.hasTarget = hasTarget;
        }
        entries.push(entry);
    }

    // name でソート（決定的に）
    entries.sort(function (a, b) {
        if (a.name < b.name) return -1;
        if (a.name > b.name) return 1;
        return 0;
    });

    // ISO8601 (UTC)
    function isoNow() {
        var d = new Date();
        function pad(n) { return n < 10 ? "0" + n : "" + n; }
        return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate())
            + "T" + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds()) + "Z";
    }

    // JSON.stringify が ExtendScript で使える前提（CS5 以降は json2 をビルトイン提供）
    // 念のため、無い環境向けに簡易シリアライザを定義
    function toJSON(obj, indent) {
        if (typeof JSON !== "undefined" && JSON.stringify) {
            return JSON.stringify(obj, null, indent);
        }
        return simpleStringify(obj, indent || 0, 0);
    }
    function simpleStringify(v, indent, depth) {
        var pad = "";
        for (var i = 0; i < indent * (depth + 1); i++) pad += " ";
        var outerPad = "";
        for (var k = 0; k < indent * depth; k++) outerPad += " ";
        if (v === null || v === undefined) return "null";
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        if (typeof v === "string") return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
        if (v instanceof Array) {
            if (v.length === 0) return "[]";
            var parts = [];
            for (var ai = 0; ai < v.length; ai++) parts.push(pad + simpleStringify(v[ai], indent, depth + 1));
            return "[\n" + parts.join(",\n") + "\n" + outerPad + "]";
        }
        var keys = [];
        for (var kk in v) if (v.hasOwnProperty(kk)) keys.push(kk);
        if (keys.length === 0) return "{}";
        var parts2 = [];
        for (var ki = 0; ki < keys.length; ki++) {
            parts2.push(pad + '"' + keys[ki] + '": ' + simpleStringify(v[keys[ki]], indent, depth + 1));
        }
        return "{\n" + parts2.join(",\n") + "\n" + outerPad + "}";
    }

    var data = {
        version: 1,
        scannedAt: isoNow(),
        sourceFile: sourceFile,
        templates: entries
    };

    var json = toJSON(data, 2);
    outFile.encoding = "UTF-8";
    if (!outFile.open("w")) {
        alert("出力ファイルが開けません: " + outFile.fsName + "\n環境設定 > スクリプトとエクスプレッション > 「ファイルへの書き込みを許可」を有効にしてください。");
        return;
    }
    outFile.write(json);
    outFile.close();

    alert("templates.json を書き出しました。\n"
        + "出力: " + outFile.fsName + "\n"
        + "件数: " + entries.length);
})();
