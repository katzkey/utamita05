// 歌詞タブ：行リスト + 詳細パネル

import { getProject, getUi, setProject, setUi, getFileBlobUrl } from "./state.js?v=ab744b0";
import * as ops from "../core/operations.js?v=ab744b0";
import { secondsToTC, tcToSeconds, attachTcDrag } from "./tc.js?v=ab744b0";
import { resolveLineTemplate, isLineTemplateFixed, resolveLineLayerMode } from "../core/project.js?v=ab744b0";
import { loadFonts, getFontEntries, cssFamilyFor, labelFor } from "../core/fonts_loader.js?v=ab744b0";
import { getFontPresetsByCategory, getAllZabutonPresetsByCategory, getFontPresetById } from "../core/presets.js?v=ab744b0";
import { saveLineAsCustomPreset, deleteCustomPreset, isCustomPresetId } from "../core/custom_presets.js?v=ab744b0";
import { AE_ENABLED } from "../core/features.js?v=ab744b0";
import { EASINGS, SLIDE_DIRS, defaultMotion } from "../core/motion.js?v=ab744b0";
import { escapeHtml } from "../core/html.js?v=ab744b0";
import { renderLinePreviewHtml } from "../core/render_line.js?v=ab744b0";

let detailPaneEl;
let lyricRowsEl;
let lineCountEl;

export function init() {
  detailPaneEl = document.getElementById("detailPane");
  lyricRowsEl = document.getElementById("lyricRows");
  lineCountEl = document.getElementById("lineCount");

  document.getElementById("btnAddLine")?.addEventListener("click", onAddLine);
  document.getElementById("btnSplitLine")?.addEventListener("click", onSplitLine);
  document.getElementById("btnMergeNext")?.addEventListener("click", onMergeNext);
  document.getElementById("btnRemoveLine")?.addEventListener("click", onRemoveLine);

  // フォント一覧が揃ったら詳細を再描画
  loadFonts().then(() => {
    if (detailPaneEl && detailPaneEl.querySelector("#fldFontFamily")) render();
  });
}

function fontFamilyOptionsForLine(currentValue, projectDefault) {
  const entries = getFontEntries().slice();
  if (projectDefault && !entries.some(e => e.value === projectDefault)) {
    entries.unshift({ value: projectDefault, label: projectDefault, cssFamily: projectDefault });
  }
  if (currentValue && !entries.some(e => e.value === currentValue)) {
    entries.unshift({ value: currentValue, label: currentValue, cssFamily: currentValue });
  }
  // 先頭に「継承」プレースホルダー
  const inhLabel = `— 継承（${labelFor(projectDefault) || "-"}） —`;
  const options = [`<option value="" ${!currentValue ? "selected" : ""}>${escapeHtml(inhLabel)}</option>`];
  for (const e of entries) {
    const sel = e.value === currentValue ? "selected" : "";
    const style = `font-family: '${(e.cssFamily || "").replace(/'/g, "\\'")}', system-ui, sans-serif`;
    options.push(`<option value="${escapeHtml(e.value)}" style="${style}" ${sel}>${escapeHtml(e.label)}</option>`);
  }
  return options.join("");
}

export function render() {
  const project = getProject();
  const ui = getUi();
  lineCountEl.textContent = `${project.lines.length} 行`;
  renderRows(project, ui);
  renderDetail(project, ui);
}

function renderRows(project, ui) {
  lyricRowsEl.innerHTML = "";
  project.lines.forEach((line, idx) => {
    const row = document.createElement("div");
    row.className = "lyric-row";
    row.dataset.id = line.id;
    if (ui.selectedLineIds.has(line.id)) row.classList.add("selected");
    const tcIn = line.tIn != null ? secondsToTC(line.tIn, project.fps) : "--:--:--:--";
    const tcOut = line.tOut != null ? secondsToTC(line.tOut, project.fps) : "--:--:--:--";
    // tIn >= tOut の不正状態を判定
    const tcInverted = (line.tIn != null && line.tOut != null && line.tOut <= line.tIn);
    if (tcInverted) row.classList.add("tc-invalid");
    const textPreview = (line.text || "").replace(/\\n/g, " ↵ ").substring(0, 80);
    row.innerHTML = `
      <div class="col-idx">${idx}</div>
      <div class="col-tc ${line.tIn == null ? "null" : ""} ${tcInverted ? "bad" : ""}">${tcIn}</div>
      <div class="col-tc ${line.tOut == null ? "null" : ""} ${tcInverted ? "bad" : ""}">${tcOut}</div>
      <div class="col-text">${escapeHtml(textPreview)}${tcInverted ? ' <span class="tc-warn">⚠ TC逆転</span>' : ""}</div>
    `;
    row.addEventListener("click", (e) => onRowClick(line.id, e));
    lyricRowsEl.appendChild(row);
  });
}

