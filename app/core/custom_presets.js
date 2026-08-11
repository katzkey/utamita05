// カスタムプリセット（作業者が自分で作る座布団プリセット）
//
// 保存先の考え方：
//  - localStorage を主：保存した瞬間から次に開いても居る。毎回ファイルを読む手間が無い
//  - .json 書き出し/読み込みを従：localStorage はキャッシュクリアで消えるし
//    他の作業者に渡せないので、共有とバックアップはファイル経由で行う
//
// ビルトインの ZABUTON_PRESETS と同じ形（{ id, category, label, apply }）で持つ。
// category は固定で CUSTOM_CATEGORY。id は "custom_zab_<epoch>_<rand>"。

import { setCustomZabutonPresets, getCustomZabutonPresets } from "./presets.js?v=058eb8e";

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

function sanitizeList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(p => p && typeof p.id === "string" && typeof p.label === "string" && p.apply)
    .map(p => ({
      id: p.id,
      category: CUSTOM_CATEGORY,
      label: p.label,
      apply: {
        zabuton: p.apply.zabuton ?? null,
        glow: p.apply.glow ?? null,
        textColor: p.apply.textColor ?? null,
        textStroke: p.apply.textStroke ?? null,
        underline: p.apply.underline ?? null,
      },
    }));
}

function newId() {
  return `custom_zab_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

// ---- CRUD ----

// 行の現在の見た目（座布団・光彩・文字色・縁取り・下線）をプリセットとして保存
export function saveLineAsCustomPreset(line, label) {
  const name = String(label || "").trim();
  if (!name) return { ok: false, error: "名前を入力してください" };

  const preset = {
    id: newId(),
    category: CUSTOM_CATEGORY,
    label: name,
    apply: {
      zabuton: line.zabuton ? JSON.parse(JSON.stringify(line.zabuton)) : null,
      glow: line.glow ? JSON.parse(JSON.stringify(line.glow)) : null,
      textColor: line.textColor ?? null,
      textStroke: line.textStroke ? JSON.parse(JSON.stringify(line.textStroke)) : null,
      underline: line.underline ? JSON.parse(JSON.stringify(line.underline)) : null,
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
