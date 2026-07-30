// 全体設定タブ

import { getProject, setProject } from "./state.js";
import * as ops from "../core/operations.js";
import { loadFonts, getFontEntries } from "../core/fonts_loader.js";

let pane;

export function init() {
  pane = document.getElementById("settingsPane");
  // 初回だけ非同期でフォント一覧を取得し、揃ったら再描画
  loadFonts().then(() => {
    if (pane && pane.querySelector("#setFontFamily")) render();
  });
}

export function render() {
  const project = getProject();
  pane.innerHTML = `
    <h2>全体設定</h2>
    <div class="settings-grid">
      <label>プロジェクト名</label>
      <input class="setting-input" id="setName" value="${escapeHtml(project.name)}">

      <label>FPS</label>
      <input class="setting-input" id="setFps" type="number" min="1" max="120" value="${project.fps}">

      <label>解像度 幅</label>
      <input class="setting-input" id="setW" type="number" min="1" value="${project.resolution.w}">

      <label>解像度 高さ</label>
      <input class="setting-input" id="setH" type="number" min="1" value="${project.resolution.h}">

      <label>デフォルトフォント (family)</label>
      <select class="setting-input font-family-select" id="setFontFamily">
        ${fontFamilyOptions(project.font.family)}
      </select>

      <label>デフォルトフォントサイズ</label>
      <input class="setting-input" id="setFontSize" type="number" min="1" max="1000" step="1" value="${project.font.size || 48}">

      <label>楽曲ファイル</label>
      <input class="setting-input" id="setMusicFile" value="${escapeHtml(project.music.file)}">

      <label>楽曲長さ (秒)</label>
      <input class="setting-input" id="setMusicDur" type="number" step="0.01" min="0" value="${project.music.duration}">

      <label>デフォルト Entry</label>
      <select class="setting-input" id="setDefEntry">${tmplOpts(project, "entry", project.defaults.template.entry)}</select>

      <label>デフォルト Hold</label>
      <select class="setting-input" id="setDefHold">${tmplOpts(project, "hold", project.defaults.template.hold)}</select>

      <label>デフォルト Exit</label>
      <select class="setting-input" id="setDefExit">${tmplOpts(project, "exit", project.defaults.template.exit)}</select>

      <label>デフォルト Design</label>
      <select class="setting-input" id="setDefDesign">${tmplOpts(project, "design", project.defaults.template.design)}</select>

      <label>デフォルト Layout</label>
      <input class="setting-input" id="setDefLayout" value="${project.defaults.layout}">

      <label>デフォルト LayerMode</label>
      <select class="setting-input" id="setDefLayerMode">
        <option value="char" ${(project.defaults.layerMode||"char")==="char"?"selected":""}>char（1文字=1レイヤ、文字ごと演出可）</option>
        <option value="line" ${project.defaults.layerMode==="line"?"selected":""}>line（1行=1レイヤ、軽量＆改行自然）</option>
      </select>
    </div>

    <h2 style="margin-top:36px">テンプレの固定/継承を一括</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <button class="tool-btn" data-bulk-inherit="entry">Entry を全解除（継承に）</button>
      <button class="tool-btn" data-bulk-inherit="hold">Hold を全解除</button>
      <button class="tool-btn" data-bulk-inherit="exit">Exit を全解除</button>
      <button class="tool-btn" data-bulk-inherit="design">Design を全解除</button>
    </div>
    <button class="tool-btn tool-btn-danger" id="btnInheritAll">全行・全スロットを継承に戻す</button>
  `;

  pane.querySelector("#setName").addEventListener("change", e => setProject(ops.setName(getProject(), e.target.value)));
  pane.querySelector("#setFps").addEventListener("change", e => setProject(ops.setFps(getProject(), Number(e.target.value))));
  pane.querySelector("#setW").addEventListener("change", e => {
    const p = getProject();
    setProject(ops.setResolution(p, Number(e.target.value), p.resolution.h));
  });
  pane.querySelector("#setH").addEventListener("change", e => {
    const p = getProject();
    setProject(ops.setResolution(p, p.resolution.w, Number(e.target.value)));
  });
  pane.querySelector("#setFontFamily").addEventListener("change", e => setProject(ops.setProjectFont(getProject(), { family: e.target.value })));
  pane.querySelector("#setFontSize").addEventListener("change", e => setProject(ops.setProjectFont(getProject(), { size: Number(e.target.value) || 48 })));
  pane.querySelector("#setMusicFile").addEventListener("change", e => {
    const p = getProject();
    setProject(ops.setMusic(p, e.target.value, p.music.duration));
  });
  pane.querySelector("#setMusicDur").addEventListener("change", e => {
    const p = getProject();
    setProject(ops.setMusic(p, p.music.file, Number(e.target.value)));
  });
  pane.querySelector("#setDefEntry").addEventListener("change", e => setProject(ops.setDefaultTemplate(getProject(), "entry", e.target.value)));
  pane.querySelector("#setDefHold").addEventListener("change", e => setProject(ops.setDefaultTemplate(getProject(), "hold", e.target.value)));
  pane.querySelector("#setDefExit").addEventListener("change", e => setProject(ops.setDefaultTemplate(getProject(), "exit", e.target.value)));
  pane.querySelector("#setDefDesign").addEventListener("change", e => setProject(ops.setDefaultTemplate(getProject(), "design", e.target.value)));
  pane.querySelector("#setDefLayout").addEventListener("change", e => setProject(ops.setDefaultLayout(getProject(), e.target.value)));
  pane.querySelector("#setDefLayerMode").addEventListener("change", e => setProject(ops.setDefaultLayerMode(getProject(), e.target.value)));

  pane.querySelectorAll("[data-bulk-inherit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const slot = btn.getAttribute("data-bulk-inherit");
      setProject(ops.inheritTemplateAll(getProject(), slot));
      render();
    });
  });
  pane.querySelector("#btnInheritAll").addEventListener("click", () => {
    let p = getProject();
    for (const slot of ["entry", "hold", "exit", "design"]) {
      p = ops.inheritTemplateAll(p, slot);
    }
    setProject(p);
    render();
  });
}

function tmplOpts(project, slot, current) {
  return project.templates
    .filter(t => t.slot === slot)
    .map(t => `<option value="${t.name}" ${t.name === current ? "selected" : ""}>${escapeHtml(t.displayName)} [${t.name}]</option>`)
    .join("");
}

function fontFamilyOptions(current) {
  const entries = getFontEntries().slice();
  if (current && !entries.some(e => e.value === current)) {
    entries.unshift({ value: current, label: current, cssFamily: current });
  }
  if (!entries.length) {
    const v = current || "Yu Mincho Demibold";
    entries.push({ value: v, label: v, cssFamily: v });
  }
  return entries.map(e => {
    const sel = e.value === current ? "selected" : "";
    const style = `font-family: '${(e.cssFamily || "").replace(/'/g, "\\'")}', system-ui, sans-serif`;
    return `<option value="${escapeHtml(e.value)}" style="${style}" ${sel}>${escapeHtml(e.label)}</option>`;
  }).join("");
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
