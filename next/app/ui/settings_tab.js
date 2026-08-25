// 全体設定タブ

import { getProject, setProject } from "./state.js?v=13dd445";
import * as ops from "../core/operations.js?v=13dd445";
import { loadFonts, getFontEntries, isFontAvailable } from "../core/fonts_loader.js?v=13dd445";
import { getCustomZabutonPresets } from "../core/presets.js?v=13dd445";
import { exportCustomPresetsJson, importCustomPresetsJson } from "../core/custom_presets.js?v=13dd445";
import { escapeHtml } from "../core/html.js?v=13dd445";

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

      <label data-ae="1">デフォルト Entry</label>
      <select class="setting-input" id="setDefEntry" data-ae="1">${tmplOpts(project, "entry", project.defaults.template.entry)}</select>

      <label data-ae="1">デフォルト Hold</label>
      <select class="setting-input" id="setDefHold" data-ae="1">${tmplOpts(project, "hold", project.defaults.template.hold)}</select>

      <label data-ae="1">デフォルト Exit</label>
      <select class="setting-input" id="setDefExit" data-ae="1">${tmplOpts(project, "exit", project.defaults.template.exit)}</select>

      <label data-ae="1">デフォルト Design</label>
      <select class="setting-input" id="setDefDesign" data-ae="1">${tmplOpts(project, "design", project.defaults.template.design)}</select>

      <label>デフォルト Layout</label>
      <input class="setting-input" id="setDefLayout" value="${project.defaults.layout}">

      <label data-ae="1">デフォルト LayerMode</label>
      <select class="setting-input" id="setDefLayerMode" data-ae="1">
        <option value="char" ${(project.defaults.layerMode||"char")==="char"?"selected":""}>char（1文字=1レイヤ、文字ごと演出可）</option>
        <option value="line" ${project.defaults.layerMode==="line"?"selected":""}>line（1行=1レイヤ、軽量＆改行自然）</option>
      </select>
    </div>

    <h2 style="margin-top:36px" data-ae="1">テンプレの固定/継承を一括</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px" data-ae="1">
      <button class="tool-btn" data-bulk-inherit="entry">Entry を全解除（継承に）</button>
      <button class="tool-btn" data-bulk-inherit="hold">Hold を全解除</button>
      <button class="tool-btn" data-bulk-inherit="exit">Exit を全解除</button>
      <button class="tool-btn" data-bulk-inherit="design">Design を全解除</button>
    </div>
    <button class="tool-btn tool-btn-danger" id="btnInheritAll" data-ae="1">全行・全スロットを継承に戻す</button>

    <h2 style="margin-top:36px">カスタムプリセット</h2>
    <div style="font-size:12px;color:var(--gray-3,#999);margin-bottom:8px">
      保存したプリセットは <b>この PC のブラウザ</b> に入っています（現在 ${getCustomZabutonPresets().length} 個）。<br>
      他の作業者に渡すとき・バックアップを取るときはファイルに書き出してください。
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <button class="tool-btn" id="btnExportPresets">プリセットを書き出し (.json)</button>
      <button class="tool-btn" id="btnImportPresets">読み込み（追加・同名は上書き）</button>
      <button class="tool-btn tool-btn-danger" id="btnImportPresetsReplace">読み込み（全部入れ替え）</button>
      <input type="file" id="filePresetImport" accept=".json,application/json" style="display:none">
    </div>
    ${getCustomZabutonPresets().length ? `
      <div style="font-size:12px;color:var(--gray-3,#999)">
        ${getCustomZabutonPresets().map(p => escapeHtml(p.label)).join(" ／ ")}
      </div>` : ``}
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

  // カスタムプリセットの書き出し / 読み込み
  pane.querySelector("#btnExportPresets").addEventListener("click", () => {
    if (!getCustomZabutonPresets().length) { alert("書き出すカスタムプリセットがありません。"); return; }
    const blob = new Blob([exportCustomPresetsJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "utamita05_presets.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const fileEl = pane.querySelector("#filePresetImport");
  let importMode = "merge";
  pane.querySelector("#btnImportPresets").addEventListener("click", () => {
    importMode = "merge"; fileEl.value = ""; fileEl.click();
  });
  pane.querySelector("#btnImportPresetsReplace").addEventListener("click", () => {
    if (!confirm("今この PC にあるカスタムプリセットを全部破棄して、ファイルの内容に入れ替えます。よろしいですか？")) return;
    importMode = "replace"; fileEl.value = ""; fileEl.click();
  });
  fileEl.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    const r = importCustomPresetsJson(text, importMode);
    if (!r.ok) { alert(r.error); return; }
    alert(`${r.count} 個読み込みました（合計 ${r.total} 個）`);
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
    // この PC に入っていないフォントには印を付ける（詳細ペインと同じ）
    const miss = isFontAvailable(e.cssFamily || e.value) ? "" : "⚠ ";
    return `<option value="${escapeHtml(e.value)}" style="${style}" ${sel}>${miss}${escapeHtml(e.label)}</option>`;
  }).join("");
}

