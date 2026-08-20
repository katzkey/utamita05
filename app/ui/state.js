// 状態管理 + History (Undo/Redo)

import { createEmptyProject } from "../core/project.js?v=4e538c6";
import { saveFileToStore, loadFileFromStore } from "../core/file_store.js?v=4e538c6";
import { putBlob, getBlobUrl, getBlobFile, hasBlob, clearBlobs } from "../core/blob_registry.js?v=4e538c6";

// ---- 表示設定の永続化 ----
// プロジェクトの中身ではなく「どう表示していたか」を次回起動まで覚えておく。
// ここに挙げたキーだけが localStorage に残る。
const UI_PREFS_KEY = "utamita05.uiPrefs.v1";
const PERSISTED_UI_KEYS = ["previewLarge", "detailTab", "previewMotion", "previewMode"];

function loadUiPrefs() {
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    const out = {};
    for (const k of PERSISTED_UI_KEYS) if (k in obj) out[k] = obj[k];
    return out;
  } catch (e) {
    return {};   // 読めなくても既定値で動けばよい
  }
}

function saveUiPrefs() {
  try {
    const obj = {};
    for (const k of PERSISTED_UI_KEYS) obj[k] = state.ui[k];
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(obj));
  } catch (e) {
    // 保存できなくても表示状態の話なので、編集を止めない
  }
}

const state = {
  project: createEmptyProject({ name: "新規プロジェクト" }),
  ui: {
    activeTab: "lyrics",
    selectedLineIds: new Set(),
    selectedBgIds: new Set(),
    markingMode: false,
    loopCurrentRow: false,
    currentTime: 0,
    audioFile: null,         // ローカルでロードした楽曲（File or URL）
    audioUrl: null,
    dirty: false,            // 保存前の変更あり
    previewLarge: false,     // プレビュー拡大（前回の状態を復元）
    detailTab: "look",       // 詳細ペインのサブタブ "content" | "look" | "motion"
    previewMotion: true,     // 詳細ペインのプレビューで動きを繰り返す
    previewMode: "line",     // プレビューの見せ方 "line"（この行）| "song"（曲に合わせて）
    ...loadUiPrefs(),        // 保存済みがあれば既定値を上書き
  },
};

const history = {
  past: [],
  future: [],
  max: 200,
};

const listeners = new Set();

export function getState() { return state; }
export function getProject() { return state.project; }
export function getUi() { return state.ui; }

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(reason) {
  for (const fn of listeners) fn(reason);
}

// プロジェクト変更（履歴に積む）
export function setProject(newProject, opts = {}) {
  if (newProject === state.project) return;
  if (!opts.skipHistory) {
    history.past.push(state.project);
    if (history.past.length > history.max) history.past.shift();
    history.future = [];
  }
  state.project = newProject;
  state.ui.dirty = true;
  emit("project");
}

// プロジェクト差し替え（履歴クリア）
export function replaceProject(newProject) {
  state.project = newProject;
  history.past = [];
  history.future = [];
  state.ui.dirty = false;
  emit("project");
}

// UI 状態だけ変更
export function setUi(partial) {
  Object.assign(state.ui, partial);
  if (PERSISTED_UI_KEYS.some(k => k in partial)) saveUiPrefs();
  emit("ui");
}

export function canUndo() { return history.past.length > 0; }
export function canRedo() { return history.future.length > 0; }

export function undo() {
  if (!canUndo()) return;
  history.future.unshift(state.project);
  state.project = history.past.pop();
  emit("project");
}

export function redo() {
  if (!canRedo()) return;
  history.past.push(state.project);
  state.project = history.future.shift();
  emit("project");
}

export function markSaved() {
  state.ui.dirty = false;
  emit("ui");
}

// ---- 素材ファイルの Blob URL レジストリ ----

// File を登録し、Blob URL を返す（プレビュー用）。
// 同時に IndexedDB にも保存して次回セッションで復元可能にする。
// 同名で再登録した場合は古い URL を revoke してから差し替え。
export function registerFileBlob(file) {
  const url = putBlob(file);
  if (!url) return null;
  saveFileToStore(file.name, file);   // 次回セッションで復元できるように
  emit("fileBlobs");
  return url;
}

// IndexedDB から復元して Blob URL を発行。メモリに既にあればそれを返す。
export async function restoreFileBlob(name) {
  if (!name) return null;
  const existing = getBlobUrl(name);
  if (existing) return existing;
  const file = await loadFileFromStore(name);
  if (!file) return null;
  const url = putBlob(file);
  emit("fileBlobs");
  return url;
}

// project 内で参照される全ファイルを IndexedDB から復元する。
// 戻り値：{ restored: [names], missing: [names] }
export async function restoreProjectFiles(project) {
  const names = new Set();
  if (project.music && project.music.file) names.add(project.music.file);
  for (const bg of project.backgrounds || []) {
    if (bg.file && !bg.solidColor) names.add(bg.file);
  }
  for (const t of project.titles || []) {
    if (t.file) names.add(t.file);
  }
  const restored = [], missing = [];
  for (const name of names) {
    (await restoreFileBlob(name)) ? restored.push(name) : missing.push(name);
  }
  return { restored, missing };
}

export const getFileBlobUrl = getBlobUrl;
export const getFileBlob = getBlobFile;
export const hasFileBlob = hasBlob;

export function clearFileBlobs() {
  clearBlobs();
  emit("fileBlobs");
}
