// 歌詞タブ：行リスト + 詳細パネル

import { getProject, getUi, setProject, setUi, getFileBlobUrl } from "./state.js";
import * as ops from "../core/operations.js";
import { secondsToTC, tcToSeconds, attachTcDrag } from "./tc.js";
import { resolveLineTemplate, isLineTemplateFixed, resolveLineLayerMode } from "../core/project.js";
import { loadFonts, getFontEntries, cssFamilyFor, labelFor } from "../core/fonts_loader.js";
import { parseJitterBlocks, jitterOffsetFor } from "../core/utils.js";
import { getFontPresetsByCategory, getZabutonPresetsByCategory, getFontPresetById } from "../core/presets.js";
import { SMALL_KANA, classifyChar } from "../core/char_type.js";

let detailPaneEl;
let lyricRowsEl;
let lineCountEl;

export function init() {
  detailPaneEl = document.getElementById("detailPane");
  lyricRowsEl = document.getElementById("lyricRows");
  lineCountEl = document.getElementById("lineCount");

  document.getElementById("btnAddLine").addEventListener("click", onAddLine);
  document.getElementById("btnSplitLine").addEventListener("click", onSplitLine);
  document.getElementById("btnMergeNext").addEventListener("click", onMergeNext);
  document.getElementById("btnRemoveLine").addEventListener("click", onRemoveLine);

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
    detailPaneEl.innerHTML = `
      <div class="detail-header">
        <div class="detail-row-label">複数行選択中</div>
        <div class="detail-row-text">${selected.length} 行</div>
      </div>
      <div class="section">
        <div class="section-title">一括操作</div>
        <button class="tool-btn" id="btnBulkDel">選択行を全て削除</button>
      </div>
    `;
    document.getElementById("btnBulkDel").addEventListener("click", () => {
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

    <div class="section">
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
        <select class="field-select" id="fldZabutonPreset" style="flex:1" ${!line.fontPresetId ? "disabled" : ""}>
          <option value="">— 未適用 —</option>
          ${(() => {
            const fontPreset = getFontPresetById(line.fontPresetId);
            if (!fontPreset) return "";
            const list = getZabutonPresetsByCategory(fontPreset.category);
            return list.map(p => {
              const sel = line.zabutonPresetId === p.id ? "selected" : "";
              return `<option value="${p.id}" ${sel}>${escapeHtml(p.label)}</option>`;
            }).join("");
          })()}
        </select>
      </div>
      <div style="font-size:10px;color:var(--gray-3);margin-top:4px">
        フォント選択 → 同カテゴリの座布団候補が並びます（適用後も個別編集可）
      </div>
    </div>

    <div class="section">
      <div class="section-title">歌詞テキスト</div>
      <textarea class="field-textarea" id="fldText">${escapeHtml(ttext)}</textarea>
      <div style="font-size:10px;color:var(--gray-3);margin-top:4px">改行は \\n リテラルか実改行どちらでも</div>
    </div>

    <div class="section">
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

    <div class="section">
      <div class="section-title">モーション</div>
      ${tmplSlotHtml("entry", "Entry")}
      ${tmplSlotHtml("hold", "Hold")}
      ${tmplSlotHtml("exit", "Exit")}
    </div>

    <div class="section">
      <div class="section-title">デザイン</div>
      ${tmplSlotHtml("design", "Design")}
    </div>

    <div class="section">
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
        <span class="field-label">文字種ギャップ</span>
        <input class="field-input" id="fldInterTypeGap" type="number" step="0.02" min="0" value="${line.interTypeGap ?? 0}" style="width:80px">
        <span style="font-size:10px;color:var(--gray-3);margin-left:8px">em（英/カナ/漢字境界に空き）</span>
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
    </div>

    <div class="section">
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
      <div class="field">
        <span class="field-label">layerMode</span>
        <select class="field-select" id="fldLayerMode">
          <option value="" ${line.layerMode == null ? "selected" : ""}>継承（${resolveLineLayerMode(line, project)}）</option>
          <option value="char" ${line.layerMode === "char" ? "selected" : ""}>char（文字ごと）</option>
          <option value="line" ${line.layerMode === "line" ? "selected" : ""}>line（行で1レイヤ）</option>
        </select>
      </div>
    </div>

    <div class="section">
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
      </div>
    </div>

    <div class="section">
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

    <div class="section">
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

    <div class="section">
      <div class="section-title">強調</div>
      <textarea class="field-textarea" id="fldEmphasis" placeholder="例:&#10;ナイト:2&#10;君:1&#10;月:3:2  ← 月の2番目だけ Lv3">${escapeHtml(formatEmphasisSpecs(line.emphasis || []))}</textarea>
      <div style="font-size:10px;color:var(--gray-3);margin-top:4px">
        1行 = 1指定。形式：<code>テキスト:レベル(0-3)</code> または <code>テキスト:レベル:出現回数</code>
      </div>
    </div>

    <div class="section">
      <div class="section-title">メモ</div>
      <textarea class="field-textarea" id="fldNote">${escapeHtml(line.note)}</textarea>
    </div>

    <div class="section">
      <div class="section-title">全体へ反映</div>
      <button class="tool-btn" id="btnApplyToProject">この行の設定を全体に反映</button>
      <div style="font-size:10px;color:var(--gray-3);margin-top:4px">
        フォント・レイアウト・固定テンプレ → デフォルトへ<br>
        字間・ずらし・座布団・ジッター・配置(dx/dy/scale/rot) → 全行へコピー
      </div>
    </div>
  `;

  // ハンドラ
  document.getElementById("fldFontPreset").addEventListener("change", (e) => {
    const v = e.target.value;
    if (!v) return;
    setProject(ops.applyFontPresetToLine(getProject(), id, v));
  });
  document.getElementById("fldZabutonPreset").addEventListener("change", (e) => {
    const v = e.target.value;
    if (!v) return;
    setProject(ops.applyZabutonPresetToLine(getProject(), id, v));
  });

  const onTextChange = () => {
    const text = document.getElementById("fldText").value.replace(/\n/g, "\\n");
    setProject(ops.setLineText(getProject(), id, text));
  };
  document.getElementById("fldText").addEventListener("change", onTextChange);

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
  document.getElementById("fldStagger").addEventListener("change", (e) => {
    setProject(ops.setLineStagger(getProject(), id, e.target.value));
  });

  // テンプレ：dropdown 変更 = 固定値を設定（固定ONにする）
  ["Entry", "Hold", "Exit", "Design"].forEach(slot => {
    const slotLower = slot.toLowerCase();
    const sel = document.getElementById("fld" + slot);
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

  document.getElementById("fldFontFamily").addEventListener("change", (e) => {
    const family = e.target.value.trim();
    setProject(ops.setLineFont(getProject(), id, { family: family || null }));
  });
  document.getElementById("fldFontSize").addEventListener("change", (e) => {
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
  document.getElementById("fldFontItalic").addEventListener("change", (e) => {
    setProject(ops.setLineFont(getProject(), id, { italic: e.target.checked ? true : null }));
  });
  document.getElementById("fldInterTypeGap").addEventListener("change", (e) => {
    const v = Math.max(0, Number(e.target.value) || 0);
    const p = getProject();
    const line2 = p.lines.find(l => l.id === id);
    if (line2) setProject({ ...p, lines: p.lines.map(l => l.id === id ? { ...l, interTypeGap: v } : l) });
  });
  document.getElementById("fldTextColor").addEventListener("change", (e) => {
    setProject(ops.setLineTextColor(getProject(), id, e.target.value));
  });
  document.getElementById("btnTextColorClear").addEventListener("click", () => {
    setProject(ops.setLineTextColor(getProject(), id, null));
  });
  document.getElementById("fldTracking").addEventListener("change", (e) => {
    setProject(ops.setLineTracking(getProject(), id, e.target.value));
  });

  document.getElementById("fldLayout").addEventListener("change", (e) => {
    setProject(ops.setLineLayout(getProject(), id, e.target.value));
  });
  document.getElementById("fldDx").addEventListener("change", (e) => {
    setProject(ops.setLinePos(getProject(), id, { dx: Number(e.target.value) || 0 }));
  });
  document.getElementById("fldDy").addEventListener("change", (e) => {
    setProject(ops.setLinePos(getProject(), id, { dy: Number(e.target.value) || 0 }));
  });
  // ↑↓ キーで dx/dy を増減（通常±10 / Shift±1 / Ctrl±100）
  attachArrowStep("fldDx", (v) => setProject(ops.setLinePos(getProject(), id, { dx: v })));
  attachArrowStep("fldDy", (v) => setProject(ops.setLinePos(getProject(), id, { dy: v })));

  // 座布団
  document.getElementById("fldZabOn").addEventListener("change", (e) => {
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
  document.getElementById("fldZabPerBlock").addEventListener("change", (e) => {
    setProject(ops.setLineZabuton(getProject(), id, { perBlock: e.target.checked }));
  });
  // 光彩
  document.getElementById("fldGlowOn").addEventListener("change", (e) => {
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
  document.getElementById("fldZabGradAngle").addEventListener("change", (e) => setGrad({ angle: Number(e.target.value) || 0 }));
  document.getElementById("fldZabGradA").addEventListener("change", (e) => setGrad({ colorA: e.target.value }));
  document.getElementById("fldZabGradB").addEventListener("change", (e) => setGrad({ colorB: e.target.value }));
  document.getElementById("fldZabGradC").addEventListener("change", (e) => setGrad({ colorC: e.target.value }));
  document.getElementById("fldZabGradCOn").addEventListener("change", (e) => {
    setGrad({ colorC: e.target.checked ? (document.getElementById("fldZabGradC")?.value || "#00FFFF") : null });
  });

  // ジッター
  document.getElementById("fldJitOn").addEventListener("change", (e) => {
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
  document.getElementById("fldJitPreventOverlap").addEventListener("change", (e) => {
    setProject(ops.setLineJitter(getProject(), id, { preventOverlap: e.target.checked }));
  });
  document.getElementById("fldLayerMode").addEventListener("change", (e) => {
    setProject(ops.setLineLayerMode(getProject(), id, e.target.value || null));
  });
  document.getElementById("fldNote").addEventListener("change", (e) => {
    setProject(ops.setLineNote(getProject(), id, e.target.value));
  });
  document.getElementById("btnPreviewSize").addEventListener("click", () => {
    setUi({ previewLarge: !getUi().previewLarge });
  });
  document.getElementById("btnApplyToProject").addEventListener("click", () => {
    const msg = "この行の設定を全体に反映します：\n"
      + "・フォント / サイズ → 全体設定のデフォルトへ\n"
      + "・レイアウト / layerMode / 固定テンプレ → デフォルトへ\n"
      + "・字間 / ずらし / 座布団 / ジッター / 配置(dx,dy,scale,rot) → 全行へコピー\n\n"
      + "よろしいですか？（Ctrl+Z で戻せます）";
    if (!confirm(msg)) return;
    setProject(ops.applyLineSettingsToProject(getProject(), id));
  });
  document.getElementById("fldEmphasis").addEventListener("change", (e) => {
    const specs = parseEmphasisSpecs(e.target.value);
    setProject(ops.setLineEmphasis(getProject(), id, specs));
  });
}

// ↑↓ キーで数値入力を増減するヘルパー
// 通常 ±10 / Shift ±1 / Ctrl ±100。setProject で再描画されてもフォーカスを復元する。
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

// 選択行のプレビュー：最終解像度の比率のステージ上に、AE と同じ配置ルールで描画
// - Y: layoutToY 相当（top=15% / center=50% / bottom=85%）+ dy
// - X: 中央 + dx（AE 側と同じ）
// - フォントサイズ等は cqw 単位（ステージ幅基準）で解像度比スケール
function renderLinePreviewHtml(line, project) {
  const resW = project.resolution?.w || 1920;
  const resH = project.resolution?.h || 1080;
  const familyValue = line.fontOverride?.family || project.font.family || "";
  const cssFam = cssFamilyFor(familyValue);
  const rawSize = line.fontOverride?.size || project.font.size || 48;
  const tracking = Number(line.tracking) || 0;

  // AE 実寸 → ステージ幅基準の cqw 換算（1cqw = ステージ幅の1%）
  const toCqw = (px) => (px / resW * 100);
  const fontCqw = toCqw(rawSize);
  // char モードの文字送りは ratio = 1.10 + tracking → 余白分 = (0.10 + tracking) * fontSize
  const letterCqw = toCqw((0.10 + tracking) * rawSize);

  const layout = String(line.layout || "h_bottom");
  const vertical = /^v[lrc]_/.test(layout);

  const dx = line.pos?.dx || 0;
  const dy = line.pos?.dy || 0;
  const scale = line.pos?.scale ?? 1.0;
  const rot = line.pos?.rot || 0;

  const text = (line.text || "");
  const htmlText = buildLineInnerHtml(line, { resW, resH, toCqw, rawSize }) || "<span style='opacity:.4'>（歌詞なし）</span>";

  // 位置は % 指定（absolute 配置の % はステージ寸法基準なので確実）
  let leftPct, topPct, translate;
  if (vertical) {
    // 縦組み：列 X = vl:15% / vc:50% / vr:85%、Y は top/center/bottom で列のアンカーが変わる
    let xPct = 50;
    if (layout.startsWith("vl_")) xPct = 15;
    else if (layout.startsWith("vr_")) xPct = 85;
    leftPct = xPct + (dx / resW * 100);
    if (layout.includes("top"))         { topPct = 15 + (dy / resH * 100); translate = "translate(-50%, 0)"; }
    else if (layout.includes("bottom")) { topPct = 85 + (dy / resH * 100); translate = "translate(-50%, -100%)"; }
    else                                { topPct = 50 + (dy / resH * 100); translate = "translate(-50%, -50%)"; }
  } else {
    // 横組み：X 中央、Y = top:15% / center:50% / bottom:85%
    let yPct = 50;
    if (layout.includes("top")) yPct = 15;
    else if (layout.includes("bottom")) yPct = 85;
    leftPct = 50 + (dx / resW * 100);
    topPct = yPct + (dy / resH * 100);
    translate = "translate(-50%, -50%)";
  }

  // 座布団：perBlock=false のとき text と分離した absolute layer で描画
  // （blur 等が text に影響しないよう別 div にする）
  const zab = line.zabuton;
  const perBlockZab = !!(zab && zab.enabled && zab.perBlock);
  const filterId = `zab-blur-${line.id}`;
  const zabResult = (zab && zab.enabled && !perBlockZab)
    ? buildZabLayerCss(zab, toCqw, vertical, filterId)
    : { css: "", svgDef: "" };
  const zabLayerHtml = zabResult.css
    ? `${zabResult.svgDef}<div style="${zabResult.css}"></div>`
    : '';

  // 外枠 wrapper: 位置・変形はここに（子は shrink-to-fit で text natural size）
  const wrapperStyle = [
    `position:absolute`,
    `left: ${leftPct.toFixed(3)}%`,
    `top: ${topPct.toFixed(3)}%`,
    `transform: ${translate}${vertical ? " translate(-0.1em, 0)" : ""} rotate(${rot}deg) scale(${scale})`,
    `white-space: nowrap`,
  ].join(";");

  // text 要素は wrapper 内に置く。位置指定なし（wrapper が位置を持つ）、z-index で座布団 layer の上に。
  const italic = !!line.fontOverride?.italic;
  // 光彩（テキストグロー）：text-shadow を多層で塗って強めのグローを再現
  const glow = line.glow;
  let glowCss = "";
  if (glow && glow.enabled) {
    const gc = hexToRgba(glow.color || "#FF69B4", glow.opacity ?? 0.9);
    const gb = Number(glow.blur) || 20;
    // 極濃い光彩：同一 blur を 8 回重ねて色を積み上げ + 外側 2 段ハロー
    const stack = [];
    for (let i = 0; i < 8; i++) stack.push(`0 0 ${gb}px ${gc}`);
    stack.push(`0 0 ${(gb*2).toFixed(1)}px ${gc}`);
    stack.push(`0 0 ${(gb*4).toFixed(1)}px ${gc}`);
    glowCss = `text-shadow: ${stack.join(", ")}`;
  }
  const textStyle = [
    `position: relative`,
    `z-index: 1`,
    `font-family: '${(cssFam || "").replace(/'/g, "\\'")}', system-ui, sans-serif`,
    `font-size: ${fontCqw.toFixed(3)}cqw`,
    `letter-spacing: ${letterCqw.toFixed(3)}cqw`,
    `line-height: ${vertical ? 1 : 1.3}`,
    `color: ${line.textColor || "#fff"}`,
    `text-align: center`,
    italic ? `font-style: italic` : ``,
    vertical ? `writing-mode: vertical-rl` : ``,
    glowCss,
  ].filter(Boolean).join(";");

  // 配置ガイド（15/50/85% の水平線 + 中央縦線）
  const guide = (pct) => `<div style="position:absolute;left:0;right:0;top:${pct}%;border-top:1px dashed rgba(255,255,255,.12)"></div>`;
  const vGuide = `<div style="position:absolute;top:0;bottom:0;left:50%;width:1px;background:rgba(255,80,80,.55)"></div>`;

  const meta = `${escapeHtml(labelFor(familyValue) || "(継承)")} / size ${rawSize} / tracking ${tracking} / ${escapeHtml(layout)}${dx || dy ? ` / dx:${dx} dy:${dy}` : ""}`;
  return `
    <div style="container-type:inline-size;width:100%;aspect-ratio:${resW}/${resH};background:#101014;border:1px solid var(--gray-5,#333);border-radius:4px;position:relative;overflow:hidden">
      ${renderPreviewBackgrounds(line, project)}
      ${guide(15)}${guide(50)}${guide(85)}
      ${vGuide}
      <div style="${wrapperStyle}">
        ${zabLayerHtml}
        <div style="${textStyle}">${htmlText}</div>
      </div>
    </div>
    <div style="margin-top:6px;font-size:10px;color:var(--gray-3, #999)">${escapeHtml(meta)}</div>
  `;
}

