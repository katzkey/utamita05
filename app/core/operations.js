// プロジェクトに対する全ての編集操作。
// 全て純関数：元の project は変更せず、新しい project を返す。

import {
  now, indexOfId, findById,
  insertAt, removeAt, moveItem, replaceAt,
  syncChars, splitChars,
} from "./utils.js";

import {
  createLine, createBackground, createTitle, createTemplateRef,
  defaultZabuton, defaultJitter,
  PROJECT_VERSION,
} from "./project.js";
import { getPresetById, getFontPresetById, getZabutonPresetById } from "./presets.js";

// ──────────────────────────────────────────────────
// 内部ヘルパー
// ──────────────────────────────────────────────────

function touch(project, patch = {}) {
  return { ...project, ...patch, updatedAt: now() };
}

function updateLine(project, id, updater) {
  const idx = indexOfId(project.lines, id);
  if (idx < 0) return project;
  const newLine = updater(project.lines[idx]);
  return touch(project, {
    lines: replaceAt(project.lines, idx, newLine),
  });
}

function updateBackground(project, id, updater) {
  const idx = indexOfId(project.backgrounds, id);
  if (idx < 0) return project;
  const newBg = updater(project.backgrounds[idx]);
  return touch(project, {
    backgrounds: replaceAt(project.backgrounds, idx, newBg),
  });
}

function updateTitle(project, id, updater) {
  const idx = indexOfId(project.titles || [], id);
  if (idx < 0) return project;
  const newT = updater(project.titles[idx]);
  return touch(project, {
    titles: replaceAt(project.titles, idx, newT),
  });
}

function updateChar(project, lineId, charIdx, updater) {
  return updateLine(project, lineId, (line) => {
    if (charIdx < 0 || charIdx >= line.chars.length) return line;
    return { ...line, chars: replaceAt(line.chars, charIdx, updater(line.chars[charIdx])) };
  });
}

// ──────────────────────────────────────────────────
// プロジェクト全体
// ──────────────────────────────────────────────────

export function setFps(project, fps) {
  return touch(project, { fps });
}

export function setResolution(project, w, h) {
  return touch(project, { resolution: { w, h } });
}

export function setMusic(project, file, duration) {
  return touch(project, { music: { file, duration: duration ?? project.music.duration } });
}

export function setProjectFont(project, fontPartial) {
  return touch(project, { font: { ...project.font, ...fontPartial } });
}

export function setName(project, name) {
  return touch(project, { name });
}

// ──────────────────────────────────────────────────
// 行
// ──────────────────────────────────────────────────

export function addLine(project, opts = {}) {
  const id = project.nextLineId;
  // template は opts で明示されたものだけ反映。
  // 指定なしなら createLine が emptyLineTemplate（全null=継承）で初期化する。
  const newLine = createLine(id, {
    ...opts,
    layout: opts.layout || project.defaults.layout,
  });
  let lines;
  if (opts.afterId != null) {
    const afterIdx = indexOfId(project.lines, opts.afterId);
    lines = afterIdx < 0
      ? [...project.lines, newLine]
      : insertAt(project.lines, afterIdx + 1, newLine);
  } else if (opts.beforeId != null) {
    const beforeIdx = indexOfId(project.lines, opts.beforeId);
    lines = beforeIdx < 0
      ? [...project.lines, newLine]
      : insertAt(project.lines, beforeIdx, newLine);
  } else if (opts.atIndex != null) {
    lines = insertAt(project.lines, opts.atIndex, newLine);
  } else {
    lines = [...project.lines, newLine];
  }
  return touch(project, { lines, nextLineId: id + 1 });
}

export function removeLine(project, id) {
  const idx = indexOfId(project.lines, id);
  if (idx < 0) return project;
  return touch(project, { lines: removeAt(project.lines, idx) });
}

export function setLineText(project, id, text) {
  return updateLine(project, id, (line) => ({
    ...line,
    text,
    chars: syncChars(text, line.chars),
  }));
}

