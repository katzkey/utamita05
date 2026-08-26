// カスタムプリセット（作業者が自分で作る座布団プリセット）
//
// 保存先の考え方：
//  - localStorage を主：保存した瞬間から次に開いても居る。毎回ファイルを読む手間が無い
//  - .json 書き出し/読み込みを従：localStorage はキャッシュクリアで消えるし
//    他の作業者に渡せないので、共有とバックアップはファイル経由で行う
//
// ビルトインの ZABUTON_PRESETS と同じ形（{ id, category, label, apply }）で持つ。
// category は固定で CUSTOM_CATEGORY。id は "custom_zab_<epoch>_<rand>"。

import { setCustomZabutonPresets, getCustomZabutonPresets } from "./presets.js?v=2d47649";

const STORAGE_KEY = "utamita05.customPresets.v1";
export const CUSTOM_CATEGORY = "カスタム";

// ---- localStorage 読み書き ----

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { zabuton: [] };
    const obj = JSON.parse(raw);
    return { zabuton: Array.isArray(obj?.zabuton) ? obj.zabuton : [] };
  } catch (e) {
    console.warn("カスタムプリセットの読み込みに失敗しました:", e);
    return { zabuton: [] };
  }
}

function writeStore(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, zabuton: list }));
    return true;
  } catch (e) {
    // 容量超過など
    console.error("カスタムプリセットの保存に失敗しました:", e);
    return false;
  }
}

// 起動時に localStorage → presets.js のレジストリへ流し込む
export function initCustomPresets() {
  const { zabuton } = readStore();
  setCustomZabutonPresets(sanitizeList(zabuton));
  return getCustomZabutonPresets();
}

// ---- 妥当性チェック（壊れた JSON を読んでも落ちないように） ----

// カスタムに入れる項目。動きは入れない（見た目と動きは別々に選べるようにするため）。
//   文字 … フォント種類 / サイズ / イタリック / 字間 / カーニング
//   配置 … レイアウト / 位置の微調整
//   装飾 … 座布団 / 光彩 / 文字色 / 縁取り / 下線 / ずらし
const APPLY_KEYS = [
  "fontOverride", "tracking", "interTypeGap", "autoKerning", "kerning",
  "layout", "pos",
  "zabuton", "glow", "textColor", "textStroke", "underline", "jitter",
  "fontPresetId", "zabutonPresetId",   // 元にしたプリセットを覚えておく（プルダウンの表示用）
];

function sanitizeList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(p => p && typeof p.id === "string" && typeof p.label === "string" && p.apply)
    .map(p => {
      const apply = {};
      // 保存されていない項目は「触らない」。undefined と null を区別する
      //（null は「無しにする」、undefined は「そのまま」）
      for (const k of APPLY_KEYS) if (k in p.apply) apply[k] = p.apply[k];
      return { id: p.id, category: CUSTOM_CATEGORY, label: p.label, apply };
    });
}

function newId() {
  return `custom_zab_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

// ---- CRUD ----

// 行の現在の見た目（文字・配置・装飾）をまるごとプリセットとして保存する。
// 動き（イン / アウト）は入れない。
export function saveLineAsCustomPreset(line, label) {
  const name = String(label || "").trim();
  if (!name) return { ok: false, error: "名前を入力してください" };

  const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
  const preset = {
    id: newId(),
    category: CUSTOM_CATEGORY,
    label: name,
    apply: {
      // 文字
      fontOverride: clone(line.fontOverride),
      tracking: line.tracking ?? 0,
      interTypeGap: line.interTypeGap ?? 0,
      autoKerning: !!line.autoKerning,
      kerning: clone(line.kerning),
      // 配置
      layout: line.layout ?? null,
      pos: clone(line.pos) || { dx: 0, dy: 0, scale: 1.0, rot: 0 },
      // 装飾
      zabuton: clone(line.zabuton),
      glow: clone(line.glow),
      textColor: line.textColor ?? null,
      textStroke: clone(line.textStroke),
      underline: clone(line.underline),
      jitter: clone(line.jitter),
      // 元にしたプリセット（上のプルダウンの表示を合わせるため）
      fontPresetId: line.fontPresetId ?? null,
      zabutonPresetId: line.zabutonPresetId ?? null,
    },
  };

  const list = getCustomZabutonPresets().slice();
  // 同名があれば上書き（作業者が同じ名前で保存し直すケース）
  const at = list.findIndex(p => p.label === name);
  if (at >= 0) preset.id = list[at].id, list[at] = preset;
  else list.push(preset);

  if (!writeStore(list)) return { ok: false, error: "保存できませんでした（保存領域が一杯かもしれません）" };
  setCustomZabutonPresets(list);
  return { ok: true, preset, overwritten: at >= 0 };
}

export function deleteCustomPreset(id) {
  const list = getCustomZabutonPresets().filter(p => p.id !== id);
  if (!writeStore(list)) return false;
  setCustomZabutonPresets(list);
  return true;
}

export function isCustomPresetId(id) {
  return typeof id === "string" && id.startsWith("custom_zab_");
}

// ---- 書き出し / 読み込み ----

export function exportCustomPresetsJson() {
  return JSON.stringify({ version: 1, zabuton: getCustomZabutonPresets() }, null, 2);
}

// mode: "merge"（同名は上書き、他は残す） | "replace"（全部入れ替え）
export function importCustomPresetsJson(jsonText, mode = "merge") {
  let obj;
  try {
    obj = JSON.parse(jsonText);
  } catch (e) {
    return { ok: false, error: "JSON として読めませんでした" };
  }
  const incoming = sanitizeList(obj?.zabuton);
  if (!incoming.length) return { ok: false, error: "カスタムプリセットが入っていません" };

  let list;
  if (mode === "replace") {
    list = incoming;
  } else {
    list = getCustomZabutonPresets().slice();
    for (const p of incoming) {
      const at = list.findIndex(x => x.label === p.label);
      if (at >= 0) list[at] = { ...p, id: list[at].id };
      else list.push(p);
    }
  }
  if (!writeStore(list)) return { ok: false, error: "保存できませんでした" };
  setCustomZabutonPresets(list);
  return { ok: true, count: incoming.length, total: list.length };
}
