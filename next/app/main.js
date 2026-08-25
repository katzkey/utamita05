// うたみた05 — メインエントリ
// 全体のレンダー調整、タブ切替、ショートカットキー

import { subscribe, getProject, getUi, setUi, replaceProject, undo, redo, canUndo, canRedo } from "./ui/state.js?v=4cbc73e";
import { loadTemplatesRegistry, getTemplatesRegistry } from "./core/templates_loader.js?v=4cbc73e";
import { initCustomPresets } from "./core/custom_presets.js?v=4cbc73e";
import { applyFeatureFlags } from "./core/features.js?v=4cbc73e";
import * as lyrics from "./ui/lyrics_tab.js?v=4cbc73e";
import * as bgTab from "./ui/background_tab.js?v=4cbc73e";
import * as titlesTab from "./ui/titles_tab.js?v=4cbc73e";
import * as tmplTab from "./ui/templates_tab.js?v=4cbc73e";
import * as settings from "./ui/settings_tab.js?v=4cbc73e";
import * as playbar from "./ui/playbar.js?v=4cbc73e";
import * as fileio from "./ui/file_io.js?v=4cbc73e";
import * as autoTiming from "./ui/auto_timing.js?v=4cbc73e";
import * as videoExport from "./ui/video_export.js?v=4cbc73e";
import * as jobs from "./ui/job_status.js?v=4cbc73e";
import { probeFonts, loadLocalFonts, autoAliasMissing, hasLocalFontAccess, isFontValueAvailable } from "./core/fonts_loader.js?v=4cbc73e";
import { FONT_PRESETS } from "./core/presets.js?v=4cbc73e";

let projectNameEl;
let dirtyStatusEl;
let undoBtn, redoBtn;

async function init() {
  projectNameEl = document.getElementById("projectName");
  dirtyStatusEl = document.getElementById("dirtyStatus");
  undoBtn = document.getElementById("btnUndo");
  redoBtn = document.getElementById("btnRedo");

  // この PC に保存されたカスタムプリセットを読み込む（プリセット一覧に出す前に）
  initCustomPresets();

  // テンプレレジストリを最初に読込し、初期プロジェクトに反映
  await loadTemplatesRegistry();
  syncProjectTemplatesFromRegistry();

  // 各タブ・コンポーネントを初期化
  lyrics.init();
  bgTab.init();
  titlesTab.init();
  tmplTab.init();
  settings.init();
  playbar.init();
  fileio.init();
  autoTiming.init();
  videoExport.init();
  jobs.init();          // 処理中の見張り（隅の表示・通知）
  probeUsedFonts();     // この PC にどのフォントが入っているか調べる

  // タブ切替
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("tab-active"));
      tab.classList.add("tab-active");
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
      document.querySelector(`[data-panel="${target}"]`).classList.remove("hidden");
      setUi({ activeTab: target });
    });
  });

  // Undo/Redo
  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);

  // キーボードショートカット
  document.addEventListener("keydown", onKey);

  // 行クリック→プレイバー連動
  document.addEventListener("click", (e) => {
    const row = e.target.closest(".lyric-row");
    if (row && row.dataset.id != null) {
      const id = Number(row.dataset.id);
      playbar.playRow(id);
    }
  });

  // 状態変更でレンダ
  applyFeatureFlags();

  subscribe(renderAll);
  renderAll();
}

// 現在の project.templates をレジストリで上書き（ただし dirty にはしない）
function syncProjectTemplatesFromRegistry() {
  const reg = getTemplatesRegistry();
  const project = getProject();
  const next = { ...project, templates: reg.templates };
  replaceProject(next);
}