export function setLineIn(project, id, tIn) {
  return updateLine(project, id, (line) => ({ ...line, tIn }));
}

export function setLineOut(project, id, tOut) {
  return updateLine(project, id, (line) => ({ ...line, tOut }));
}

export function setLineSkip(project, id, skip) {
  return updateLine(project, id, (line) => ({ ...line, skip: !!skip }));
}

export function setLineLayout(project, id, layout) {
  return updateLine(project, id, (line) => ({ ...line, layout }));
}

// layerMode: "char" / "line" / null（継承）
export function setLineLayerMode(project, id, mode) {
  const v = (mode === "char" || mode === "line") ? mode : null;
  return updateLine(project, id, (line) => ({ ...line, layerMode: v }));
}

export function setLinePos(project, id, posPartial) {
  return updateLine(project, id, (line) => ({ ...line, pos: { ...line.pos, ...posPartial } }));
}

export function setLineNote(project, id, note) {
  return updateLine(project, id, (line) => ({ ...line, note }));
}

// 文字ごとの開始ずらし秒数（0 で同時）
export function setLineStagger(project, id, stagger) {
  const s = Math.max(0, Number(stagger) || 0);
  return updateLine(project, id, (line) => ({ ...line, stagger: s }));
}

// カーニング調整（負で詰め、正で開く。単位は char モード内の ratio に加算）
export function setLineTracking(project, id, tracking) {
  const t = Number(tracking);
  const val = isNaN(t) ? 0 : t;
  return updateLine(project, id, (line) => ({ ...line, tracking: val }));
}

// この行の設定を全体に反映（1 履歴 = 1 Undo）
// - フォント（override があれば）→ project.font
// - layout / layerMode / 固定テンプレ → project.defaults
// - tracking / stagger / zabuton → 全行にコピー
// 反映後、この行の fontOverride はクリア（デフォルト継承と同値になるため）
export function applyLineSettingsToProject(project, id) {
  const idx = indexOfId(project.lines, id);
  if (idx < 0) return project;
  const line = project.lines[idx];

  // 1) project.font
  const font = { ...project.font };
  if (line.fontOverride?.family) font.family = line.fontOverride.family;
  if (typeof line.fontOverride?.size === "number") font.size = line.fontOverride.size;

  // 2) defaults
  const defaults = {
    ...project.defaults,
    layout: line.layout || project.defaults.layout,
    layerMode: line.layerMode ?? project.defaults.layerMode,
    template: { ...project.defaults.template },
  };
  for (const slot of ["entry", "hold", "exit", "design"]) {
    if (line.template[slot] != null) defaults.template[slot] = line.template[slot];
  }

  // 3) 全行へコピー（tracking / stagger / zabuton / jitter / pos(dx,dy,scale,rot) / layout）
  const zabutonCopy = line.zabuton ? JSON.parse(JSON.stringify(line.zabuton)) : null;
  const jitterCopy = line.jitter ? JSON.parse(JSON.stringify(line.jitter)) : null;
  const posCopy = { ...(line.pos || { dx: 0, dy: 0, scale: 1.0, rot: 0 }) };
  const lines = project.lines.map(l => {
    const next = {
      ...l,
      tracking: line.tracking ?? 0,
      stagger: line.stagger ?? 0,
      zabuton: zabutonCopy ? JSON.parse(JSON.stringify(zabutonCopy)) : null,
      jitter: jitterCopy ? JSON.parse(JSON.stringify(jitterCopy)) : null,
      pos: { ...posCopy },
      layout: line.layout || l.layout,
    };
    // すべての行の fontOverride をクリア（project.font に統一）
    const { fontOverride, ...rest } = next;
    return rest;
  });

  return touch(project, { font, defaults, lines });
}

// 座布団：partial をマージ。null を渡すと削除
export function setLineZabuton(project, id, partial) {
  return updateLine(project, id, (line) => {
    if (partial === null) {
      const { zabuton, ...rest } = line;
      return { ...rest, zabuton: null };
    }
    const base = line.zabuton || defaultZabuton();
    return { ...line, zabuton: { ...base, ...partial } };
  });
}

