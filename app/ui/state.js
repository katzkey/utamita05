// 状態管理 + History (Undo/Redo)

import { createEmptyProject } from "../core/project.js";
import { saveFileToStore, loadFileFromStore } from "../core/file_store.js";

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
  },
  // 素材ファイルの Blob URL レジストリ（filename → { file, url }）。
  // Web 版はサーバー経由でファイル配信できないので、ブラウザで選択した File を
  // ここに登録して、プレビュー用の Blob URL を発行する。
  // project.json には filename だけ保存、Blob URL は都度再生成（永続化しない）。
  fileBlobs: new Map(),
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
  if (!file || !file.name) return null;
  const existing = state.fileBlobs.get(file.name);
  if (existing) {
    try { URL.revokeObjectURL(existing.url); } catch (e) {}
  }
  const url = URL.createObjectURL(file);
  state.fileBlobs.set(file.name, { file, url });
  // 非同期で IndexedDB に保存（プレビューはブロックしない）
  saveFileToStore(file.name, file);
  emit("fileBlobs");
  return url;
}

// IndexedDB からファイルを復元して Blob URL を発行。
// メモリに既にあればそれを返す。無ければ null。
export async function restoreFileBlob(name) {
  if (!name) return null;
  if (state.fileBlobs.has(name)) return state.fileBlobs.get(name).url;
  const file = await loadFileFromStore(name);
  if (!file) return null;
  const url = URL.createObjectURL(file);
  state.fileBlobs.set(name, { file, url });
  emit("fileBlobs");
  return url;
}

// project 内で参照される全ファイルを IndexedDB から復元する。
// music.file, backgrounds[].file, titles[].file を対象。
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
  const restored = [];
  const missing = [];
  for (const name of names) {
    const url = await restoreFileBlob(name);
    if (url) restored.push(name);
    else missing.push(name);
  }
  return { restored, missing };
}

export function getFileBlobUrl(name) {
  if (!name) return null;
  const entry = state.fileBlobs.get(name);
  return entry ? entry.url : null;
}

export function hasFileBlob(name) {
  return !!(name && state.fileBlobs.has(name));
}

export function clearFileBlobs() {
  for (const { url } of state.fileBlobs.values()) {
    try { URL.revokeObjectURL(url); } catch (e) {}
  }
  state.fileBlobs.clear();
  emit("fileBlobs");
}