// 行の tIn 時点でアクティブな背景をステージに描画（画像/動画/単色、fit/opacity/blend 反映）
function renderPreviewBackgrounds(line, project) {
  const bgs = project.backgrounds || [];
  if (!bgs.length) return "";
  const t = line.tIn;
  // 行に TC があればその時点でアクティブな bg、無ければ最初の bg
  let active = (t != null)
    ? bgs.filter(b => (b.tIn ?? 0) <= t && t < (b.tOut ?? Infinity))
    : [bgs[0]];
  if (!active.length && t != null) return "";

  const fitMap = { cover: "cover", contain: "contain", stretch: "fill", original: "none" };
  const blendMap = { normal: "normal", multiply: "multiply", screen: "screen", overlay: "overlay", add: "plus-lighter", lighten: "lighten", darken: "darken" };
  const videoExts = /\.(mp4|m4v|mov|webm)$/i;

  return active.map(bg => {
    const opacity = bg.opacity ?? 1.0;
    const blend = blendMap[bg.blend] || "normal";
    const common = `position:absolute;inset:0;opacity:${opacity};mix-blend-mode:${blend}`;
    if (bg.solidColor) {
      return `<div style="${common};background:${escapeHtml(bg.solidColor)}"></div>`;
    }
    if (bg.file) {
      // Web 版：ブラウザで選択したファイルを Blob URL レジストリから引く
      const src = getFileBlobUrl(bg.file);
      if (!src) {
        return `<div style="${common};background:#222;display:flex;align-items:center;justify-content:center;color:#666;font-size:11px">背景ファイル未読込<br>${escapeHtml(bg.file)}</div>`;
      }
      const fit = fitMap[bg.fit] || "cover";
      if (videoExts.test(bg.file)) {
        return `<video src="${escapeHtml(src)}" preload="metadata" muted style="${common};width:100%;height:100%;object-fit:${fit}"></video>`;
      }
      return `<img src="${escapeHtml(src)}" style="${common};width:100%;height:100%;object-fit:${fit}">`;
    }
    return "";
  }).join("");
}