// フォントプリセット適用：font / size / layout を上書き。zabuton は触らない。
export function applyFontPresetToLine(project, id, presetId) {
  const preset = getFontPresetById(presetId);
  if (!preset) return project;
  return updateLine(project, id, (line) => {
    const next = { ...line, fontPresetId: presetId };
    if (preset.apply.fontOverride) next.fontOverride = { ...preset.apply.fontOverride };
    if (preset.apply.layout) next.layout = preset.apply.layout;
    return next;
  });
}

// 座布団プリセット適用：zabuton だけ上書き（null で座布団オフ）
export function applyZabutonPresetToLine(project, id, presetId) {
  const preset = getZabutonPresetById(presetId);
  if (!preset) return project;
  return updateLine(project, id, (line) => {
    const next = { ...line, zabutonPresetId: presetId };
    if (Object.prototype.hasOwnProperty.call(preset.apply, "zabuton")) {
      next.zabuton = preset.apply.zabuton
        ? JSON.parse(JSON.stringify(preset.apply.zabuton))
        : null;
    }
    return next;
  });
}

// 旧 API 互換
export function applyPresetToLine(project, id, presetId) {
  return applyFontPresetToLine(project, id, presetId);
}

// ジッター：partial をマージ。null を渡すと削除
export function setLineJitter(project, id, partial) {
  return updateLine(project, id, (line) => {
    if (partial === null) {
      const { jitter, ...rest } = line;
      return { ...rest, jitter: null };
    }
    const base = line.jitter || defaultJitter();
    return { ...line, jitter: { ...base, ...partial } };
  });
}

// fontPartial の各キー：
//   値 = 有効値 → 設定
//   値 = null / "" → そのキーだけ削除（他は保持）
//   空オブジェクト {} → fontOverride 全体を削除
export function setLineFont(project, id, fontPartial) {
  return updateLine(project, id, (line) => {
    if (!fontPartial || Object.keys(fontPartial).length === 0) {
      const { fontOverride, ...rest } = line;
      return rest;
    }
    const current = { ...(line.fontOverride || {}) };
    for (const [k, v] of Object.entries(fontPartial)) {
      if (v == null || v === "") delete current[k];
      else current[k] = v;
    }
    if (Object.keys(current).length === 0) {
      const { fontOverride, ...rest } = line;
      return rest;
    }
    return { ...line, fontOverride: current };
  });
}

// templateName に null を渡すと「プロジェクト継承」になる
export function setLineTemplate(project, id, slot, templateName) {
  if (!["entry", "hold", "exit", "design"].includes(slot)) {
    throw new Error(`Invalid slot: ${slot}`);
  }
  return updateLine(project, id, (line) => ({
    ...line,
    template: { ...line.template, [slot]: templateName },
  }));
}

// 行の特定スロットを「継承」状態に戻す
export function inheritLineTemplate(project, id, slot) {
  return setLineTemplate(project, id, slot, null);
}

export function setLineEmphasis(project, id, specs) {
  return updateLine(project, id, (line) => ({ ...line, emphasis: specs }));
}

export function setLineGroups(project, id, specs) {
  return updateLine(project, id, (line) => ({ ...line, groups: specs }));
}

