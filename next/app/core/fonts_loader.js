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
  // 読み込めたものは、その face 名で描く。
  // 和文名を渡すとウェイトが落ちる（Heavy を選んでも Regular になる）ため。
  const st = faceState.get(value);
  if (st && st.ok) return st.alias;
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
// 一覧はデザイナーの AE 機から書き出したもの。全員に同じものが出るので、
// 「一覧にある＝自分の PC に入っている」ではない。入っていないフォントを
// 選んでもブラウザは黙って別の書体で描くため、必ず確かめる。
//
// 幅を比べる方法は当てにならなかった。CSS に渡していたのが和文名
//（例：しっぽり明朝）で、OS が持つ名前と食い違うと、入っていても
// 「無い」と出てしまう。実際に誤検出が出た。
//
// そこで PostScript 名で face を作り、実際に読み込ませて確かめる。
//   - 読み込めた  → 入っている。以降その face 名で描く
//   - 失敗した    → 入っていない
// 利点は 2 つ。名前の食い違いが起きないことと、
// ウェイトまで正しく選べること（従来は Heavy を選んでも Regular で描かれていた）。
// 許可を求める画面も出ず、Mac でも同じように動く。

const faceState = new Map();   // 保存値 -> { alias, ok }
let probing = null;

function aliasOf(value) {
  return "u05_" + String(value).replace(/[^A-Za-z0-9_-]/g, "_");
}

