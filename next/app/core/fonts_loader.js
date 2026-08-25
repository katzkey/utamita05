// フォント一覧ローダー（Web 版）
// AE から書き出した ae/ae_fonts.json を静的配信する前提。
//   → 表示は日本語名（nativeFullName）、値は postScriptName（AE がそのまま使える）
// 読めなかった場合は代表的な日本語 AE フォントの最小セットで動作継続。

let aeFonts = null;
let sysFonts = null;
let pending = null;

// 最終フォールバック：主な日本語フォント（AE 標準）
const FALLBACK_FONTS = [
  { postScriptName: "YuGothic-Medium",   familyName: "Yu Gothic",   styleName: "Medium",   nativeFamilyName: "游ゴシック",   nativeFullName: "游ゴシック Medium" },
  { postScriptName: "YuGothic-Bold",     familyName: "Yu Gothic",   styleName: "Bold",     nativeFamilyName: "游ゴシック",   nativeFullName: "游ゴシック Bold" },
  { postScriptName: "YuMincho-Regular",  familyName: "Yu Mincho",   styleName: "Regular",  nativeFamilyName: "游明朝",       nativeFullName: "游明朝 Regular" },
  { postScriptName: "YuMincho-Demibold", familyName: "Yu Mincho",   styleName: "Demibold", nativeFamilyName: "游明朝",       nativeFullName: "游明朝 Demibold" },
  { postScriptName: "HiraKakuProN-W3",   familyName: "Hiragino Kaku Gothic ProN", styleName: "W3", nativeFamilyName: "ヒラギノ角ゴ ProN", nativeFullName: "ヒラギノ角ゴ ProN W3" },
  { postScriptName: "HiraKakuProN-W6",   familyName: "Hiragino Kaku Gothic ProN", styleName: "W6", nativeFamilyName: "ヒラギノ角ゴ ProN", nativeFullName: "ヒラギノ角ゴ ProN W6" },
  { postScriptName: "HiraMinProN-W3",    familyName: "Hiragino Mincho ProN",       styleName: "W3", nativeFamilyName: "ヒラギノ明朝 ProN", nativeFullName: "ヒラギノ明朝 ProN W3" },
  { postScriptName: "HiraMinProN-W6",    familyName: "Hiragino Mincho ProN",       styleName: "W6", nativeFamilyName: "ヒラギノ明朝 ProN", nativeFullName: "ヒラギノ明朝 ProN W6" },
];

export async function loadFonts() {
  if (aeFonts || sysFonts) return;
  if (pending) return pending;
  pending = (async () => {
    // ae/ae_fonts.json を静的配信から取得（app/ の 1 階層上）
    try {
      const res = await fetch("../ae/ae_fonts.json");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.fonts) && data.fonts.length > 0) {
          aeFonts = data.fonts;
          console.log(`[fonts] AE フォント一覧 ${aeFonts.length} 件 (${data.generatedAt || "?"})`);
          return;
        }
      }
    } catch (e) { /* fall through */ }
    // フォールバック：代表的な日本語フォントの最小セット
    aeFonts = FALLBACK_FONTS;
    console.warn(`[fonts] ae_fonts.json が読めなかったので代表的な ${aeFonts.length} 個で継続`);
  })();
  return pending;
}

// 互換 API（既存呼び出し元用）
export async function loadSystemFonts() { return loadFonts(); }

export function isAeFontList() {
  return !!aeFonts;
}

// ドロップダウン用エントリ一覧
// { value: 保存する値, label: 表示名, cssFamily: ブラウザ描画用 font-family }
export function getFontEntries() {
  if (aeFonts) {
    return aeFonts.map(f => ({
      value: f.postScriptName,
      label: (f.nativeFullName || f.fullName || `${f.familyName} ${f.styleName}`).trim(),
      cssFamily: f.nativeFamilyName || f.familyName || "",
    }));
  }
  if (sysFonts) {
    return sysFonts.map(name => ({ value: name, label: name, cssFamily: name }));
  }
  return [];
}

// 保存値（PS名 or 名前）→ CSS 用 family 名
export function cssFamilyFor(value) {
  if (!value) return "";
  if (aeFonts) {
    const hit = aeFonts.find(f => f.postScriptName === value);
    if (hit) return hit.nativeFamilyName || hit.familyName || value;
  }
  return value; // システムフォント名ならそのまま CSS に使える
}

// 保存値 → 表示ラベル
export function labelFor(value) {
  if (!value) return "";
  if (aeFonts) {
    const hit = aeFonts.find(f => f.postScriptName === value);
    if (hit) return (hit.nativeFullName || hit.fullName || `${hit.familyName} ${hit.styleName}`).trim();
  }
  return value;
}

// 旧 API 互換（settings_tab 等が使っていた）
export function getCachedFonts() {
  return getFontEntries().map(e => e.value);
}

// ---- その PC にフォントが入っているか ----
//
// 一覧はデザイナーの AE 機から書き出したものなので、全員に同じ 599 件が出る。
// 「一覧にある＝自分の PC に入っている」ではない。入っていないフォントを選んでも
// ブラウザは黙って別の書体で描くので、気づかないまま作り込むことになる。
//
// document.fonts.check() は Web フォントの読み込み判定なので、ここでは使えない
// （入っていない名前でも true を返す）。実際に描いた幅を、土台のフォントだけの
// 幅と比べて、変われば「入っている」と見なす。
const fontAvailCache = new Map();
let availCanvas = null;

export function isFontAvailable(cssFamily) {
  const fam = String(cssFamily || "").trim();
  if (!fam) return true;                       // 「継承」などは判定しない
  if (fontAvailCache.has(fam)) return fontAvailCache.get(fam);

  let ok = false;
  try {
    availCanvas = availCanvas || document.createElement("canvas");
    const c = availCanvas.getContext("2d");
    const probe = "あアA国永0";                 // 和欧混在。どれかで差が出る
    const q = fam.replace(/'/g, "\'");
    // 土台を 3 つ試す。指定が効いていれば、どれか 1 つでも幅が変わる
    for (const base of ["serif", "sans-serif", "monospace"]) {
      c.font = `72px ${base}`;
      const w0 = c.measureText(probe).width;
      c.font = `72px '${q}', ${base}`;
      if (Math.abs(c.measureText(probe).width - w0) > 0.5) { ok = true; break; }
    }
  } catch (e) {
    ok = true;   // 判定できない環境では邪魔をしない（今までどおり）
  }
  fontAvailCache.set(fam, ok);
  return ok;
}

/** 保存値（postScriptName 等）で判定する */
export function isFontValueAvailable(value) {
  return isFontAvailable(cssFamilyFor(value));
}