// 行分割：charIndex の位置で2行に。
export function splitLine(project, id, charIndex) {
  const idx = indexOfId(project.lines, id);
  if (idx < 0) return project;
  const line = project.lines[idx];
  const chars = splitChars(line.text);
  if (charIndex <= 0 || charIndex >= chars.length) return project;

  const text1 = chars.slice(0, charIndex).join("");
  const text2 = chars.slice(charIndex).join("");

  // TC を文字数比例で分配
  let tIn1 = line.tIn;
  let tOut1 = null;
  let tIn2 = null;
  let tOut2 = line.tOut;
  if (line.tIn != null && line.tOut != null) {
    const ratio = charIndex / chars.length;
    const splitTime = line.tIn + (line.tOut - line.tIn) * ratio;
    tOut1 = splitTime;
    tIn2 = splitTime;
  }

  const newLine1 = { ...line, text: text1, chars: syncChars(text1, line.chars.slice(0, charIndex)), tIn: tIn1, tOut: tOut1 };
  const newId = project.nextLineId;
  const newLine2 = createLine(newId, {
    text: text2,
    tIn: tIn2,
    tOut: tOut2,
    template: { ...line.template },
    layout: line.layout,
    fontOverride: line.fontOverride ? { ...line.fontOverride } : undefined,
  });
  newLine2.chars = syncChars(text2, line.chars.slice(charIndex));

  const lines = replaceAt(project.lines, idx, newLine1);
  const linesWithNew = insertAt(lines, idx + 1, newLine2);
  return touch(project, { lines: linesWithNew, nextLineId: newId + 1 });
}

// 行マージ：id1 に id2 をくっつける（id2 削除）
export function mergeLines(project, id1, id2) {
  const idx1 = indexOfId(project.lines, id1);
  const idx2 = indexOfId(project.lines, id2);
  if (idx1 < 0 || idx2 < 0 || idx1 === idx2) return project;
  const line1 = project.lines[idx1];
  const line2 = project.lines[idx2];
  const merged = {
    ...line1,
    text: line1.text + line2.text,
    tIn: line1.tIn ?? line2.tIn,
    tOut: line2.tOut ?? line1.tOut,
    chars: syncChars(line1.text + line2.text, [...line1.chars, ...line2.chars]),
  };
  // id2 の削除と line1 の置換
  const without2 = removeAt(project.lines, idx2);
  const adjustedIdx1 = idx2 < idx1 ? idx1 - 1 : idx1;
  const lines = replaceAt(without2, adjustedIdx1, merged);
  return touch(project, { lines });
}

// 行の順序を変える
export function moveLine(project, id, direction) {
  const idx = indexOfId(project.lines, id);
  if (idx < 0) return project;
  let toIdx;
  if (direction === "up") toIdx = Math.max(0, idx - 1);
  else if (direction === "down") toIdx = Math.min(project.lines.length - 1, idx + 1);
  else if (direction === "top") toIdx = 0;
  else if (direction === "bottom") toIdx = project.lines.length - 1;
  else if (typeof direction === "number") toIdx = direction;
  else return project;
  return touch(project, { lines: moveItem(project.lines, idx, toIdx) });
}

// 行の順序を一括で
export function reorderLines(project, newOrderIds) {
  const map = new Map(project.lines.map(l => [l.id, l]));
  const newLines = newOrderIds.map(id => map.get(id)).filter(Boolean);
  if (newLines.length !== project.lines.length) return project;
  return touch(project, { lines: newLines });
}

// ──────────────────────────────────────────────────
// 文字（Char）
// ──────────────────────────────────────────────────

export function overrideCharTemplate(project, lineId, charIdx, slot, name) {
  if (!["entry", "hold", "exit", "design"].includes(slot)) {
    throw new Error(`Invalid slot: ${slot}`);
  }
  const key = "override" + slot[0].toUpperCase() + slot.slice(1);
  return updateChar(project, lineId, charIdx, (c) => ({ ...c, [key]: name }));
}

export function clearCharOverride(project, lineId, charIdx) {
  return updateChar(project, lineId, charIdx, (c) => {
    const { overrideEntry, overrideHold, overrideExit, overrideDesign, ...rest } = c;
    return rest;
  });
}

export function setCharTime(project, lineId, charIdx, tIn, tOut) {
  return updateChar(project, lineId, charIdx, (c) => ({ ...c, tIn, tOut }));
}

export function clearCharTime(project, lineId, charIdx) {
  return updateChar(project, lineId, charIdx, (c) => {
    const { tIn, tOut, ...rest } = c;
    return rest;
  });
}