function renderDetail(project, ui) {
  const selected = [...ui.selectedLineIds];
  if (selected.length === 0) {
    detailPaneEl.innerHTML = `<div class="empty-state">行を選択してください</div>`;
    return;
  }
  if (selected.length > 1) {
    // 選択の「一番上の行」を見本にする（行リストの並び順で判定）
    const order = project.lines.map(l => l.id);
    const ordered = [...selected].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const srcId = ordered[0];
    const srcLine = project.lines.find(l => l.id === srcId);
    const srcIdx = order.indexOf(srcId);

    detailPaneEl.innerHTML = `
      <div class="detail-header">
        <div class="detail-row-label">複数行選択中</div>
        <div class="detail-row-text">${selected.length} 行</div>
      </div>
      <div class="section">
        <div class="section-title">見た目をそろえる</div>
        <div style="font-size:11px;color:var(--gray-4);margin-bottom:8px">
          見本：<b>#${srcIdx}</b> ${escapeHtml((srcLine?.text || "").slice(0, 18))}
        </div>
        <button class="tool-btn" id="btnBulkApplyLook">この見た目を残り ${selected.length - 1} 行へ反映</button>
        <div style="font-size:10px;color:var(--gray-3);margin-top:6px">
          フォント・配置・座布団・光彩・下線・縁取り・色・カーニング・ジッター・テンプレをコピーします。<br>
          歌詞・TC・強調・メモは変わりません。
        </div>
      </div>
      <div class="section">
        <div class="section-title">一括操作</div>
        <button class="tool-btn tool-btn-danger" id="btnBulkDel">選択行を全て削除</button>
      </div>
    `;
    document.getElementById("btnBulkApplyLook")?.addEventListener("click", () => {
      setProject(ops.applyLineSettingsToLines(getProject(), srcId, ordered.slice(1)));
    });
    document.getElementById("btnBulkDel")?.addEventListener("click", () => {
      if (!confirm(`${selected.length} 行を削除します。よろしいですか？`)) return;
      let p = project;
      for (const id of selected) p = ops.removeLine(p, id);
      setProject(p);
      setUi({ selectedLineIds: new Set() });
    });
    return;
  }

  const id = selected[0];
  const line = project.lines.find(l => l.id === id);
  if (!line) {
    detailPaneEl.innerHTML = `<div class="empty-state">行が見つかりません</div>`;
    return;
  }

  const tIn = line.tIn != null ? secondsToTC(line.tIn, project.fps) : "";
  const tOut = line.tOut != null ? secondsToTC(line.tOut, project.fps) : "";
  const ttext = (line.text || "").replace(/\\n/g, "\n");
  let detailTab = ["content", "look", "motion"].includes(ui.detailTab) ? ui.detailTab : "look";

  const resolved = resolveLineTemplate(line, project);

  const tmplOptions = (slot) => {
    const fixed = isLineTemplateFixed(line, slot);
    const currentVal = fixed ? line.template[slot] : resolved[slot];
    return project.templates
      .filter(t => t.slot === slot)
      .map(t => `<option value="${t.name}" ${t.name === currentVal ? "selected" : ""}>${escapeHtml(t.displayName)} [${t.name}]</option>`)
      .join("");
  };

  const tmplSlotHtml = (slot, label) => {
    const fixed = isLineTemplateFixed(line, slot);
    const resolved2 = resolved[slot];
    const inherited = !fixed ? `<span class="inh-tag">継承: ${escapeHtml(resolved2 || "-")}</span>` : "";
    return `
      <div class="field tmpl-field">
        <span class="field-label">${label}</span>
        <label class="lock-toggle" title="ONで行固有値を保持、OFFでプロジェクトデフォルト継承">
          <input type="checkbox" data-slot="${slot}" class="lock-cb" ${fixed ? "checked" : ""}>
          <span>固定</span>
        </label>
        <select class="field-select" id="fld${slot[0].toUpperCase() + slot.slice(1)}" ${fixed ? "" : "disabled"}>${tmplOptions(slot)}</select>
      </div>
      ${inherited ? `<div class="inh-row">${inherited}</div>` : ""}
    `;
  };

  const layoutOptions = [
    "h_top","h_center","h_bottom","vl_top","vl_center","vl_bottom",
    "vr_top","vr_center","vr_bottom","vc_top","vc_center","vc_bottom","free"
  ].map(l => `<option value="${l}" ${line.layout === l ? "selected" : ""}>${l}</option>`).join("");

  detailPaneEl.innerHTML = `
    <div class="detail-header">
      <div class="detail-row-label">行 #${project.lines.indexOf(line)} (id=${line.id})</div>
      <div class="detail-row-text">${escapeHtml(line.text.replace(/\\n/g, " ↵ "))}</div>
    </div>

    <div class="preview-box ${ui.previewLarge ? "preview-large" : ""}" id="linePreview" style="margin:8px 0 4px">
      <button class="preview-toggle" id="btnPreviewSize" title="プレビューを${ui.previewLarge ? "縮小" : "拡大"}">${ui.previewLarge ? "🗕" : "⤢"}</button>
      ${renderLinePreviewHtml(line, project)}
    </div>

    <div class="detail-tabs">
      ${[["content","内容"],["look","見た目"],["motion","動き"]].map(([k, label]) =>
        `<button class="detail-tab ${detailTab === k ? "is-active" : ""}" data-tab="${k}">${label}</button>`
      ).join("")}
    </div>

    <div class="section" data-pane="look">
      <div class="section-title">プリセット</div>
      <div class="field">
        <span class="field-label">フォント</span>
        <select class="field-select" id="fldFontPreset" style="flex:1">
          <option value="">— 未適用 —</option>
          ${(() => {
            let html = "";
            for (const [cat, list] of getFontPresetsByCategory()) {
              html += `<optgroup label="${escapeHtml(cat)}">`;
              for (const p of list) {
                const sel = line.fontPresetId === p.id ? "selected" : "";
                html += `<option value="${p.id}" ${sel}>${escapeHtml(p.label)}</option>`;
              }
              html += "</optgroup>";
            }
            return html;
          })()}
        </select>
      </div>
      <div class="field">
        <span class="field-label">座布団</span>
        <select class="field-select" id="fldZabutonPreset" style="flex:1">
          <option value="">— 未適用 —</option>
          ${(() => {
            let html = "";
            for (const [cat, list] of getAllZabutonPresetsByCategory()) {
              html += `<optgroup label="${escapeHtml(cat)}">`;
              for (const p of list) {
                const sel = line.zabutonPresetId === p.id ? "selected" : "";
                html += `<option value="${p.id}" ${sel}>${escapeHtml(p.label)}</option>`;
              }
              html += "</optgroup>";
            }
            return html;
          })()}
        </select>
      </div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="tool-btn" id="btnSaveCustomPreset" style="font-size:11px">現在の設定を保存…</button>
        ${isCustomPresetId(line.zabutonPresetId)
          ? `<button class="tool-btn tool-btn-danger" id="btnDeleteCustomPreset" style="font-size:11px">このカスタムを削除</button>`
          : ``}
      </div>
      <div style="font-size:10px;color:var(--gray-3);margin-top:4px">
        フォント／座布団は独立して選択できます（適用後も個別編集可）。<br>
        保存すると座布団・光彩・文字色・縁取り・下線がカスタムプリセットになります（この PC に保存）
      </div>
    </div>

    <div class="section" data-pane="content">
      <div class="section-title">歌詞テキスト</div>
      <textarea class="field-textarea" id="fldText">${escapeHtml(ttext)}</textarea>
      <div style="font-size:10px;color:var(--gray-3);margin-top:4px">改行は \\n リテラルか実改行どちらでも</div>
    </div>

    <div class="section" data-pane="content">
      <div class="section-title">TC</div>
      <div class="field">
        <span class="field-label">IN</span>
        <input class="field-input field-tc" id="fldTIn" value="${tIn}" placeholder="--:--:--:--">
      </div>
      <div class="field">
        <span class="field-label">OUT</span>
        <input class="field-input field-tc" id="fldTOut" value="${tOut}" placeholder="--:--:--:--">
      </div>
      <div class="field">
        <span class="field-label">ずらし</span>
        <input class="field-input" id="fldStagger" type="number" step="0.01" min="0" value="${line.stagger ?? 0}" style="width:80px">
        <span style="font-size:10px;color:var(--gray-3);margin-left:8px">秒/文字（0=同時）</span>
      </div>
    </div>

    <div class="section" data-pane="motion">
      <div class="section-title">動かす単位</div>
      <div class="field">
        <span class="field-label">単位</span>
        <select class="field-select" id="fldMUnit" style="flex:1">
          <option value="line" ${(line.motion?.unit || "line") === "line" ? "selected" : ""}>行ごと（1行まとめて）</option>
          <option value="char" ${line.motion?.unit === "char" ? "selected" : ""}>文字ごと（1文字ずつ）</option>
        </select>
      </div>
      <div class="field" style="${line.motion?.unit === "char" ? "" : "display:none"}">
        <span class="field-label">ずらし</span>
        <input class="field-input" id="fldMStagger" type="number" step="0.01" min="0" value="${line.motion?.stagger ?? 0.03}" style="width:70px">
        <span style="font-size:10px;color:var(--gray-3);margin-left:6px">秒／文字</span>
      </div>
    </div>
    ${motionSideHtml("in", line.motion || defaultMotion(), "出るとき（イン）")}
    ${motionSideHtml("out", line.motion || defaultMotion(), "消えるとき（アウト）")}

    ${AE_ENABLED ? `<div class="section" data-pane="motion" data-ae="1">
      <div class="section-title">AE テンプレ</div>
      ${tmplSlotHtml("entry", "Entry")}
      ${tmplSlotHtml("hold", "Hold")}
      ${tmplSlotHtml("exit", "Exit")}
      ${tmplSlotHtml("design", "Design")}
    </div>` : ``}

    <div class="section" data-pane="look">
      <div class="section-title">フォント（行で上書き）</div>
      <div class="field">
        <span class="field-label">family</span>
        <select class="field-select font-family-select" id="fldFontFamily">
          ${fontFamilyOptionsForLine(line.fontOverride?.family || "", project.font.family)}
        </select>
      </div>
      <div class="field">
        <span class="field-label">size</span>
        <input class="field-input" id="fldFontSize" type="number" min="1" max="1000" step="1" placeholder="${project.font.size || 48}" value="${line.fontOverride?.size ?? ""}" style="width:80px">
        <span style="font-size:10px;color:var(--gray-3);margin-left:8px">空欄で継承</span>
      </div>
      <div class="field">
        <span class="field-label">tracking</span>
        <input class="field-input" id="fldTracking" type="number" step="0.01" value="${line.tracking ?? 0}" style="width:80px">
        <span style="font-size:10px;color:var(--gray-3);margin-left:8px">負で詰め、正で開く</span>
      </div>
      <div class="field">
        <span class="field-label">カーニング</span>
        <label class="lock-toggle"><input type="checkbox" id="fldAutoKerning" ${line.autoKerning ? "checked" : ""}><span>オートカーニング</span></label>
      </div>
      <div class="field" style="${line.autoKerning ? "display:none" : ""}">
        <span class="field-label">文字種ギャップ</span>
        <input class="field-input" id="fldInterTypeGap" type="number" step="0.02" min="0" value="${line.interTypeGap ?? 0}" style="width:80px">
        <span style="font-size:10px;color:var(--gray-3);margin-left:8px">em（種類が変わる所に一律で空き）</span>
      </div>
      <div style="font-size:10px;color:var(--gray-3);margin:-4px 0 8px">
        ${line.autoKerning
          ? "和文と英数字の境界だけ四分アキ(0.25em)。かな・カタカナ・漢字どうしはベタ組み（PDF 実測に準拠）"
          : "手動：種類が変わる所すべてに同じ幅を入れます"}
      </div>
      <div class="field">
        <span class="field-label">italic</span>
        <label class="lock-toggle"><input type="checkbox" id="fldFontItalic" ${line.fontOverride?.italic ? "checked" : ""}><span>擬似イタリック</span></label>
      </div>
      <div class="field">
        <span class="field-label">文字色</span>
        <input type="color" id="fldTextColor" value="${line.textColor || '#FFFFFF'}" style="width:40px;height:24px;padding:0;border:none">
        <button class="tool-btn" id="btnTextColorClear" style="margin-left:8px;padding:2px 8px">クリア（白既定）</button>
      </div>
      <div class="field">
        <span class="field-label">文字縁取り</span>
        <input type="color" id="fldTextStrokeColor" value="${line.textStroke?.color || '#000000'}" style="width:40px;height:24px;padding:0;border:none">
        <input class="field-input" id="fldTextStrokeWidth" type="number" min="0" step="0.5" value="${line.textStroke?.width ?? 2}" style="width:60px;margin-left:8px" title="太さ px">
        <label class="lock-toggle" style="margin-left:8px"><input type="checkbox" id="fldTextStrokeOn" ${line.textStroke ? "checked" : ""}><span>有効</span></label>
      </div>
    </div>

    <div class="section" data-pane="look">
      <div class="section-title">配置</div>
      <div class="field">
        <span class="field-label">layout</span>
        <select class="field-select" id="fldLayout">${layoutOptions}</select>
      </div>
      <div class="field">
        <span class="field-label">dx / dy</span>
        <input class="field-input" id="fldDx" value="${line.pos.dx}" style="width:50px">
        <input class="field-input" id="fldDy" value="${line.pos.dy}" style="width:50px">
      </div>
      <div class="field" data-ae="1">
        <span class="field-label">layerMode</span>
        <select class="field-select" id="fldLayerMode">
          <option value="" ${line.layerMode == null ? "selected" : ""}>継承（${resolveLineLayerMode(line, project)}）</option>
          <option value="char" ${line.layerMode === "char" ? "selected" : ""}>char（文字ごと）</option>
          <option value="line" ${line.layerMode === "line" ? "selected" : ""}>line（行で1レイヤ）</option>
        </select>
      </div>
    </div>

    <div class="section" data-pane="look">
      <div class="section-title">座布団</div>
      <div class="field">
        <span class="field-label">有効</span>
        <label class="lock-toggle"><input type="checkbox" id="fldZabOn" ${line.zabuton?.enabled ? "checked" : ""}><span>行の背景に敷く</span></label>
      </div>
      <div id="zabFields" style="${line.zabuton?.enabled ? "" : "display:none"}">
        <div class="field">
          <span class="field-label">形状</span>
          <select class="field-select" id="fldZabShape">
            ${["rect","round","pill","circle"].map(s => `<option value="${s}" ${ (line.zabuton?.shape || "round") === s ? "selected" : ""}>${{rect:"四角",round:"角丸",pill:"ピル",circle:"円"}[s]}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <span class="field-label">塗り / 枠</span>
          <select class="field-select" id="fldZabMode">
            <option value="fill" ${(line.zabuton?.mode || "fill") === "fill" ? "selected" : ""}>塗り</option>
            <option value="stroke" ${line.zabuton?.mode === "stroke" ? "selected" : ""}>枠だけ</option>
          </select>
          <input class="field-input" id="fldZabStrokeW" type="number" min="0" step="0.5" value="${line.zabuton?.strokeWidth ?? 2}" style="width:50px;margin-left:8px" title="枠の太さ (px)">
        </div>
        <div class="field">
          <span class="field-label">色 / 不透明</span>
          <input type="color" id="fldZabColor" value="${line.zabuton?.color || "#000000"}" style="width:40px;height:24px;padding:0;border:none">
          <input class="field-input" id="fldZabOpacity" type="number" min="0" max="1" step="0.05" value="${line.zabuton?.opacity ?? 0.5}" style="width:60px;margin-left:8px">
        </div>
        <div class="field">
          <span class="field-label">単位</span>
          <label class="lock-toggle"><input type="checkbox" id="fldZabPerBlock" ${line.zabuton?.perBlock ? "checked" : ""}><span>"/" のブロックごとに敷く</span></label>
        </div>
        <div class="field">
          <span class="field-label">余白 X / Y</span>
          <input class="field-input" id="fldZabPadX" value="${line.zabuton?.paddingX ?? 0}" style="width:50px">
          <input class="field-input" id="fldZabPadY" value="${line.zabuton?.paddingY ?? 0}" style="width:50px">
        </div>
        <div class="field">
          <span class="field-label">角丸半径</span>
          <input class="field-input" id="fldZabRadius" value="${line.zabuton?.cornerRadius ?? 16}" style="width:50px">
          <span style="font-size:10px;color:var(--gray-3);margin-left:8px">角丸のとき</span>
        </div>
        <div class="field">
          <span class="field-label">タイミング</span>
          <select class="field-select" id="fldZabTiming">
            <option value="follow" ${(line.zabuton?.timingMode || "follow") === "follow" ? "selected" : ""}>follow（文字と一緒に動く）</option>
            <option value="static" ${line.zabuton?.timingMode === "static" ? "selected" : ""}>static（独立フェード）</option>
          </select>
        </div>
        <div class="field">
          <span class="field-label">フェード秒</span>
          <input class="field-input" id="fldZabFade" type="number" min="0" step="0.05" value="${line.zabuton?.fade ?? 0.3}" style="width:60px">
          <span style="font-size:10px;color:var(--gray-3);margin-left:8px">static のとき有効</span>
        </div>
        <div class="field">
          <span class="field-label">エッジぼかし X / Y</span>
          <input class="field-input" id="fldZabBlurX" type="number" min="0" step="1" value="${line.zabuton?.blurX ?? 0}" style="width:60px">
          <input class="field-input" id="fldZabBlurY" type="number" min="0" step="1" value="${line.zabuton?.blurY ?? 0}" style="width:60px;margin-left:4px">
          <span style="font-size:10px;color:var(--gray-3);margin-left:8px">px（0=なし）</span>
        </div>
        <div class="field">
          <span class="field-label">グラデ</span>
          <label class="lock-toggle"><input type="checkbox" id="fldZabGradOn" ${line.zabuton?.gradient?.enabled ? "checked" : ""}><span>色をグラデーションで塗る</span></label>
        </div>
        <div id="zabGradFields" style="${line.zabuton?.gradient?.enabled ? "" : "display:none"}">
          <div class="field">
            <span class="field-label">角度</span>
            <input class="field-input" id="fldZabGradAngle" type="number" step="15" value="${line.zabuton?.gradient?.angle ?? 90}" style="width:60px">
            <span style="font-size:10px;color:var(--gray-3);margin-left:8px">0=上, 90=右, 180=下, 270=左（縦組みは +90° 自動回転）</span>
          </div>
          <div class="field">
            <span class="field-label">色 A / B</span>
            <input type="color" id="fldZabGradA" value="${line.zabuton?.gradient?.colorA || "#FF69B4"}" style="width:40px;height:24px;padding:0;border:none">
            <input type="color" id="fldZabGradB" value="${line.zabuton?.gradient?.colorB || "#FFD54A"}" style="width:40px;height:24px;padding:0;border:none;margin-left:4px">
          </div>
          <div class="field">
            <span class="field-label">色 C</span>
            <input type="color" id="fldZabGradC" value="${line.zabuton?.gradient?.colorC || "#00FFFF"}" style="width:40px;height:24px;padding:0;border:none">
            <label class="lock-toggle" style="margin-left:8px"><input type="checkbox" id="fldZabGradCOn" ${line.zabuton?.gradient?.colorC ? "checked" : ""}><span>3 色目を使う</span></label>
          </div>
        </div>
        <div class="field">
          <span class="field-label">斜線</span>
          <label class="lock-toggle"><input type="checkbox" id="fldZabPatOn" ${line.zabuton?.pattern ? "checked" : ""}><span>ストライプを重ねる</span></label>
        </div>
        <div id="zabPatFields" style="${line.zabuton?.pattern ? "" : "display:none"}">
          <div class="field">
            <span class="field-label">線の太さ / 間隔</span>
            <input class="field-input" id="fldZabPatSize" type="number" min="0.5" step="0.5" value="${line.zabuton?.pattern?.size ?? 1.5}" style="width:60px">
            <input class="field-input" id="fldZabPatGap" type="number" min="0.5" step="0.5" value="${line.zabuton?.pattern?.gap ?? 3.5}" style="width:60px;margin-left:4px">
            <span style="font-size:10px;color:var(--gray-3);margin-left:8px">px</span>
          </div>
          <div class="field">
            <span class="field-label">角度 / 色</span>
            <input class="field-input" id="fldZabPatAngle" type="number" step="15" value="${line.zabuton?.pattern?.angle ?? 45}" style="width:60px">
            <input type="color" id="fldZabPatColor" value="${line.zabuton?.pattern?.color || "#000000"}" style="width:40px;height:24px;padding:0;border:none;margin-left:8px">
            <span style="font-size:10px;color:var(--gray-3);margin-left:8px">45=「＼」, 135=「／」</span>
          </div>
        </div>
      </div>
    </div>

    <div class="section" data-pane="look">
      <div class="section-title">光彩（テキストグロー）</div>
      <div class="field">
        <span class="field-label">有効</span>
        <label class="lock-toggle"><input type="checkbox" id="fldGlowOn" ${line.glow?.enabled ? "checked" : ""}><span>文字の周りに発光</span></label>
      </div>
      <div id="glowFields" style="${line.glow?.enabled ? "" : "display:none"}">
        <div class="field">
          <span class="field-label">色 / 不透明</span>
          <input type="color" id="fldGlowColor" value="${line.glow?.color || "#FF69B4"}" style="width:40px;height:24px;padding:0;border:none">
          <input class="field-input" id="fldGlowOpacity" type="number" min="0" max="1" step="0.05" value="${line.glow?.opacity ?? 0.9}" style="width:60px;margin-left:8px">
        </div>
        <div class="field">
          <span class="field-label">ぼかし px</span>
          <input class="field-input" id="fldGlowBlur" type="number" min="0" step="1" value="${line.glow?.blur ?? 20}" style="width:60px">
        </div>
      </div>
    </div>

    <div class="section" data-pane="look">
      <div class="section-title">ジッター（ブロック単位のランダム位置ずれ）</div>
      <div class="field">
        <span class="field-label">有効</span>
        <label class="lock-toggle"><input type="checkbox" id="fldJitOn" ${line.jitter?.enabled ? "checked" : ""}><span>"/" でブロック分割してランダムに揺らす</span></label>
      </div>
      <div id="jitFields" style="${line.jitter?.enabled ? "" : "display:none"}">
        <div class="field">
          <span class="field-label">シード</span>
          <input class="field-input" id="fldJitSeed" value="${line.jitter?.seed ?? 42}" style="width:60px">
          <button class="tool-btn" id="btnJitRerand" style="margin-left:8px;padding:2px 8px">🎲 再抽選</button>
        </div>
        <div class="field">
          <span class="field-label">最大 dx / dy (px)</span>
          <input class="field-input" id="fldJitMaxDx" value="${line.jitter?.maxDx ?? 20}" style="width:60px">
          <input class="field-input" id="fldJitMaxDy" value="${line.jitter?.maxDy ?? 20}" style="width:60px">
        </div>
        <div class="field">
          <span class="field-label">配置制約</span>
          <label class="lock-toggle"><input type="checkbox" id="fldJitPreventOverlap" ${line.jitter?.preventOverlap ? "checked" : ""}><span>重なり禁止・歌詞順を維持</span></label>
        </div>
        <div style="font-size:10px;color:var(--gray-3);margin-top:4px">
          歌詞中の <code>/</code> を境目に。無ければ行全体が 1 ブロック。<br>
          例：<code>手を/伸ばせ/ば届く</code> → 3 ブロックが独立に±dx/dy 揺れる（同じシードで毎回同じ位置）。<br>
          line モードでは AE 側は非対応（プレビューのみ）。
        </div>
      </div>
    </div>

    <div class="section" data-pane="content">
      <div class="section-title">強調</div>
      <textarea class="field-textarea" id="fldEmphasis" placeholder="例:&#10;ナイト:2&#10;君:1&#10;月:3:2  ← 月の2番目だけ Lv3">${escapeHtml(formatEmphasisSpecs(line.emphasis || []))}</textarea>
      <div style="font-size:10px;color:var(--gray-3);margin-top:4px">
        1行 = 1指定。形式：<code>テキスト:レベル(0-3)</code> または <code>テキスト:レベル:出現回数</code>
      </div>
    </div>

    <div class="section" data-pane="content">
      <div class="section-title">メモ</div>
      <textarea class="field-textarea" id="fldNote">${escapeHtml(line.note)}</textarea>
    </div>

    <div class="section">
      <div class="section-title">全体へ反映</div>
      <button class="tool-btn" id="btnApplyToProject">この行の見た目を全行へ反映</button>
      <div style="font-size:10px;color:var(--gray-3);margin-top:4px">
        フォント（斜体含む）・配置・座布団・光彩・下線・縁取り・文字色・<br>
        カーニング・ずらし・ジッター・テンプレ を全行へコピーします。<br>
        歌詞・TC・強調・メモは変わりません。<br>
        フォントと配置は新規行の既定値にも入ります。
      </div>
      <div style="font-size:10px;color:var(--gray-3);margin-top:6px">
        一部の行だけに反映したいときは、行リストで Ctrl / Shift を押しながら複数選択してください。
      </div>
    </div>
  `;

  // 動きのハンドラ
  const onM = (elId, build) => {
    const el = document.getElementById(elId);
    if (!el) return;
    el.addEventListener("change", (e) => {
      const v = el.type === "checkbox" ? el.checked : el.value;
      setProject(ops.setLineMotion(getProject(), id, build(v)));
    });
  };
  onM("fldMUnit",    v => ({ unit: v }));
  onM("fldMStagger", v => ({ stagger: Math.max(0, Number(v) || 0) }));
  for (const side of ["in", "out"]) {
    onM(`fldM_${side}_dur`,       v => ({ [side]: { dur: Math.max(0, Number(v) || 0) } }));
    onM(`fldM_${side}_ease`,      v => ({ [side]: { ease: v } }));
    onM(`fldM_${side}_fade`,      v => ({ [side]: { fade: !!v } }));
    onM(`fldM_${side}_slideOn`,   v => ({ [side]: { slide: { enabled: !!v } } }));
    onM(`fldM_${side}_slideDir`,  v => ({ [side]: { slide: { dir: v } } }));
    onM(`fldM_${side}_slideDist`, v => ({ [side]: { slide: { dist: Math.max(0, Number(v) || 0) } } }));
    onM(`fldM_${side}_scaleOn`,   v => ({ [side]: { scale: { enabled: !!v } } }));
    onM(`fldM_${side}_scaleFrom`, v => ({ [side]: { scale: { from: Math.max(0, Number(v) || 0) } } }));
  }

  // サブタブ：セクションの DOM 並び順は変えず、data-active-tab で CSS 出し分け
  detailPaneEl.dataset.activeTab = detailTab;
  detailPaneEl.querySelectorAll(".detail-tab").forEach(btn => {
    btn.addEventListener("click", () => setUi({ detailTab: btn.getAttribute("data-tab") }));
  });

  // ハンドラ
  document.getElementById("fldFontPreset")?.addEventListener("change", (e) => {
    const v = e.target.value;
    if (!v) return;
    setProject(ops.applyFontPresetToLine(getProject(), id, v));
  });
  document.getElementById("fldZabutonPreset")?.addEventListener("change", (e) => {
    const v = e.target.value;
    if (!v) return;
    setProject(ops.applyZabutonPresetToLine(getProject(), id, v));
  });

  // カスタムプリセットの保存 / 削除
  document.getElementById("btnSaveCustomPreset")?.addEventListener("click", () => {
    const p = getProject();
    const line2 = p.lines.find(l => l.id === id);
    if (!line2) return;
    const name = prompt("カスタムプリセット名（同じ名前で保存すると上書きします）", "");
    if (name === null) return;
    const r = saveLineAsCustomPreset(line2, name);
    if (!r.ok) { alert(r.error); return; }
    // 保存したプリセットを選択状態にして再描画
    setProject(ops.applyZabutonPresetToLine(getProject(), id, r.preset.id));
  });
  const delBtn = document.getElementById("btnDeleteCustomPreset");
  if (delBtn) delBtn.addEventListener("click", () => {
    const p = getProject();
    const line2 = p.lines.find(l => l.id === id);
    const pid = line2?.zabutonPresetId;
    if (!pid || !isCustomPresetId(pid)) return;
    if (!confirm("このカスタムプリセットを削除します。よろしいですか？\n（すでに適用済みの行の見た目はそのまま残ります）")) return;
    deleteCustomPreset(pid);
    // 参照だけ外す（見た目は保持）
    setProject(ops.setLineZabutonPresetId(getProject(), id, null));
  });

  const onTextChange = () => {
    const text = document.getElementById("fldText").value.replace(/\n/g, "\\n");
    setProject(ops.setLineText(getProject(), id, text));
  };
  document.getElementById("fldText")?.addEventListener("change", onTextChange);

  const tInEl = document.getElementById("fldTIn");
  const tOutEl = document.getElementById("fldTOut");

  // TC ドラッグ
  attachTcDrag(tInEl, () => getProject().fps, (newSec) => {
    setProject(ops.setLineIn(getProject(), id, newSec));
  });
  attachTcDrag(tOutEl, () => getProject().fps, (newSec) => {
    setProject(ops.setLineOut(getProject(), id, newSec));
  });

  // TC 直接入力（change）
  tInEl.addEventListener("change", (e) => {
    const sec = tcToSeconds(e.target.value, project.fps);
    setProject(ops.setLineIn(getProject(), id, sec));
  });
  tOutEl.addEventListener("change", (e) => {
    const sec = tcToSeconds(e.target.value, project.fps);
    setProject(ops.setLineOut(getProject(), id, sec));
  });
  document.getElementById("fldStagger")?.addEventListener("change", (e) => {
    setProject(ops.setLineStagger(getProject(), id, e.target.value));
  });

  // テンプレ：dropdown 変更 = 固定値を設定（固定ONにする）
  // AE を隠しているときはこの欄自体が無いので、存在するときだけ繋ぐ。
  ["Entry", "Hold", "Exit", "Design"].forEach(slot => {
    const slotLower = slot.toLowerCase();
    const sel = document.getElementById("fld" + slot);
    if (!sel) return;
    sel.addEventListener("change", (e) => {
      setProject(ops.setLineTemplate(getProject(), id, slotLower, e.target.value));
    });
  });

  // 固定チェックボックス
  detailPaneEl.querySelectorAll(".lock-cb").forEach(cb => {
    cb.addEventListener("change", (e) => {
      const slot = e.target.dataset.slot;
      if (e.target.checked) {
        // 現在表示中の継承値を「固定」値としてセット
        const project2 = getProject();
        const line2 = project2.lines.find(l => l.id === id);
        const resolved3 = resolveLineTemplate(line2, project2);
        setProject(ops.setLineTemplate(project2, id, slot, resolved3[slot]));
      } else {
        // 継承に戻す（null）
        setProject(ops.inheritLineTemplate(getProject(), id, slot));
      }
    });
  });

  document.getElementById("fldFontFamily")?.addEventListener("change", (e) => {
    const family = e.target.value.trim();
    setProject(ops.setLineFont(getProject(), id, { family: family || null }));
  });
  document.getElementById("fldFontSize")?.addEventListener("change", (e) => {
    const raw = e.target.value.trim();
    if (raw === "") {
      setProject(ops.setLineFont(getProject(), id, { size: null }));
    } else {
      const n = Number(raw);
      if (!isNaN(n) && n > 0) {
        setProject(ops.setLineFont(getProject(), id, { size: n }));
      }
    }
  });
  document.getElementById("fldFontItalic")?.addEventListener("change", (e) => {
    setProject(ops.setLineFont(getProject(), id, { italic: e.target.checked ? true : null }));
  });
  document.getElementById("fldInterTypeGap")?.addEventListener("change", (e) => {
    const v = Math.max(0, Number(e.target.value) || 0);
    const p = getProject();
    const line2 = p.lines.find(l => l.id === id);
    if (line2) setProject({ ...p, lines: p.lines.map(l => l.id === id ? { ...l, interTypeGap: v } : l) });
  });
  document.getElementById("fldAutoKerning")?.addEventListener("change", (e) => {
    const p = getProject();
    const on = e.target.checked;
    setProject({ ...p, lines: p.lines.map(l => l.id === id ? { ...l, autoKerning: on } : l) });
  });
  document.getElementById("fldTextColor")?.addEventListener("change", (e) => {
    setProject(ops.setLineTextColor(getProject(), id, e.target.value));
  });
  document.getElementById("btnTextColorClear")?.addEventListener("click", () => {
    setProject(ops.setLineTextColor(getProject(), id, null));
  });
  const applyStrokeFromUi = () => {
    const on = document.getElementById("fldTextStrokeOn").checked;
    if (!on) { setProject(ops.setLineTextStroke(getProject(), id, null)); return; }
    const color = document.getElementById("fldTextStrokeColor").value;
    const width = Math.max(0, Number(document.getElementById("fldTextStrokeWidth").value) || 2);
    setProject(ops.setLineTextStroke(getProject(), id, { color, width }));
  };
  document.getElementById("fldTextStrokeOn")?.addEventListener("change", applyStrokeFromUi);
  document.getElementById("fldTextStrokeColor")?.addEventListener("change", applyStrokeFromUi);
  document.getElementById("fldTextStrokeWidth")?.addEventListener("change", applyStrokeFromUi);
  document.getElementById("fldTracking")?.addEventListener("change", (e) => {
    setProject(ops.setLineTracking(getProject(), id, e.target.value));
  });

  document.getElementById("fldLayout")?.addEventListener("change", (e) => {
    setProject(ops.setLineLayout(getProject(), id, e.target.value));
  });
  document.getElementById("fldDx")?.addEventListener("change", (e) => {
    setProject(ops.setLinePos(getProject(), id, { dx: Number(e.target.value) || 0 }));
  });
  document.getElementById("fldDy")?.addEventListener("change", (e) => {
    setProject(ops.setLinePos(getProject(), id, { dy: Number(e.target.value) || 0 }));
  });
  // ↑↓ キーで dx/dy を増減（通常±10 / Shift±1 / Ctrl±100）
  attachArrowStep("fldDx", (v) => setProject(ops.setLinePos(getProject(), id, { dx: v })));
  attachArrowStep("fldDy", (v) => setProject(ops.setLinePos(getProject(), id, { dy: v })));

  // 座布団
  document.getElementById("fldZabOn")?.addEventListener("change", (e) => {
    setProject(ops.setLineZabuton(getProject(), id, { enabled: e.target.checked }));
  });
  const zabHandler = (elId, key, conv) => {
    const el = document.getElementById(elId);
    if (!el) return;
    el.addEventListener("change", (e) => {
      setProject(ops.setLineZabuton(getProject(), id, { [key]: conv ? conv(e.target.value) : e.target.value }));
    });
  };
  zabHandler("fldZabShape", "shape");
  zabHandler("fldZabMode", "mode");
  zabHandler("fldZabStrokeW", "strokeWidth", v => Math.max(0, Number(v) || 0));
  zabHandler("fldZabColor", "color");
  zabHandler("fldZabOpacity", "opacity", v => Math.max(0, Math.min(1, Number(v) || 0)));
  zabHandler("fldZabPadX", "paddingX", v => Number(v) || 0);
  zabHandler("fldZabPadY", "paddingY", v => Number(v) || 0);
  zabHandler("fldZabRadius", "cornerRadius", v => Math.max(0, Number(v) || 0));
  zabHandler("fldZabTiming", "timingMode");
  zabHandler("fldZabFade", "fade", v => Math.max(0, Number(v) || 0));
  attachArrowStep("fldZabPadX", (v) => setProject(ops.setLineZabuton(getProject(), id, { paddingX: v })));
  attachArrowStep("fldZabPadY", (v) => setProject(ops.setLineZabuton(getProject(), id, { paddingY: v })));
  attachArrowStep("fldZabRadius", (v) => setProject(ops.setLineZabuton(getProject(), id, { cornerRadius: Math.max(0, v) })));
  attachArrowStep("fldZabStrokeW", (v) => setProject(ops.setLineZabuton(getProject(), id, { strokeWidth: Math.max(0, v) })));
  document.getElementById("fldZabPerBlock")?.addEventListener("change", (e) => {
    setProject(ops.setLineZabuton(getProject(), id, { perBlock: e.target.checked }));
  });
  // 光彩
  document.getElementById("fldGlowOn")?.addEventListener("change", (e) => {
    setProject(ops.setLineGlow(getProject(), id, { enabled: e.target.checked }));
  });
  const glowHandler = (elId, key, conv) => {
    const el = document.getElementById(elId);
    if (!el) return;
    el.addEventListener("change", (e) => {
      setProject(ops.setLineGlow(getProject(), id, { [key]: conv ? conv(e.target.value) : e.target.value }));
    });
  };
  glowHandler("fldGlowColor", "color");
  glowHandler("fldGlowOpacity", "opacity", v => Math.max(0, Math.min(1, Number(v) || 0)));
  glowHandler("fldGlowBlur", "blur", v => Math.max(0, Number(v) || 0));
  attachArrowStep("fldGlowBlur", (v) => setProject(ops.setLineGlow(getProject(), id, { blur: Math.max(0, v) })));
  zabHandler("fldZabBlurX", "blurX", v => Math.max(0, Number(v) || 0));
  zabHandler("fldZabBlurY", "blurY", v => Math.max(0, Number(v) || 0));
  attachArrowStep("fldZabBlurX", (v) => setProject(ops.setLineZabuton(getProject(), id, { blurX: Math.max(0, v) })));
  attachArrowStep("fldZabBlurY", (v) => setProject(ops.setLineZabuton(getProject(), id, { blurY: Math.max(0, v) })));
  // グラデーションのハンドラ
  const gradOnEl = document.getElementById("fldZabGradOn");
  const setGrad = (partial) => {
    const p = getProject();
    const line2 = p.lines.find(l => l.id === id);
    const cur = line2?.zabuton?.gradient || { enabled: false, angle: 90, colorA: "#FF69B4", colorB: "#FFD54A", colorC: null };
    setProject(ops.setLineZabuton(p, id, { gradient: { ...cur, ...partial } }));
  };
  gradOnEl.addEventListener("change", (e) => setGrad({ enabled: e.target.checked }));
  document.getElementById("fldZabGradAngle")?.addEventListener("change", (e) => setGrad({ angle: Number(e.target.value) || 0 }));
  document.getElementById("fldZabGradA")?.addEventListener("change", (e) => setGrad({ colorA: e.target.value }));
  document.getElementById("fldZabGradB")?.addEventListener("change", (e) => setGrad({ colorB: e.target.value }));
  document.getElementById("fldZabGradC")?.addEventListener("change", (e) => setGrad({ colorC: e.target.value }));
  document.getElementById("fldZabGradCOn")?.addEventListener("change", (e) => {
    setGrad({ colorC: e.target.checked ? (document.getElementById("fldZabGradC")?.value || "#00FFFF") : null });
  });

  // 斜線パターンのハンドラ
  const setPat = (partial) => {
    const p = getProject();
    const line2 = p.lines.find(l => l.id === id);
    const cur = line2?.zabuton?.pattern || { type: "stripe", color: "#000000", angle: 45, size: 1.5, gap: 3.5 };
    setProject(ops.setLineZabuton(p, id, { pattern: { ...cur, ...partial } }));
  };
  document.getElementById("fldZabPatOn")?.addEventListener("change", (e) => {
    if (e.target.checked) setPat({});
    else setProject(ops.setLineZabuton(getProject(), id, { pattern: null }));
  });
  document.getElementById("fldZabPatSize")?.addEventListener("change", (e) => setPat({ size: Math.max(0.5, Number(e.target.value) || 1.5) }));
  document.getElementById("fldZabPatGap")?.addEventListener("change", (e) => setPat({ gap: Math.max(0.5, Number(e.target.value) || 3.5) }));
  document.getElementById("fldZabPatAngle")?.addEventListener("change", (e) => setPat({ angle: Number(e.target.value) || 0 }));
  document.getElementById("fldZabPatColor")?.addEventListener("change", (e) => setPat({ color: e.target.value }));
  attachArrowStep("fldZabPatSize", (v) => setPat({ size: Math.max(0.5, v) }));
  attachArrowStep("fldZabPatGap", (v) => setPat({ gap: Math.max(0.5, v) }));
  attachArrowStep("fldZabPatAngle", (v) => setPat({ angle: v }));

  // ジッター
  document.getElementById("fldJitOn")?.addEventListener("change", (e) => {
    setProject(ops.setLineJitter(getProject(), id, { enabled: e.target.checked }));
  });
  const jitHandler = (elId, key, conv) => {
    const el = document.getElementById(elId);
    if (!el) return;
    el.addEventListener("change", (e) => {
      setProject(ops.setLineJitter(getProject(), id, { [key]: conv ? conv(e.target.value) : e.target.value }));
    });
  };
  jitHandler("fldJitSeed", "seed", v => Math.floor(Number(v) || 0));
  jitHandler("fldJitMaxDx", "maxDx", v => Math.max(0, Number(v) || 0));
  jitHandler("fldJitMaxDy", "maxDy", v => Math.max(0, Number(v) || 0));
  attachArrowStep("fldJitSeed", (v) => setProject(ops.setLineJitter(getProject(), id, { seed: Math.floor(v) })));
  attachArrowStep("fldJitMaxDx", (v) => setProject(ops.setLineJitter(getProject(), id, { maxDx: Math.max(0, v) })));
  attachArrowStep("fldJitMaxDy", (v) => setProject(ops.setLineJitter(getProject(), id, { maxDy: Math.max(0, v) })));
  const rerandBtn = document.getElementById("btnJitRerand");
  if (rerandBtn) rerandBtn.addEventListener("click", () => {
    const s = Math.floor(Math.random() * 100000);
    setProject(ops.setLineJitter(getProject(), id, { seed: s }));
  });
  document.getElementById("fldJitPreventOverlap")?.addEventListener("change", (e) => {
    setProject(ops.setLineJitter(getProject(), id, { preventOverlap: e.target.checked }));
  });
  document.getElementById("fldLayerMode")?.addEventListener("change", (e) => {
    setProject(ops.setLineLayerMode(getProject(), id, e.target.value || null));
  });
  document.getElementById("fldNote")?.addEventListener("change", (e) => {
    setProject(ops.setLineNote(getProject(), id, e.target.value));
  });
  document.getElementById("btnPreviewSize")?.addEventListener("click", () => {
    setUi({ previewLarge: !getUi().previewLarge });
  });
  document.getElementById("btnApplyToProject")?.addEventListener("click", () => {
    const msg = "この行の設定を全体に反映します：\n"
      + "・フォント / サイズ → 全体設定のデフォルトへ\n"
      + "・レイアウト / layerMode / 固定テンプレ → デフォルトへ\n"
      + "・字間 / ずらし / 座布団 / ジッター / 配置(dx,dy,scale,rot) → 全行へコピー\n\n"
      + "よろしいですか？（Ctrl+Z で戻せます）";
    if (!confirm(msg)) return;
    setProject(ops.applyLineSettingsToProject(getProject(), id));
  });
  document.getElementById("fldEmphasis")?.addEventListener("change", (e) => {
    const specs = parseEmphasisSpecs(e.target.value);
    setProject(ops.setLineEmphasis(getProject(), id, specs));
  });
}

// ↑↓ キーで数値入力を増減するヘルパー
// 通常 ±10 / Shift ±1 / Ctrl ±100。setProject で再描画されてもフォーカスを復元する。

// 出入りの動きの UI。in / out で同じ形なので関数にする。
function motionSideHtml(side, m, label) {
  const s = m[side] || {};
  const p = (k) => `fldM_${side}_${k}`;
  return `
    <div class="section" data-pane="motion">
      <div class="section-title">${label}</div>
      <div class="field">
        <span class="field-label">長さ</span>
        <input class="field-input" id="${p("dur")}" type="number" step="0.05" min="0" value="${s.dur ?? 0.4}" style="width:70px">
        <span style="font-size:10px;color:var(--gray-3);margin-left:6px">秒（0 で動かさない）</span>
      </div>
      <div class="field">
        <span class="field-label">効き方</span>
        <select class="field-select" id="${p("ease")}" style="flex:1">
          ${Object.entries(EASINGS).map(([k, v]) =>
            `<option value="${k}" ${s.ease === k ? "selected" : ""}>${escapeHtml(v.label)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <span class="field-label">フェード</span>
        <label class="lock-toggle"><input type="checkbox" id="${p("fade")}" ${s.fade ? "checked" : ""}><span>透明度で出し入れ</span></label>
      </div>
      <div class="field">
        <span class="field-label">スライド</span>
        <label class="lock-toggle"><input type="checkbox" id="${p("slideOn")}" ${s.slide?.enabled ? "checked" : ""}><span>動かしながら</span></label>
      </div>
      <div class="field" style="${s.slide?.enabled ? "" : "display:none"}">
        <span class="field-label">向き / 距離</span>
        <select class="field-select" id="${p("slideDir")}" style="flex:1">
          ${Object.entries(SLIDE_DIRS).map(([k, v]) =>
            `<option value="${k}" ${s.slide?.dir === k ? "selected" : ""}>${escapeHtml(v.label)}</option>`).join("")}
        </select>
        <input class="field-input" id="${p("slideDist")}" type="number" step="5" min="0" value="${s.slide?.dist ?? 40}" style="width:60px;margin-left:6px">
        <span style="font-size:10px;color:var(--gray-3);margin-left:4px">px</span>
      </div>
      <div class="field">
        <span class="field-label">スケール</span>
        <label class="lock-toggle"><input type="checkbox" id="${p("scaleOn")}" ${s.scale?.enabled ? "checked" : ""}><span>大きさを変えながら</span></label>
      </div>
      <div class="field" style="${s.scale?.enabled ? "" : "display:none"}">
        <span class="field-label">開始倍率</span>
        <input class="field-input" id="${p("scaleFrom")}" type="number" step="0.05" min="0" value="${s.scale?.from ?? 0.8}" style="width:70px">
        <span style="font-size:10px;color:var(--gray-3);margin-left:6px">
          1.0 へ向かう。「ぽよん」は効き方で選ぶ
        </span>
      </div>
    </div>`;
}

function attachArrowStep(inputId, commit) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    let step = 10;
    if (e.shiftKey) step = 1;
    else if (e.ctrlKey || e.metaKey) step = 100;
    const dir = e.key === "ArrowUp" ? 1 : -1;
    const next = (Number(el.value) || 0) + dir * step;
    commit(next);
    // 再描画後に同じ入力へフォーカスを戻す（連打できるように）
    // ※ render は setProject 内で同期実行されるので timeout 0 で十分
    setTimeout(() => {
      const el2 = document.getElementById(inputId);
      if (el2) {
        el2.focus();
        const len = String(el2.value).length;
        try { el2.setSelectionRange(len, len); } catch (e2) {}
      }
    }, 0);
  });
}

