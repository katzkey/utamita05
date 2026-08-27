// タイトルタブ：歌詞動画のタイトル/サブタイトル管理

import { getProject, setProject, registerFileBlob } from "./state.js?v=12d0b2b";
import * as ops from "../core/operations.js?v=12d0b2b";
import { secondsToTC, tcToSeconds, attachTcDrag } from "./tc.js?v=12d0b2b";
import { escapeHtml } from "../core/html.js?v=12d0b2b";

let rowsEl, countEl;
let pickingFile = false;

export function init() {
  rowsEl = document.getElementById("titleRows");
  countEl = document.getElementById("titleCount");
  document.getElementById("btnAddTitle").addEventListener("click", onAdd);
}

export function render() {
  const project = getProject();
  const titles = project.titles || [];
  countEl.textContent = `${titles.length} 件`;
  rowsEl.innerHTML = "";
  titles.forEach((t, idx) => {
    const row = document.createElement("div");
    row.className = "title-row";
    const tcIn = t.tIn != null ? secondsToTC(t.tIn, project.fps) : "--:--:--:--";
    const tcOut = t.tOut != null ? secondsToTC(t.tOut, project.fps) : "--:--:--:--";
    // タイトルテンプレ候補
    const titleTmpls = (project.templates || []).filter(tt => tt.slot === "title");
    const tmplOptions = `<option value="">（なし）</option>` + titleTmpls.map(tt =>
      `<option value="${escapeHtml(tt.name)}" ${t.template === tt.name ? "selected" : ""}>${escapeHtml(tt.displayName)}</option>`
    ).join("");

    row.innerHTML = `
      <div>${idx}</div>
      <div><input class="title-tc-input" data-field="tIn" data-id="${t.id}" value="${tcIn}"></div>
      <div><input class="title-tc-input" data-field="tOut" data-id="${t.id}" value="${tcOut}"></div>
      <div><input data-field="text" data-id="${t.id}" value="${escapeHtml(t.text)}"></div>
      <div><input data-field="subtext" data-id="${t.id}" value="${escapeHtml(t.subtext)}" placeholder="（任意）"></div>
      <div class="title-file-cell">
        <input data-field="file" data-id="${t.id}" value="${escapeHtml(t.file || "")}" placeholder="画像/動画" title="絶対パスまたは相対パス">
        <button class="tool-btn title-file-pick" data-id="${t.id}" title="ファイル選択">参照…</button>
      </div>
      <div>
        <select data-field="template" data-id="${t.id}">${tmplOptions}</select>
      </div>
      <div>
        <select data-field="fit" data-id="${t.id}">
          ${["cover","contain","stretch","original"].map(f => `<option ${(t.fit||"cover")===f?"selected":""}>${f}</option>`).join("")}
        </select>
      </div>
      <div><input data-field="fadeIn" data-id="${t.id}" value="${t.fadeIn}" type="number" step="0.1" min="0"></div>
      <div><input data-field="fadeOut" data-id="${t.id}" value="${t.fadeOut}" type="number" step="0.1" min="0"></div>
      <div>
        <select data-field="layout" data-id="${t.id}">
          ${["h_top","h_center","h_bottom"].map(l => `<option ${t.layout===l?"selected":""}>${l}</option>`).join("")}
        </select>
      </div>
      <div class="title-color-cell">
        <input type="color" data-field="color" data-id="${t.id}" value="${escapeHtml(t.color)}" title="メイン色">
        <input type="color" data-field="subColor" data-id="${t.id}" value="${escapeHtml(t.subColor)}" title="サブ色">
      </div>
      <div><input data-field="opacity" data-id="${t.id}" value="${t.opacity ?? 1}" type="number" step="0.05" min="0" max="1" title="素材の不透明度"></div>
      <div><button class="tool-btn tool-btn-danger" data-action="remove" data-id="${t.id}">×</button></div>
    `;
    rowsEl.appendChild(row);
  });

  rowsEl.querySelectorAll("[data-field]").forEach(el => {
    el.addEventListener("change", onChange);
  });
  rowsEl.querySelectorAll(".title-tc-input").forEach(el => {
    const id = Number(el.dataset.id);
    const field = el.dataset.field;
    attachTcDrag(el, () => getProject().fps, (newSec) => {
      const p = getProject();
      if (field === "tIn") setProject(ops.setTitleIn(p, id, newSec));
      else if (field === "tOut") setProject(ops.setTitleOut(p, id, newSec));
    });
  });
  rowsEl.querySelectorAll('[data-action="remove"]').forEach(el => {
    el.addEventListener("click", (e) => {
      const id = Number(e.target.dataset.id);
      if (confirm("このタイトルを削除しますか？")) {
        setProject(ops.removeTitle(getProject(), id));
      }
    });
  });

  // 素材ファイル選択（ブラウザ input で選択、Blob URL 登録）
  rowsEl.querySelectorAll(".title-file-pick").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (pickingFile) return;
      const id = Number(btn.dataset.id);
      pickTitleFile((file) => {
        if (!file) return;
        registerFileBlob(file);
        setProject(ops.setTitleFile(getProject(), id, file.name));
      });
    });
  });
}

function pickTitleFile(cb) {
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

function onChange(e) {
  const id = Number(e.target.dataset.id);
  const field = e.target.dataset.field;
  const project = getProject();
  const v = e.target.value;
  if (field === "tIn") setProject(ops.setTitleIn(project, id, tcToSeconds(v, project.fps)));
  else if (field === "tOut") setProject(ops.setTitleOut(project, id, tcToSeconds(v, project.fps)));
  else if (field === "text") setProject(ops.setTitleText(project, id, v));
  else if (field === "subtext") setProject(ops.setTitleSubtext(project, id, v));
  else if (field === "fadeIn") setProject(ops.setTitleFade(project, id, Number(v), null));
  else if (field === "fadeOut") setProject(ops.setTitleFade(project, id, null, Number(v)));
  else if (field === "layout") setProject(ops.setTitleLayout(project, id, v));
  else if (field === "color") setProject(ops.setTitleColor(project, id, v));
  else if (field === "subColor") setProject(ops.setTitleSubColor(project, id, v));
  else if (field === "file") setProject(ops.setTitleFile(project, id, v));
  else if (field === "fit") setProject(ops.setTitleFit(project, id, v));
  else if (field === "opacity") setProject(ops.setTitleOpacity(project, id, Number(v)));
  else if (field === "template") setProject(ops.setTitleTemplate(project, id, v));
}

function onAdd() {
  const project = getProject();
  // 既存タイトルがあれば末尾のあとに、無ければ 0〜5秒で配置
  let tIn = 0;
  let tOut = 5;
  const titles = project.titles || [];
  if (titles.length > 0) {
    const last = titles[titles.length - 1];
    if (last.tOut != null) {
      tIn = last.tOut;
      tOut = tIn + 5;
    }
  }
  setProject(ops.addTitle(project, { tIn, tOut }));
}