export function setCharEmphasis(project, lineId, charIdx, level) {
  return updateChar(project, lineId, charIdx, (c) => ({ ...c, emphasisLevel: level }));
}

export function setCharFont(project, lineId, charIdx, fontPartial) {
  return updateChar(project, lineId, charIdx, (c) => {
    if (!fontPartial || (fontPartial.family === undefined && fontPartial.size === undefined)) {
      const { overrideFont, ...rest } = c;
      return rest;
    }
    return { ...c, overrideFont: { ...(c.overrideFont || {}), ...fontPartial } };
  });
}

// ──────────────────────────────────────────────────
// 背景
// ──────────────────────────────────────────────────

export function addBackground(project, opts = {}) {
  const id = project.nextBgId;
  const bg = createBackground(id, opts);
  return touch(project, {
    backgrounds: [...project.backgrounds, bg],
    nextBgId: id + 1,
  });
}

export function removeBackground(project, id) {
  const idx = indexOfId(project.backgrounds, id);
  if (idx < 0) return project;
  return touch(project, { backgrounds: removeAt(project.backgrounds, idx) });
}

export function setBackgroundFile(project, id, file) {
  // file をセットすると solidColor は解除
  return updateBackground(project, id, b => ({ ...b, file, solidColor: null }));
}

export function setBackgroundSolid(project, id, hex) {
  // solidColor をセットすると file は無視される
  return updateBackground(project, id, b => ({ ...b, solidColor: hex || "#000000" }));
}

export function setBackgroundIn(project, id, tIn) {
  return updateBackground(project, id, b => ({ ...b, tIn }));
}

export function setBackgroundOut(project, id, tOut) {
  return updateBackground(project, id, b => ({ ...b, tOut }));
}

export function setBackgroundFade(project, id, fadeIn, fadeOut) {
  return updateBackground(project, id, b => ({
    ...b,
    fadeIn: fadeIn ?? b.fadeIn,
    fadeOut: fadeOut ?? b.fadeOut,
  }));
}

export function setBackgroundFit(project, id, fit) {
  return updateBackground(project, id, b => ({ ...b, fit }));
}

export function setBackgroundOpacity(project, id, opacity) {
  return updateBackground(project, id, b => ({ ...b, opacity }));
}

export function setBackgroundBlend(project, id, blend) {
  return updateBackground(project, id, b => ({ ...b, blend }));
}

export function setBackgroundNote(project, id, note) {
  return updateBackground(project, id, b => ({ ...b, note }));
}

// ──────────────────────────────────────────────────
// タイトル
// ──────────────────────────────────────────────────

export function addTitle(project, opts = {}) {
  const id = project.nextTitleId;
  const title = createTitle(id, opts);
  const titles = [...(project.titles || []), title];
  return touch(project, { titles, nextTitleId: id + 1 });
}

export function removeTitle(project, id) {
  const idx = indexOfId(project.titles || [], id);
  if (idx < 0) return project;
  return touch(project, { titles: removeAt(project.titles, idx) });
}

export function setTitleText(project, id, text) {
  return updateTitle(project, id, t => ({ ...t, text }));
}
export function setTitleSubtext(project, id, subtext) {
  return updateTitle(project, id, t => ({ ...t, subtext }));
}
export function setTitleIn(project, id, tIn) {
  return updateTitle(project, id, t => ({ ...t, tIn }));
}
export function setTitleOut(project, id, tOut) {
  return updateTitle(project, id, t => ({ ...t, tOut }));
}
export function setTitleFade(project, id, fadeIn, fadeOut) {
  return updateTitle(project, id, t => ({
    ...t,
    fadeIn: fadeIn ?? t.fadeIn,
    fadeOut: fadeOut ?? t.fadeOut,
  }));
}
export function setTitleFont(project, id, fontPartial) {
  return updateTitle(project, id, t => ({ ...t, font: { ...t.font, ...fontPartial } }));
}
export function setTitleLayout(project, id, layout) {
  return updateTitle(project, id, t => ({ ...t, layout }));
}
export function setTitleColor(project, id, color) {
  return updateTitle(project, id, t => ({ ...t, color }));
}
export function setTitleSubColor(project, id, subColor) {
  return updateTitle(project, id, t => ({ ...t, subColor }));
}
export function setTitleFile(project, id, file) {
  return updateTitle(project, id, t => ({ ...t, file }));
}
export function setTitleFit(project, id, fit) {
  return updateTitle(project, id, t => ({ ...t, fit }));
}
export function setTitleOpacity(project, id, opacity) {
  return updateTitle(project, id, t => ({ ...t, opacity }));
}
export function setTitleTemplate(project, id, name) {
  return updateTitle(project, id, t => ({ ...t, template: name || null }));
}

