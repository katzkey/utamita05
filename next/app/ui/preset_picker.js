// 見本から選ぶ
//
// プルダウンでは名前しか分からない。座布団は形・グラデ・斜線・ギザギザまであるので、
// 名前だけで選ぶのは無理がある。<option> の中には描けない（文字と色くらいしか
// 扱えず、Mac ではそれも無視される）ので、別の画面に見本を並べる。
//
// 見本は実際の描画コードをそのまま使う。別に作ると見本と結果がずれるため。

import { getProject, setProject } from "./state.js?v=89939f4";
import * as ops from "../core/operations.js?v=89939f4";
import { getAllZabutonPresetsByCategory, getFontPresetsByCategory } from "../core/presets.js?v=89939f4";
import { renderLinePreviewHtml } from "../core/render_line.js?v=89939f4";
import { escapeHtml } from "../core/html.js?v=89939f4";

let overlayEl = null;

function close() {
  overlayEl?.remove();
  overlayEl = null;
}

/**
 * @param kind "zabuton" | "font"
 * @param lineId 見本に使う行（その行の歌詞と設定で描く）
 */
export function openPicker(kind, lineId) {
  close();
  const project = getProject();
  const line = project.lines.find(l => l.id === lineId);
  if (!line) return;

  const isZab = kind === "zabuton";
  const groups = isZab ? getAllZabutonPresetsByCategory() : getFontPresetsByCategory();
  const currentId = isZab ? line.zabutonPresetId : line.fontPresetId;

  // 見本用の行：歌詞が長いと縮んで見えないので、短いときだけ補う
  const sample = { ...line };
  if (!(sample.text || "").trim()) sample.text = "あいうえお";

  let html = "";
  for (const [cat, list] of groups) {
    html += `<div class="pk-cat">${escapeHtml(cat)}</div><div class="pk-grid">`;
    for (const p of list) {
      const tmp = { ...sample, ...p.apply, id: sample.id };
      html += `<button class="pk-item ${p.id === currentId ? "is-current" : ""}" data-id="${p.id}">
        <div class="pk-stage">${renderLinePreviewHtml(tmp, project)}</div>
        <div class="pk-label">${escapeHtml(p.label)}</div>
      </button>`;
    }
    html += `</div>`;
  }

  overlayEl = document.createElement("div");
  overlayEl.className = "at-overlay pk-overlay";
  overlayEl.innerHTML = `
    <div class="pk-panel">
      <div class="at-head">
        <div class="at-title">${isZab ? "座布団" : "フォント"}を見本から選ぶ</div>
        <button class="at-close" id="pkClose">×</button>
      </div>
      <div class="pk-body">${html}</div>
    </div>`;
  document.body.appendChild(overlayEl);

  overlayEl.querySelector("#pkClose").addEventListener("click", close);
  overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) close(); });
  overlayEl.querySelectorAll(".pk-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      setProject(isZab
        ? ops.applyZabutonPresetToLine(getProject(), lineId, id)
        : ops.applyFontPresetToLine(getProject(), lineId, id));
      close();
    });
  });
}
