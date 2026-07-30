// 共通ユーティリティ
// 純粋関数のみ。副作用なし。

export function now() {
  return Math.floor(Date.now() / 1000);
}

// 配列の特定インデックスを差し替えた新しい配列
export function replaceAt(arr, idx, value) {
  const next = arr.slice();
  next[idx] = value;
  return next;
}

// 配列の特定インデックスに挿入した新しい配列
export function insertAt(arr, idx, value) {
  const next = arr.slice();
  next.splice(idx, 0, value);
  return next;
}

// 配列から特定インデックスを削除した新しい配列
export function removeAt(arr, idx) {
  const next = arr.slice();
  next.splice(idx, 1);
  return next;
}

// 配列の要素を移動（元の位置 → 新しい位置）
export function moveItem(arr, fromIdx, toIdx) {
  if (fromIdx === toIdx) return arr.slice();
  const next = arr.slice();
  const [item] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, item);
  return next;
}

// 行/背景配列から id で要素を探す
export function findById(arr, id) {
  return arr.find(item => item.id === id);
}

// 行/背景配列から id でインデックスを取得（無ければ -1）
export function indexOfId(arr, id) {
  return arr.findIndex(item => item.id === id);
}

// プロジェクトの updatedAt を更新した新オブジェクトを返す
export function touch(project) {
  return { ...project, updatedAt: now() };
}

// 文字列から1文字ずつ抽出（行内改行 \n / ジッター区切り "/" は除外、サロゲートペアは1単位扱い）
export function splitChars(text) {
  // \n リテラル（2文字）と実改行、ジッター区切り "/" をスキップ
  const clean = text.replace(/\\n/g, "").replace(/\n/g, "").replace(/\//g, "");
  return Array.from(clean);
}

// ジッター区切り "/" で分割した文字ブロック情報を返す。
// text は生の Line.text（"/" を含みうる）。
// 戻り値: [{start, end}, ...] （end は inclusive、splitChars 後のインデックス基準）
// "/" が無ければ全体で 1 ブロック。連続した "/" や先頭/末尾の "/" による空ブロックはスキップ。
export function parseJitterBlocks(text) {
  // splitChars と同じく \n を除去、"/" は境界としてのみ扱う
  const cleaned = (text || "").replace(/\\n/g, "").replace(/\n/g, "");
  const blocks = [];
  let cur = 0;   // splitChars 後のインデックス
  let start = 0;
  const arr = Array.from(cleaned);
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i];
    if (c === "/") {
      if (cur > start) blocks.push({ start, end: cur - 1 });
      start = cur;
    } else {
      cur++;
    }
  }
  if (cur > start) blocks.push({ start, end: cur - 1 });
  if (blocks.length === 0 && cur > 0) blocks.push({ start: 0, end: cur - 1 });
  return blocks;
}

// シード付き擬似乱数（mulberry32）。同じ (seed, key) で必ず同じ [dx, dy] を返す。
// key は「行 id * 1000 + ブロックインデックス」等、ブロックを一意にする整数を想定。
export function jitterOffsetFor(seed, key, maxDx, maxDy) {
  let s = (Math.imul(seed | 0, 2654435761) + Math.imul(key | 0, 40503)) | 0;
  const next = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = t ^ (t + Math.imul(t ^ (t >>> 7), t | 61));
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const dx = (next() * 2 - 1) * (maxDx || 0);
  const dy = (next() * 2 - 1) * (maxDy || 0);
  return { dx, dy };
}

// 既存 chars[] を text に合わせて同期する
// - text の各文字に対応する Char を生成
// - 既存 Char がある位置は属性を維持
export function syncChars(text, existingChars) {
  const chars = splitChars(text);
  return chars.map((ch, idx) => {
    const existing = existingChars && existingChars[idx];
    if (existing && existing.ch === ch) {
      return existing;
    }
    return { ch };
  });
}

// オブジェクトのディープクローン（JSONベース、循環なし前提）
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