// #RRGGBB + opacity → rgba() 文字列
function hexToRgba(hex, opacity) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return `rgba(0,0,0,${opacity})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${opacity})`;
}

// 強調スペック（{text, level, occurrence}）を色分け span で反映
// 色はアプリ内の目印（AE の design 色とは別物）
const EMPHASIS_COLORS = { 1: "#ffd54a", 2: "#ff8a65", 3: "#ff5252" };
// 座布団の CSS スタイル配列を返す（外側でも per-block span でも共用）
// 座布団を absolute layer として描画する用の CSS（text と分離、blur は text に影響しない）。
// inset で padding 分外側に広げる。
function buildZabLayerCss(zab, toCqw, isVertical, filterId) {
  if (!zab || !zab.enabled) return { css: "", svgDef: "" };
  const px = toCqw(zab.paddingX ?? 0);
  const py = toCqw(zab.paddingY ?? 0);
  let radius = "0";
  if (zab.shape === "round") radius = `${toCqw(zab.cornerRadius ?? 16).toFixed(3)}cqw`;
  else if (zab.shape === "pill") radius = "999em";
  else if (zab.shape === "circle") radius = "50%";
  const opacity = zab.opacity ?? 0.5;
  const rgba = hexToRgba(zab.color || "#000000", opacity);
  const grad = zab.gradient;
  let bgCss = rgba;
  if (grad && grad.enabled) {
    const cA = hexToRgba(grad.colorA || "#FF69B4", opacity);
    const cB = hexToRgba(grad.colorB || "#FFD54A", opacity);
    // 縦組みではグラデも「テキスト方向」に沿うよう +90 度回転
    const rawAngle = Number(grad.angle) || 90;
    const angle = ((rawAngle + (isVertical ? 90 : 0)) % 360 + 360) % 360;
    bgCss = grad.colorC
      ? `linear-gradient(${angle}deg, ${cA}, ${cB}, ${hexToRgba(grad.colorC, opacity)})`
      : `linear-gradient(${angle}deg, ${cA}, ${cB})`;
  }
  const styles = [
    `position:absolute`,
    `inset: -${py.toFixed(3)}cqw -${px.toFixed(3)}cqw`,
    `border-radius: ${radius}`,
    `z-index: 0`,
    `pointer-events: none`,
  ];
  if (zab.mode === "stroke") {
    const strokeColor = (grad && grad.enabled) ? hexToRgba(grad.colorA || "#FF69B4", opacity) : rgba;
    const sw = toCqw(zab.strokeWidth ?? 2);
    styles.push(`background: transparent`);
    styles.push(`box-shadow: inset 0 0 0 ${sw.toFixed(3)}cqw ${strokeColor}`);
  } else {
    styles.push(`background: ${bgCss}`);
  }
  const bx = Number(zab.blurX) || 0;
  const by = Number(zab.blurY) || 0;
  let svgDef = "";
  if (bx > 0 || by > 0) {
    if (bx === by) {
      // X=Y のときは CSS blur() が確実
      styles.push(`filter: blur(${bx}px)`);
    } else {
      // X!=Y は SVG feGaussianBlur を DOM に埋め込んで参照
      // filter 領域を大幅に広げて大きな blur でも clip されないよう
      svgDef = `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0"><filter id="${filterId}" x="-500%" y="-500%" width="1100%" height="1100%"><feGaussianBlur stdDeviation="${bx} ${by}"/></filter></svg>`;
      styles.push(`filter: url(#${filterId})`);
    }
  }
  return { css: styles.join(';'), svgDef };
}

