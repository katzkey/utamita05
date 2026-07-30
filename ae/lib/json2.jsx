// json2.jsx — JSON polyfill for ExtendScript
// AE の一部バージョンには JSON がネイティブ実装されていないため補う。
// JSON.parse は eval ベース（自プロジェクトの信頼できる JSON 前提）。
// JSON.stringify は最小限の再帰実装（インデント対応）。

if (typeof JSON === "undefined") { JSON = {}; }

if (typeof JSON.parse !== "function") {
    JSON.parse = function (text) {
        if (typeof text !== "string") text = String(text);
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        return eval("(" + text + ")");
    };
}

if (typeof JSON.stringify !== "function") {
    JSON.stringify = function (value, replacer, space) {
        var indent = "";
        if (typeof space === "number") {
            for (var si = 0; si < space; si++) indent += " ";
        } else if (typeof space === "string") {
            indent = space;
        }

        var ESC_RE = new RegExp("[\\\\\"\\x00-\\x1f\\x7f-\\x9f]", "g");
        function escapeString(s) {
            return '"' + String(s).replace(ESC_RE, function (c) {
                switch (c) {
                    case "\\": return "\\\\";
                    case "\"": return "\\\"";
                    case "\b": return "\\b";
                    case "\f": return "\\f";
                    case "\n": return "\\n";
                    case "\r": return "\\r";
                    case "\t": return "\\t";
                    default:
                        var hex = c.charCodeAt(0).toString(16);
                        while (hex.length < 4) hex = "0" + hex;
                        return "\\u" + hex;
                }
            }) + '"';
        }

        function walk(v, curInd) {
            if (v === null || v === undefined) return "null";
            var t = typeof v;
            if (t === "boolean") return v ? "true" : "false";
            if (t === "number") return isFinite(v) ? String(v) : "null";
            if (t === "string") return escapeString(v);
            if (v instanceof Array) {
                if (v.length === 0) return "[]";
                var arr = [];
                var nextInd = curInd + indent;
                for (var i = 0; i < v.length; i++) {
                    var sv = walk(v[i], nextInd);
                    arr.push(indent ? (nextInd + sv) : sv);
                }
                return indent
                    ? "[\n" + arr.join(",\n") + "\n" + curInd + "]"
                    : "[" + arr.join(",") + "]";
            }
            if (t === "object") {
                var keys = [];
                for (var k in v) if (v.hasOwnProperty(k)) keys.push(k);
                if (keys.length === 0) return "{}";
                var parts = [];
                var nextInd2 = curInd + indent;
                for (var j = 0; j < keys.length; j++) {
                    var key = keys[j];
                    var sub = walk(v[key], nextInd2);
                    if (sub === undefined) continue;
                    var line = escapeString(key) + (indent ? ": " : ":") + sub;
                    parts.push(indent ? (nextInd2 + line) : line);
                }
                return indent
                    ? "{\n" + parts.join(",\n") + "\n" + curInd + "}"
                    : "{" + parts.join(",") + "}";
            }
            return undefined;
        }

        var result = walk(value, "");
        return result === undefined ? "null" : result;
    };
}