// ──────────────────────────────────────────────────
// テンプレート参照
// ──────────────────────────────────────────────────

export function registerTemplate(project, refOpts) {
  const ref = createTemplateRef(refOpts);
  const exists = project.templates.some(t => t.name === ref.name);
  if (exists) {
    // 同名は上書き
    return touch(project, {
      templates: project.templates.map(t => t.name === ref.name ? ref : t),
    });
  }
  return touch(project, { templates: [...project.templates, ref] });
}

export function unregisterTemplate(project, name) {
  return touch(project, {
    templates: project.templates.filter(t => t.name !== name),
  });
}

// ──────────────────────────────────────────────────
// デフォルト値
// ──────────────────────────────────────────────────

export function setDefaultTemplate(project, slot, name) {
  if (!["entry", "hold", "exit", "design"].includes(slot)) {
    throw new Error(`Invalid slot: ${slot}`);
  }
  return touch(project, {
    defaults: { ...project.defaults, template: { ...project.defaults.template, [slot]: name } },
  });
}

export function setDefaultLayout(project, layout) {
  return touch(project, {
    defaults: { ...project.defaults, layout },
  });
}

export function setDefaultLayerMode(project, mode) {
  const v = (mode === "char" || mode === "line") ? mode : "char";
  return touch(project, {
    defaults: { ...project.defaults, layerMode: v },
  });
}

// ──────────────────────────────────────────────────
// 一括操作
// ──────────────────────────────────────────────────

// lyrics.txt の取込：空行をスキップして1行=1行に
// opts.spacing が指定されたら、各行のtInをそれずつ加算（最初は0）
// opts.replaceExisting=true なら既存行を全削除してから取込
export function loadLyricsTxt(project, text, opts = {}) {
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines
    .map(s => s.trim())
    .filter(s => s.length > 0);

  let p = project;
  if (opts.replaceExisting) {
    // 全行削除
    const ids = p.lines.map(l => l.id);
    for (const id of ids) p = removeLine(p, id);
  }

  const spacing = opts.spacing; // 秒、未指定なら null
  for (let i = 0; i < lines.length; i++) {
    const startBase = opts.replaceExisting ? 0 : p.lines.length;
    const tIn = spacing != null ? (startBase + i) * spacing : null;
    const tOut = spacing != null ? (startBase + i + 1) * spacing : null;
    p = addLine(p, { text: lines[i], tIn, tOut });
  }
  return p;
}

// 全行に強制適用（固定する）
export function applyTemplateToAll(project, slot, name) {
  if (!["entry", "hold", "exit", "design"].includes(slot)) {
    throw new Error(`Invalid slot: ${slot}`);
  }
  return touch(project, {
    lines: project.lines.map(l => ({ ...l, template: { ...l.template, [slot]: name } })),
  });
}

// 全行の特定スロットを「継承」に戻す（固定解除）
export function inheritTemplateAll(project, slot) {
  if (!["entry", "hold", "exit", "design"].includes(slot)) {
    throw new Error(`Invalid slot: ${slot}`);
  }
  return touch(project, {
    lines: project.lines.map(l => ({ ...l, template: { ...l.template, [slot]: null } })),
  });
}
