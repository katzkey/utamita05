// 背景タブ：行リスト形式の編集

import { getProject, setProject, registerFileBlob } from "./state.js?v=16953a6";
import * as ops from "../core/operations.js?v=16953a6";
import { secondsToTC, tcToSeconds, attachTcDrag } from "./tc.js?v=16953a6";
import { escapeHtml } from "../core/html.js?v=16953a6";

let bgRowsEl, bgCountEl;
let pickingFile = false;  // モジュール全体で1個。多重ダイアログ防止。

export function init() {
  bgRowsEl = document.getElementById("bgRows");
  bgCountEl = document.getElementById("bgCount");
  document.getElementById("btnAddBg").addEventListener("click", onAddBg);
  document.getElementById("btnAddBgSolid").addEventListener("click", onAddBgSolid);
}

export function render() {
  const project = getProject();
  bgCountEl.textContent = `${project.backgrounds.length} 件`;
  bgRowsEl.innerHTML = "";
  project.backgrounds.forEach((bg, idx) => {
    const row = document.createElement("div");
    row.className = "bg-row";
    const isSolid = !!bg.solidColor;
    const sourceCell = isSolid ? `
      <div class="bg-file-cell">
        <input type="color" data-field="solidColor" data-id="${bg.id}" value="${escapeHtml(bg.solidColor)}" title="単色背景の色">
        <input data-field="solidColorText" data-id="${bg.id}" value="${escapeHtml(bg.solidColor)}" placeholder="#000000" style="flex:1;font-family:Consolas,monospace">
        <span style="font-size:10px;color:var(--gray-3)">単色</span>
      </div>
    ` : `
      <div class="bg-file-cell">
        <input data-field="file" data-id="${bg.id}" value="${escapeHtml(bg.file)}" title="project.json と同じフォルダ基準の相対パス、または絶対パス">
        <button class="tool-btn bg-file-pick" data-id="${bg.id}" title="ファイル選択">参照…</button>
      </div>
    `;
    row.innerHTML = `
      <div>${idx}</div>
      <div><input class="bg-tc-input" data-field="tIn" data-id="${bg.id}" value="${secondsToTC(bg.tIn, project.fps)}"></div>
      <div><input class="bg-tc-input" data-field="tOut" data-id="${bg.id}" value="${secondsToTC(bg.tOut, project.fps)}"></div>
      ${sourceCell}
      <div><input data-field="fadeIn" data-id="${bg.id}" value="${bg.fadeIn}" type="number" step="0.1" min="0"></div>
      <div><input data-field="fadeOut" data-id="${bg.id}" value="${bg.fadeOut}" type="number" step="0.1" min="0"></div>
      <div>
        <select data-field="fit" data-id="${bg.id}">
          ${["cover","contain","stretch","original"].map(f => `<option ${bg.fit===f?"selected":""}>${f}</option>`).join("")}
        </select>
      </div>
      <div>
        <select data-field="blend" data-id="${bg.id}">
          ${["normal","multiply","screen","overlay","add","lighten","darken"].map(b => `<option ${bg.blend===b?"selected":""}>${b}</option>`).join("")}
        </select>
      </div>
      <div><input data-field="opacity" data-id="${bg.id}" value="${bg.opacity}" type="number" step="0.05" min="0" max="1"></div>
      <div><button class="tool-btn tool-btn-danger" data-action="remove" data-id="${bg.id}">×</button></div>
    `;
    bgRowsEl.appendChild(row);
  });

  bgRowsEl.querySelectorAll("[data-field]").forEach(el => {
    el.addEventListener("change", onFieldChange);
  });
  // 背景の TC 入力にもドラッグ
  bgRowsEl.querySelectorAll(".bg-tc-input").forEach(el => {
    const id = Number(el.dataset.id);
    const field = el.dataset.field;
    attachTcDrag(el, () => getProject().fps, (newSec) => {
      const p = getProject();
      if (field === "tIn") setProject(ops.setBackgroundIn(p, id, newSec));
      else if (field === "tOut") setProject(ops.setBackgroundOut(p, id, newSec));
    });
  });
  bgRowsEl.querySelectorAll('[data-action="remove"]').forEach(el => {
    el.addEventListener("click", (e) => {
      const id = Number(e.target.dataset.id);
      if (confirm("この背景を削除しますか？")) {
        setProject(ops.removeBackground(getProject(), id));
      }
    });
  });

  // ファイル選択ボタン：ブラウザの input で背景画像/動画を選択、Blob URL 登録
  bgRowsEl.querySelectorAll(".bg-file-pick").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (pickingFile) return;
      const id = Number(btn.dataset.id);
      pickBackgroundFile((file) => {
        if (!file) return;
        registerFileBlob(file);
        setProject(ops.setBackgroundFile(getProject(), id, file.name));
      });
    });
  });
}

// ブラウザで input[type=file] を動的に生成してファイルを選択
function pickBackgroundFile(cb) {
  pickingFile = true;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,video/*";
  input.style.display = "none";
  document.body.appendChild(input);
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    pickingFile = false;
    document.body.removeChild(input);
    cb(file || null);
  }, { once: true });
  input.addEventListener("cancel", () => {
    pickingFile = false;
    document.body.removeChild(input);
    cb(null);
  }, { once: true });
  input.click();
}

function onFieldChange(e) {
  const id = Number(e.target.dataset.id);
  const field = e.target.dataset.field;
  const project = getProject();
  if (field === "tIn") {
    setProject(ops.setBackgroundIn(project, id, tcToSeconds(e.target.value, project.fps)));
  } else if (field === "tOut") {
    setProject(ops.setBackgroundOut(project, id, tcToSeconds(e.target.value, project.fps)));
  } else if (field === "file") {
    setProject(ops.setBackgroundFile(project, id, e.target.value));
  } else if (field === "solidColor" || field === "solidColorText") {
    const v = String(e.target.value).trim();
    const valid = /^#[0-9a-fA-F]{6}$/.test(v);
    if (valid) setProject(ops.setBackgroundSolid(project, id, v));
  } else if (field === "fadeIn") {
    setProject(ops.setBackgroundFade(project, id, Number(e.target.value), null));
  } else if (field === "fadeOut") {
    setProject(ops.setBackgroundFade(project, id, null, Number(e.target.value)));
  } else if (field === "fit") {
    setProject(ops.setBackgroundFit(project, id, e.target.value));
  } else if (field === "blend") {
    setProject(ops.setBackgroundBlend(project, id, e.target.value));
  } else if (field === "opacity") {
    setProject(ops.setBackgroundOpacity(project, id, Number(e.target.value)));
  }
}

function computeDefaultRange(project) {
  const tOut = (project.music && project.music.duration > 0) ? project.music.duration : 60;
  let tIn = 0;
  if (project.backgrounds.length > 0) {
    const last = project.backgrounds[project.backgrounds.length - 1];
    tIn = last.tOut || 0;
  }
  return { tIn, tOut };
}

function onAddBg() {
  const project = getProject();
  const { tIn, tOut } = computeDefaultRange(project);
  setProject(ops.addBackground(project, { file: "", tIn, tOut, fit: "cover", opacity: 1 }));
}

function onAddBgSolid() {
  const project = getProject();
  const { tIn, tOut } = computeDefaultRange(project);
  setProject(ops.addBackground(project, { solidColor: "#000000", tIn, tOut, fit: "cover", opacity: 1 }));
}