/** その 1 つを調べて登録する。戻り値は入っているか */
async function probeOne(value) {
  if (faceState.has(value)) return faceState.get(value).ok;
  const alias = aliasOf(value);
  // PostScript 名で見つからないフォントもあるので、別名も順に試す。
  // 読み替えが設定されていれば、それを最優先で使う。
  const names = [];
  const repl = loadAliasMap()[value];
  if (repl) names.push(repl);
  names.push(value);
  const hit = aeFonts && aeFonts.find(f => f.postScriptName === value);
  if (hit) {
    for (const n of [hit.fullName, hit.nativeFullName, hit.familyName, hit.nativeFamilyName]) {
      if (n && !names.includes(n)) names.push(n);
    }
  }
  // どの名前で当たったかを覚えておく。
  // PostScript 名やフルネームは 1 つの書体を指すが、ファミリ名だと
  // そのファミリの標準ウェイトに解決されることがある。
  // それを先頭に置くと、どのプリセットでも同じ見た目になってしまう。
  const exactNames = new Set([repl, value, hit && hit.fullName, hit && hit.nativeFullName].filter(Boolean));
  for (const n of names) {
    try {
      const face = new FontFace(alias, 'local("' + String(n).replace(/"/g, '') + '")');
      await face.load();
      document.fonts.add(face);
      faceState.set(value, { alias, ok: true, exact: exactNames.has(n), via: n });
      return true;
    } catch (e) { /* 次の名前で試す */ }
  }
  faceState.set(value, { alias, ok: false, exact: false, via: null });
  return false;
}

/**
 * まとめて調べる。起動時に、プリセットが使うものと
 * プロジェクトで使っているものを渡す。
 */
export async function probeFonts(values) {
  const list = [...new Set((values || []).filter(Boolean))];
  probing = Promise.all(list.map(probeOne));
  await probing;
  return list.filter(v => faceState.get(v)?.ok).length;
}

/** 調べ終わっているか（まだなら判定を出さない） */
export function isFontProbed(value) {
  return faceState.has(value);
}

export function isFontValueAvailable(value) {
  if (!value) return true;
  const st = faceState.get(value);
  return st ? st.ok : true;   // 未確認のものは邪魔しない
}

// 旧 API（cssFamily を直接渡す形）。今は保存値で引くので薄い包み。
export function isFontAvailable(cssFamily) {
  return isFontValueAvailable(cssFamily);
}

/**
 * CSS の font-family に入れる並び。
 *
 * 名前を 1 つだけ渡していたため、その名前が OS の持つ名前と食い違うと
 * まったく効かなかった。読み込めた face 名を先頭に、AE 由来の別名を
 * 全部後ろに並べる。どれか 1 つでも合えば正しい書体で出る。
 */
export function fontStackFor(value) {
  if (!value) return "system-ui, sans-serif";
  const names = [];
  const st = faceState.get(value);
  // 書体を一意に特定できたときだけ先頭に置く（ウェイトまで正しく出る）。
  // ファミリ名で当たっただけのものは、後ろに回す。
  if (st && st.ok && st.exact) names.push(st.alias);
  const repl = loadAliasMap()[value];
  if (repl && !names.includes(repl)) names.push(repl);
  const hit = aeFonts && aeFonts.find(f => f.postScriptName === value);
  if (hit) {
    for (const n of [hit.nativeFamilyName, hit.familyName, hit.nativeFullName, hit.fullName]) {
      if (n && !names.includes(n)) names.push(n);
    }
  }
  if (!names.includes(value)) names.push(value);
  if (st && st.ok && !st.exact && !names.includes(st.alias)) names.push(st.alias);
  return names.map(n => "'" + String(n).replace(/'/g, "") + "'").join(", ")
       + ", system-ui, sans-serif";
}

/** 何がどう判定されたかを見るための一覧（原因切り分け用） */
export function fontProbeReport() {
  const rows = [];
  for (const [value, st] of faceState) {
    rows.push({ value, 入っている: st.ok, 一意に特定: !!st.exact, 当たった名前: st.via || null });
  }
  return rows;
}

// ---- 読み替え表 ----
//
// AE の一覧にある名前と、その PC に実際に入っている名前が食い違うことがある。
// （AE 側の書き出しが古い、別の版が入っている、名前が違う 等）
// その場合に「このプリセットのフォントは、実際にはこれ」と対応を持たせる。
// PC ごとの事情なので localStorage に置く。プロジェクトには入れない。

const ALIAS_KEY = "utamita05.fontAlias.v1";
let aliasMap = null;

function loadAliasMap() {
  if (aliasMap) return aliasMap;
  try {
    aliasMap = JSON.parse(localStorage.getItem(ALIAS_KEY) || "{}") || {};
  } catch (e) {
    aliasMap = {};
  }
  return aliasMap;
}

export function getFontAliases() { return { ...loadAliasMap() }; }

/** 読み替えを 1 つ設定する。replacement を空にすると解除 */
export function setFontAlias(value, replacement) {
  const m = loadAliasMap();
  if (replacement) m[value] = replacement; else delete m[value];
  try { localStorage.setItem(ALIAS_KEY, JSON.stringify(m)); } catch (e) { /* 保存できなくても続く */ }
  faceState.delete(value);      // 判定し直す
  return { ...m };
}

/** 読み替え後の実名（無ければそのまま） */
export function resolveFontValue(value) {
  return loadAliasMap()[value] || value;
}

// ---- この PC のフォント一覧 ----
//
// Chrome / Edge には、入っているフォントを教えてもらう仕組みがある。
// 一度だけ許可を求める画面が出る。Safari と Firefox には無いので、
// その場合はこれまでどおり AE の一覧を使う。

let localFonts = null;

export function hasLocalFontAccess() {
  return typeof window !== "undefined" && typeof window.queryLocalFonts === "function";
}

export function getLocalFonts() { return localFonts; }

export async function loadLocalFonts() {
  if (!hasLocalFontAccess()) return null;
  try {
    const list = await window.queryLocalFonts();
    localFonts = list.map(f => ({
      postscriptName: f.postscriptName, fullName: f.fullName,
      family: f.family, style: f.style,
    }));
    return localFonts;
  } catch (e) {
    return null;   // 断られた場合も、今までどおり動く
  }
}

/**
 * AE の名前に一番近い、実際に入っているフォントを探す。
 * 完全一致 → フルネーム一致 → ファミリ一致 の順。
 */
export function guessLocalFont(value) {
  if (!localFonts) return null;
  const hit = aeFonts && aeFonts.find(f => f.postScriptName === value);
  const norm = (x) => String(x || "").toLowerCase().replace(/[\s_-]/g, "");
  const want = [value, hit && hit.fullName, hit && hit.nativeFullName].filter(Boolean).map(norm);
  const fam = [hit && hit.familyName, hit && hit.nativeFamilyName].filter(Boolean).map(norm);

  let byName = localFonts.find(f => want.includes(norm(f.postscriptName)))
            || localFonts.find(f => want.includes(norm(f.fullName)));
  if (byName) return byName;
  if (!fam.length) return null;
  const sameFam = localFonts.filter(f => fam.includes(norm(f.family)));
  if (!sameFam.length) return null;
  // 同じファミリなら、スタイル名が近いものを選ぶ
  const style = norm(hit && hit.styleName);
  return sameFam.find(f => norm(f.style) === style) || sameFam[0];
}

/** 見つからないものを、この PC のフォントで自動的に埋める。戻り値は埋めた数 */
export function autoAliasMissing(values) {
  let n = 0;
  for (const v of new Set((values || []).filter(Boolean))) {
    if (loadAliasMap()[v]) continue;
    if (faceState.get(v)?.ok) continue;      // そのままで見つかっている
    const g = guessLocalFont(v);
    if (g && g.postscriptName && g.postscriptName !== v) {
      setFontAlias(v, g.postscriptName);
      n++;
    }
  }
  return n;
}