// 立ち上げ時に、使う可能性のあるフォントが入っているか調べる。
// プリセットが使うものと、開いているプロジェクトで指定されているもの。
// 全部（AE の一覧は 599 件）を調べる必要はないので、要るものだけにする。
async function probeUsedFonts() {
  try {
    const p = getProject();
    const values = [
      ...FONT_PRESETS.map(x => x.apply?.fontOverride?.family),
      p.font?.family,
      ...p.lines.map(l => l.fontOverride?.family),
    ];
    await probeFonts(values);
    // 見つからないものがあり、この PC のフォントを既に読み込む許可があるなら、
    // 実物へ自動で割り当てる（名前が食い違っていても当たるように）。
    if (hasLocalFontAccess() && values.some(v => v && !isFontValueAvailable(v))) {
      let granted = false;
      try {
        granted = (await navigator.permissions.query({ name: "local-fonts" })).state === "granted";
      } catch (e) { /* 照会できない環境では何もしない */ }
      if (granted && await loadLocalFonts()) {
        if (autoAliasMissing(values)) await probeFonts(values);
      }
    }
    renderAll();          // ⚠ の有無と、描き方（ウェイト）を反映し直す
  } catch (e) {
    // 調べられなくても、今までどおり描ける
  }
}

function renderAll() {
  const ui = getUi();
  const project = getProject();
  projectNameEl.textContent = project.name;
  dirtyStatusEl.textContent = ui.dirty ? "● 未保存" : "保存済み";
  dirtyStatusEl.classList.toggle("dirty", ui.dirty);
  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();

  // アクティブタブだけ再描画（最低限）
  if (ui.activeTab === "lyrics") lyrics.render();
  else if (ui.activeTab === "backgrounds") bgTab.render();
  else if (ui.activeTab === "titles") titlesTab.render();
  else if (ui.activeTab === "templates") tmplTab.render();
  else if (ui.activeTab === "settings") settings.render();
  // 歌詞タブは詳細パネルを別タブからでも更新したいので常に
  if (ui.activeTab !== "lyrics") lyrics.render();
  playbar.render();
  applyFeatureFlags();
}

function onKey(e) {
  // 入力フィールドにフォーカス中はショートカット無効
  const tag = e.target.tagName;
  const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

  if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && !e.shiftKey) {
    e.preventDefault(); undo(); return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey))) {
    e.preventDefault(); redo(); return;
  }
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
    e.preventDefault();
    document.getElementById("btnSave").click();
    return;
  }

  if (inField) return;

  // 再生
  if (e.code === "Space") {
    e.preventDefault();
    document.getElementById("playBtn").click();
    return;
  }
  // I / O キー
  if (e.code === "KeyI") {
    e.preventDefault();
    document.getElementById("markInBtn").click();
    return;
  }
  if (e.code === "KeyO") {
    e.preventDefault();
    document.getElementById("markOutBtn").click();
    return;
  }

  const ui = getUi();
  const project = getProject();
  if (e.code === "ArrowDown" && ui.selectedLineIds.size > 0) {
    e.preventDefault();
    const ids = project.lines.map(l => l.id);
    const cur = Math.max(...[...ui.selectedLineIds].map(id => ids.indexOf(id)));
    if (cur < ids.length - 1) {
      const newId = ids[cur + 1];
      setUi({ selectedLineIds: new Set([newId]) });
      if (!ui.markingMode) playbar.playRow(newId);
    }
  }
  if (e.code === "ArrowUp" && ui.selectedLineIds.size > 0) {
    e.preventDefault();
    const ids = project.lines.map(l => l.id);
    const cur = Math.min(...[...ui.selectedLineIds].map(id => ids.indexOf(id)));
    if (cur > 0) {
      const newId = ids[cur - 1];
      setUi({ selectedLineIds: new Set([newId]) });
      if (!ui.markingMode) playbar.playRow(newId);
    }
  }
  if (e.code === "Enter" && ui.selectedLineIds.size > 0) {
    e.preventDefault();
    const ids = project.lines.map(l => l.id);
    const cur = Math.max(...[...ui.selectedLineIds].map(id => ids.indexOf(id)));
    if (cur < ids.length - 1) {
      setUi({ selectedLineIds: new Set([ids[cur + 1]]) });
    }
  }
  if (e.code === "Delete" && ui.selectedLineIds.size > 0) {
    e.preventDefault();
    document.getElementById("btnRemoveLine").click();
  }
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyN") {
    e.preventDefault();
    document.getElementById("btnAddLine").click();
  }
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyJ") {
    e.preventDefault();
    document.getElementById("btnMergeNext").click();
  }
  if ((e.ctrlKey || e.metaKey) && e.code === "Slash") {
    e.preventDefault();
    document.getElementById("btnSplitLine").click();
  }
}

// DOM 準備完了で起動
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