function parseEmphasisSpecs(text) {
  return (text || "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith("#"))
    .map(line => {
      const parts = line.split(":");
      if (parts.length < 2) return null;
      const t = parts[0];
      const lv = Number(parts[1]);
      if (!t || isNaN(lv)) return null;
      const occ = parts[2] != null ? Math.max(1, Number(parts[2]) || 1) : 1;
      return { text: t, level: lv, occurrence: occ };
    })
    .filter(Boolean);
}

function formatEmphasisSpecs(specs) {
  return (specs || []).map(s => {
    const occ = s.occurrence && s.occurrence > 1 ? `:${s.occurrence}` : "";
    return `${s.text}:${s.level}${occ}`;
  }).join("\n");
}

// ───────────────────────────────────────────
// イベントハンドラ
// ───────────────────────────────────────────

function onRowClick(id, e) {
  const ui = getUi();
  const newSel = new Set(ui.selectedLineIds);
  const project = getProject();
  const allIds = project.lines.map(l => l.id);

  if (e.ctrlKey || e.metaKey) {
    if (newSel.has(id)) newSel.delete(id); else newSel.add(id);
  } else if (e.shiftKey && newSel.size > 0) {
    const last = [...newSel][newSel.size - 1];
    const i1 = allIds.indexOf(last);
    const i2 = allIds.indexOf(id);
    const [a, b] = [Math.min(i1, i2), Math.max(i1, i2)];
    newSel.clear();
    for (let i = a; i <= b; i++) newSel.add(allIds[i]);
  } else {
    newSel.clear();
    newSel.add(id);
  }
  setUi({ selectedLineIds: newSel });
}

function onAddLine() {
  const ui = getUi();
  const project = getProject();
  let opts = { text: "新しい行" };
  if (ui.selectedLineIds.size === 1) {
    opts.afterId = [...ui.selectedLineIds][0];
  }
  const newProject = ops.addLine(project, opts);
  const newId = newProject.nextLineId - 1;
  setProject(newProject);
  setUi({ selectedLineIds: new Set([newId]) });
}

function onRemoveLine() {
  const ui = getUi();
  const ids = [...ui.selectedLineIds];
  if (ids.length === 0) return;
  if (!confirm(`${ids.length} 行を削除しますか？`)) return;
  let p = getProject();
  for (const id of ids) p = ops.removeLine(p, id);
  setProject(p);
  setUi({ selectedLineIds: new Set() });
}

function onSplitLine() {
  const ui = getUi();
  if (ui.selectedLineIds.size !== 1) {
    alert("1行だけ選択してから実行してください");
    return;
  }
  const id = [...ui.selectedLineIds][0];
  const line = getProject().lines.find(l => l.id === id);
  if (!line) return;
  const pos = prompt(`分割位置（文字数）: 全 ${line.text.length} 文字中の何文字目で分けますか？`, Math.floor(line.text.length / 2));
  if (!pos) return;
  const idx = parseInt(pos, 10);
  if (isNaN(idx)) return;
  setProject(ops.splitLine(getProject(), id, idx));
}

function onMergeNext() {
  const ui = getUi();
  if (ui.selectedLineIds.size !== 1) {
    alert("1行だけ選択してから実行してください");
    return;
  }
  const id = [...ui.selectedLineIds][0];
  const project = getProject();
  const idx = project.lines.findIndex(l => l.id === id);
  if (idx < 0 || idx >= project.lines.length - 1) {
    alert("次の行がありません");
    return;
  }
  const nextId = project.lines[idx + 1].id;
  setProject(ops.mergeLines(project, id, nextId));
}

