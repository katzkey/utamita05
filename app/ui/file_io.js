// プロジェクト保存・読込、歌詞ファイル取込、楽曲読込

import { getProject, getUi, replaceProject, setUi, markSaved, setProject, registerFileBlob, restoreProjectFiles, getFileBlobUrl } from "./state.js?v=3bae95b";
import { fromJSON, toJSON } from "../core/project.js?v=3bae95b";
import { getTemplatesRegistry } from "../core/templates_loader.js?v=3bae95b";
import * as ops from "../core/operations.js?v=3bae95b";

// project.templates をレジストリで上書きして返す（新規・開く時の共通処理）
function withRegistryTemplates(project) {
  const reg = getTemplatesRegistry();
  return { ...project, templates: reg.templates };
}

let audioEl;

export function init() {
  audioEl = document.getElementById("player");

  document.getElementById("btnNew").addEventListener("click", () => {
    if (getUi().dirty && !confirm("未保存の変更があります。新規プロジェクトを作りますか？")) return;
    const fresh = fromJSON(toJSON({
      version: "1",
      name: "新規プロジェクト",
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
      fps: 30,
      resolution: { w: 1920, h: 1080 },
      music: { file: "", duration: 0 },
      font: { family: "Yu Mincho Demibold", fallback: [], size: 48 },
      lines: [],
      nextLineId: 0,
      backgrounds: [],
      nextBgId: 0,
      templates: [],
      defaults: {
        template: { entry: "_entry_fade_in", hold: "_hold_static", exit: "_exit_fade_out", design: "_design_white_mincho" },
        layout: "h_bottom",
      },
    }));
    replaceProject(withRegistryTemplates(ops.setName(fresh, "新規プロジェクト")));
  });

  document.getElementById("btnSave").addEventListener("click", onSave);
  document.getElementById("btnOpen").addEventListener("click", () => {
    document.getElementById("filePickerOpen").click();
  });
  document.getElementById("filePickerOpen").addEventListener("change", onOpenFile);

  document.getElementById("btnImportLyrics").addEventListener("click", () => {
    document.getElementById("filePickerLyrics").click();
  });
  document.getElementById("filePickerLyrics").addEventListener("change", onImportLyrics);

  // Web 版：ブラウザ input からのロード（サーバー不要）
  document.getElementById("btnLoadAudio").addEventListener("click", () => {
    document.getElementById("filePickerAudio").click();
  });
  document.getElementById("filePickerAudio").addEventListener("change", onLoadAudioBlob);
}

function onSave() {
  const project = getProject();
  const json = toJSON(project, true);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const name = (project.name || "project").replace(/[\\/:*?"<>|]/g, "_");
  a.download = `${name}.utamita.json`;
  a.click();
  URL.revokeObjectURL(url);
  markSaved();
}

async function onOpenFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = "";
  try {
    const text = await file.text();
    const project = fromJSON(text);
    replaceProject(withRegistryTemplates(project));
    // 参照ファイル（音源・背景・タイトル素材）を IndexedDB から復元
    const { restored, missing } = await restoreProjectFiles(project);
    // 音源が復元されたら audio 要素にセット
    if (project.music && project.music.file) {
      const url = getFileBlobUrl(project.music.file);
      if (url && audioEl) {
        audioEl.src = url;
        audioEl.load();
        setUi({ audioUrl: url });
      }
    }
    if (missing.length > 0) {
      console.warn("[open] 未登録のファイル:", missing);
    }
    if (restored.length > 0) {
      console.log("[open] 復元したファイル:", restored);
    }
  } catch (err) {
    alert("プロジェクト読込失敗: " + err.message);
  }
}

async function onImportLyrics(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = "";
  try {
    const text = await file.text();
    const spacing = prompt("各行に何秒ずつ配置しますか？（空欄でTC無し）", "3");
    let opts = { replaceExisting: true };
    if (spacing != null && spacing.trim() !== "") {
      opts.spacing = Number(spacing);
    }
    setProject(ops.loadLyricsTxt(getProject(), text, opts));
  } catch (err) {
    alert("歌詞読込失敗: " + err.message);
  }
}

// ブラウザ input で選択した楽曲を Blob URL で再生し、project.music.file にはファイル名を保存
function onLoadAudioBlob(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = "";
  const url = registerFileBlob(file);
  audioEl.src = url;
  audioEl.load();
  setUi({ audioFile: file, audioUrl: url });
  audioEl.addEventListener("loadedmetadata", () => {
    const dur = audioEl.duration;
    setProject(ops.setMusic(getProject(), file.name, dur));
  }, { once: true });
}