function buildZabCss(zab, toCqw) {
  if (!zab || !zab.enabled) return [];
  const px = toCqw(zab.paddingX ?? 0);
  const py = toCqw(zab.paddingY ?? 0);
  let radius = "0";
  if (zab.shape === "round") radius = `${toCqw(zab.cornerRadius ?? 16).toFixed(3)}cqw`;
  else if (zab.shape === "pill") radius = "999em";
  else if (zab.shape === "circle") radius = "50%";
  const opacity = zab.opacity ?? 0.5;
  const rgba = hexToRgba(zab.color || "#000000", opacity);
  // グラデーション設定：あれば background に linear-gradient を使用
  const grad = zab.gradient;
  let bgCss = rgba;
  if (grad && grad.enabled) {
    const cA = hexToRgba(grad.colorA || "#FF69B4", opacity);
    const cB = hexToRgba(grad.colorB || "#FFD54A", opacity);
    const angle = Number(grad.angle) || 90;
    if (grad.colorC) {
      const cC = hexToRgba(grad.colorC, opacity);
      bgCss = `linear-gradient(${angle}deg, ${cA}, ${cB}, ${cC})`;
    } else {
      bgCss = `linear-gradient(${angle}deg, ${cA}, ${cB})`;
    }
  }
  const styles = [
    `padding: ${py.toFixed(3)}cqw ${px.toFixed(3)}cqw`,
    `margin: -${py.toFixed(3)}cqw -${px.toFixed(3)}cqw`,
    `border-radius: ${radius}`,
  ];
  if (zab.mode === "stroke") {
    // stroke モードではグラデ非対応（AE 側も同様）、色 A or 単色で描画
    const strokeColor = (grad && grad.enabled) ? hexToRgba(grad.colorA || "#FF69B4", opacity) : rgba;
    const sw = toCqw(zab.strokeWidth ?? 2);
    styles.push(`box-shadow: inset 0 0 0 ${sw.toFixed(3)}cqw ${strokeColor}`);
  } else {
    styles.push(`background: ${bgCss}`);
  }
  // エッジぼかし X/Y：SVG feGaussianBlur で個別指定
  const bx = Number(zab.blurX) || 0;
  const by = Number(zab.blurY) || 0;
  if (bx > 0 || by > 0) {
    // cqw で数値を大きくしても SVG filter は px 相当に解釈するので、
    // まず AE px を preview scale に近似変換する: 1cqw ≒ (stageWidth/100)px
    // ここでは簡易的に AE px の値を SVG stdDeviation に流用（ステージスケールが変わっても目安として使える）
    const svg = `<svg xmlns='http://www.w3.org/2000/svg'><filter id='b'><feGaussianBlur stdDeviation='${bx} ${by}'/></filter></svg>`;
    styles.push(`filter: url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}#b")`);
  }
  return styles;
}

