// テンプレタブ：登録済みテンプレ一覧表示

import { getProject } from "./state.js?v=ac31364";
import { getTemplatesMeta } from "../core/templates_loader.js?v=ac31364";
import { escapeHtml } from "../core/html.js?v=ac31364";

let pane;

export function init() {
  pane = document.getElementById("tmplPane");
}

export function render() {
  const project = getProject();
  const meta = getTemplatesMeta();
  const slots = [
    { key: "entry", label: "モーション: Entry" },
    { key: "hold", label: "モーション: Hold" },
    { key: "exit", label: "モーション: Exit" },
    { key: "design", label: "デザイン" },
  ];

  const sourceLabel = meta.source === "none"
    ? `<span style="color:var(--coral);">読込失敗（ダミー無し）</span>`
    : meta.source === "templates.sample.json"
      ? `<span style="color:var(--gold);">サンプル（${escapeHtml(meta.source)}）</span>`
      : `<span style="color:var(--ice);">${escapeHtml(meta.source)}</span>`;
  const scannedAt = meta.scannedAt ? ` / scannedAt: ${escapeHtml(meta.scannedAt)}` : "";

  pane.innerHTML = `
    <div style="margin-bottom:16px;color:var(--gray-2);font-size:12px;">
      source: ${sourceLabel}${scannedAt}
    </div>
  ` + slots.map(s => {
    const items = project.templates.filter(t => t.slot === s.key);
    return `
      <div class="tmpl-group">
        <h3>${s.label}（${items.length}個）</h3>
        <div class="tmpl-list">
          ${items.map(t => `
            <div class="tmpl-card">
              <div>${escapeHtml(t.displayName)}</div>
              <div class="tmpl-card-name">${escapeHtml(t.name)}</div>
              ${typeof t.duration === "number" && t.duration > 0
                ? `<div class="tmpl-card-meta">${t.duration.toFixed(2)}s</div>` : ""}
              ${Array.isArray(t.emphasisLayers) && t.emphasisLayers.length > 0
                ? `<div class="tmpl-card-meta">強調: ${t.emphasisLayers.map(escapeHtml).join(" / ")}</div>` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");
}