// 行の内側HTMLを組み立てる。
// - "/" はジッター区切りとして表示せず、境界としてのみ扱う
// - "\\n" / 実改行は <br>
// - emphasis は splitChars 相当（"/"・改行除外）の文字インデックスで解決
// - line.jitter?.enabled なら parseJitterBlocks で分割し、ブロックごとに translate
// - line.zabuton?.perBlock なら各ブロック span に座布団装飾を掛ける
function buildLineInnerHtml(line, opts) {
  const text = line.text || "";
  if (!text) return "";
  const resW = opts.resW || 1920;
  const toCqw = opts.toCqw || ((px) => (px / resW * 100));

  // トークン化：char / br / sep（区切り"/"）
  const tokens = []; // {type:'char', ch, charIdx} | {type:'br'} | {type:'sep'}
  let charIdx = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\" && text[i + 1] === "n") { tokens.push({ type: "br" }); i++; continue; }
    if (c === "\n") { tokens.push({ type: "br" }); continue; }
    if (c === "/") { tokens.push({ type: "sep" }); continue; }
    tokens.push({ type: "char", ch: c, charIdx });
    charIdx++;
  }
  const totalChars = charIdx;

  // emphasis：splitChars 連結でマッチ
  const cleanText = tokens.filter(t => t.type === "char").map(t => t.ch).join("");
  const levels = new Array(totalChars).fill(0);
  for (const spec of (line.emphasis || [])) {
    if (!spec || !spec.text || !spec.level) continue;
    let from = 0, count = 0;
    const want = spec.occurrence || 1;
    while (true) {
      const idx = cleanText.indexOf(spec.text, from);
      if (idx < 0) break;
      count++;
      if (count === want) {
        for (let i = idx; i < idx + spec.text.length; i++) levels[i] = spec.level;
        break;
      }
      from = idx + 1;
    }
  }

  // 縦組みフラグ（小書きかな位置補正で使用）
  const isVerticalLayout = /^v[lrc]_/.test(String(line.layout || "h_bottom"));

  // ジッター
  const jit = line.jitter;
  const jitterOn = !!(jit && jit.enabled && totalChars > 0);
  // 座布団 perBlock
  const zab = line.zabuton;
  const perBlockZab = !!(zab && zab.enabled && zab.perBlock && totalChars > 0);
  const blockMode = jitterOn || perBlockZab;

  const blockOf = new Array(totalChars).fill(-1);
  const blockOffsets = []; // [{dxCqw, dyCqw}]
  if (blockMode) {
    const blocks = parseJitterBlocks(text);
    // クランプ用にブロック中心の絶対 AE px 座標を算出。JSX 側と同ロジック（近似：全文字同サイズ）。
    const resH = opts.resH || 1080;
    const rawSize = opts.rawSize || 48;
    const tracking = Number(line.tracking) || 0;
    const charAdvance = rawSize * (1.10 + tracking);
    const totalWidth = totalChars * charAdvance;
    const layout = String(line.layout || "h_bottom");
    const vertical = /^v[lrc]_/.test(layout);
    const dx = line.pos?.dx || 0;
    const dy = line.pos?.dy || 0;
    let textCX, textCY;
    if (vertical) {
      let colXPct = 50;
      if (layout.startsWith("vl_")) colXPct = 15;
      else if (layout.startsWith("vr_")) colXPct = 85;
      textCX = resW * colXPct / 100 + dx;
      if (layout.includes("top"))         textCY = resH * 0.15 + totalWidth / 2 + dy;
      else if (layout.includes("bottom")) textCY = resH * 0.85 - totalWidth / 2 + dy;
      else                                textCY = resH / 2 + dy;
    } else {
      textCX = resW / 2 + dx;
      if (layout.includes("top"))         textCY = resH * 0.15 + dy;
      else if (layout.includes("bottom")) textCY = resH * 0.85 + dy;
      else                                textCY = resH / 2 + dy;
    }
    const margin = rawSize / 2; // 文字端の余白（fontSize / 2 = 半文字）
    // 一旦 px で計算して、preventOverlap パスを通してから cqw に変換
    const blockInfos = [];
    blocks.forEach((b, bi) => {
      for (let i = b.start; i <= b.end; i++) blockOf[i] = bi;
      let off = { dx: 0, dy: 0 };
      if (jitterOn) {
        off = jitterOffsetFor(jit.seed | 0, ((line.id | 0) + 1) * 1000 + bi, jit.maxDx || 0, jit.maxDy || 0);
      }
      const blockMidIdx = (b.start + b.end + 1) / 2;
      const offsetAlongAxis = (blockMidIdx - totalChars / 2) * charAdvance;
      const absX = vertical ? textCX : textCX + offsetAlongAxis;
      const absY = vertical ? textCY + offsetAlongAxis : textCY;
      const blockHalf = (b.end - b.start + 1) * charAdvance / 2;
      const halfX = vertical ? (rawSize / 2) : blockHalf;
      const halfY = vertical ? blockHalf : (rawSize / 2);
      let minDx = margin + halfX - absX;
      let maxDxLim = resW - margin - halfX - absX;
      let minDy = margin + halfY - absY;
      let maxDyLim = resH - margin - halfY - absY;
      if (minDx > maxDxLim) off.dx = (minDx + maxDxLim) / 2;
      else off.dx = Math.max(minDx, Math.min(maxDxLim, off.dx));
      if (minDy > maxDyLim) off.dy = (minDy + maxDyLim) / 2;
      else off.dy = Math.max(minDy, Math.min(maxDyLim, off.dy));
      blockInfos.push({ off, absX, absY, blockHalf });
    });
    // 重なり禁止・順序保持：流れ方向のみ、左（or 上）から順に押し出し
    if (jit && jit.preventOverlap && blockInfos.length > 1) {
      let prevEnd = -Infinity;
      const screenLimit = (vertical ? resH : resW) - margin;
      for (let i = 0; i < blockInfos.length; i++) {
        const info = blockInfos[i];
        const origAlong = vertical ? info.absY : info.absX;
        const jitAlong = vertical ? info.off.dy : info.off.dx;
        let center = origAlong + jitAlong;
        const minCenter = prevEnd + info.blockHalf;
        if (center < minCenter) center = minCenter;
        const maxCenter = screenLimit - info.blockHalf;
        if (center > maxCenter) center = maxCenter;
        if (vertical) info.off.dy = center - info.absY;
        else info.off.dx = center - info.absX;
        prevEnd = center + info.blockHalf;
      }
    }
    blockInfos.forEach(info => {
      blockOffsets.push({ dxCqw: toCqw(info.off.dx), dyCqw: toCqw(info.off.dy) });
    });
  }
  const zabInnerStyles = perBlockZab ? buildZabCss(zab, toCqw) : [];

  // 文字種別ギャップ（アキ設定）：異なる種別の文字間に padding-inline-start で空きを追加
  const interTypeGap = Number(line.interTypeGap) || 0;

  // HTML 組み立て
  let html = "";
  let curBlock = -1;
  let openSpan = false;
  let prevType = null;
  const closeSpan = () => { if (openSpan) { html += "</span>"; openSpan = false; } curBlock = -1; };
  const openBlockSpan = (bi) => {
    const o = blockOffsets[bi];
    const styles = ["display:inline-block"];
    if (jitterOn) styles.push(`transform:translate(${o.dxCqw.toFixed(3)}cqw, ${o.dyCqw.toFixed(3)}cqw)`);
    if (perBlockZab) styles.push(...zabInnerStyles);
    html += `<span style="${styles.join(';')}">`;
    openSpan = true;
    curBlock = bi;
  };
  for (const t of tokens) {
    if (t.type === "br") { closeSpan(); html += "<br>"; prevType = null; continue; }
    if (t.type === "sep") { closeSpan(); prevType = null; continue; }
    if (blockMode) {
      const bi = blockOf[t.charIdx];
      if (bi !== curBlock) { closeSpan(); openBlockSpan(bi); prevType = null; }
    }
    // スペース (半角/全角) の可視化：nbsp / ideographic-space を使って span 化しても崩れない
    const isSpace = (t.ch === " " || t.ch === "　");
    const rawCh = isSpace ? (t.ch === "　" ? "　" : " ") : escapeHtml(t.ch);
    const lv = levels[t.charIdx];
    let chHtml = lv > 0 ? `<span style="color:${EMPHASIS_COLORS[lv] || "#ff5252"}">${rawCh}</span>` : rawCh;
    // 縦組み小書きかな左シフト補正
    if (isVerticalLayout && SMALL_KANA.has(t.ch)) {
      chHtml = `<span style="display:inline-block;transform:translate(-0.04em, 0)">${chHtml}</span>`;
    }
    // 文字種別ギャップ：スペースは判定・prev 更新に含めない（隣接種別の判定を跨がせる）
    if (!isSpace) {
      const curType = classifyChar(t.ch);
      if (interTypeGap > 0 && prevType && curType && prevType !== curType) {
        chHtml = `<span style="padding-inline-start:${interTypeGap}em">${chHtml}</span>`;
      }
      prevType = curType;
    }
    html += chHtml;
  }
  closeSpan();
  return html;
}

// 強調指定のパース：1行 = 1指定、形式 "テキスト:レベル" or "テキスト:レベル:出現回数"
// # で始まる行はコメント、空行はスキップ
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

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
