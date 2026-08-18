// プロジェクトの型と初期値、JSON 変換
// 純粋関数のみ。

import { now, syncChars, deepClone } from "./utils.js?v=fb28877";
import { defaultMotion } from "./motion.js?v=fb28877";

// emptyLineTemplate を内部で先行参照するため宣言だけ前置（実体は下で）
// （JS は関数宣言を巻き上げるので問題なし）

export const PROJECT_VERSION = "1";

// --- デフォルト値 ---

export function defaultFont() {
  return {
    family: "Yu Mincho Demibold",
    fallback: ["Hiragino Mincho ProN", "Source Han Serif"],
    size: 48,
  };
}

export function defaultPos() {
  return { dx: 0, dy: 0, scale: 1.0, rot: 0 };
}

// ジッター（行内の単語ブロック単位でランダム位置オフセット）
// text 内の "/" でブロックを区切る。"/" が無ければ行全体 = 1 ブロック。
// seed 固定なので同じ設定なら毎回同じオフセットになる。
export function defaultJitter() {
  return {
    enabled: false,
    seed: 42,
    maxDx: 20, // px
    maxDy: 20, // px
    preventOverlap: false, // true: 重なり禁止 + 歌詞順を維持（流れ方向に押し出し）
  };
}

// 座布団（行単位のパラメトリック背景）
export function defaultZabuton() {
  return {
    enabled: true,
    shape: "round",       // "rect" | "round" | "pill" | "circle"
    color: "#000000",
    opacity: 0.5,
    paddingX: 0,          // 文字ボックスからの余白（AE px）デフォルトは文字ぴったり
    paddingY: 0,
    cornerRadius: 16,     // round のとき
    timingMode: "follow", // "follow": 文字に親付け / "static": 独立フェード
    fade: 0.3,            // static のフェード秒（in/out 共通）
    mode: "fill",         // "fill": 塗り / "stroke": 枠だけ
    strokeWidth: 2,       // stroke のときの線の太さ（AE px）
    perBlock: false,      // true: ジッター区切り "/" ごとに敷く / false: 行全体で 1 個
    blurX: 0,             // 座布団のエッジぼかし量 X 方向（AE px）0 = ぼかさない
    blurY: 0,             // 座布団のエッジぼかし量 Y 方向（AE px）
    gradient: null,       // グラデーション設定 or null。定義時：{ enabled, angle, colorA, colorB, colorC (省略可) }
    pattern: null,        // 斜線等のパターン塗り or null。{ type:"stripe", color, angle, size, gap } 形式
    edge: null,           // 縁の装飾 or null。{ type:"torn", pitch(歯の間隔 AE px), depth(歯の深さ AE px), seed }
  };
}

// 光彩（テキストのグロー効果、座布団とは別）
export function defaultGlow() {
  return {
    enabled: true,
    color: "#FF69B4",
    opacity: 0.9,
    blur: 20,   // px
  };
}

// グラデーションのデフォルト
export function defaultGradient() {
  return {
    enabled: true,
    angle: 90,        // 度（0=右, 90=下, 180=左, 270=上）
    colorA: "#FF69B4",
    colorB: "#FFD54A",
    colorC: null,     // 3 色目、null なら 2 色グラデ
  };
}

// プロジェクト全体のデフォルトテンプレ（実体名）
export function defaultTemplate() {
  return {
    entry: "_entry_fade_in",
    hold: "_hold_static",
    exit: "_exit_fade_out",
    design: "_design_white_mincho",
  };
}

// 新規行のテンプレ初期値（全 null = プロジェクトデフォルトを継承）
export function emptyLineTemplate() {
  return { entry: null, hold: null, exit: null, design: null };
}

// 行のテンプレ実効値を解決：null なら project.defaults を使う
export function resolveLineTemplate(line, project) {
  return {
    entry:  line.template.entry  ?? project.defaults.template.entry,
    hold:   line.template.hold   ?? project.defaults.template.hold,
    exit:   line.template.exit   ?? project.defaults.template.exit,
    design: line.template.design ?? project.defaults.template.design,
  };
}

// 各スロットが「固定」されているか（=非null）
export function isLineTemplateFixed(line, slot) {
  return line.template[slot] != null;
}

// 行の layerMode 実効値（line.layerMode が null ならプロジェクトデフォルト）
export function resolveLineLayerMode(line, project) {
  return line.layerMode ?? project.defaults.layerMode ?? "char";
}

// --- ファクトリ関数 ---

export function createEmptyProject(meta = {}) {
  const t = now();
  return {
    version: PROJECT_VERSION,
    name: meta.name || "新規プロジェクト",
    createdAt: t,
    updatedAt: t,
    fps: meta.fps || 30,
    resolution: meta.resolution || { w: 1920, h: 1080 },
    music: meta.music || { file: "", duration: 0 },
    font: meta.font || defaultFont(),
    lines: [],
    nextLineId: 0,
    backgrounds: [],
    nextBgId: 0,
    titles: [],
    nextTitleId: 0,
    templates: meta.templates || defaultTemplateRefs(),
    defaults: {
      template: defaultTemplate(),
      layout: "h_bottom",
      layerMode: "char",  // "char": 1文字=1レイヤ / "line": 1行=1レイヤ
    },
  };
}

export function createLine(id, opts = {}) {
  const text = opts.text || "";
  return {
    id,
    text,
    tIn: opts.tIn ?? null,
    tOut: opts.tOut ?? null,
    template: opts.template || emptyLineTemplate(),  // 全 null = プロジェクト継承
    fontOverride: opts.fontOverride || undefined,
    chars: syncChars(text, []),
    layout: opts.layout || "h_bottom",
    layerMode: opts.layerMode ?? null,  // null = プロジェクトデフォルト継承
    pos: opts.pos || defaultPos(),
    presetId: opts.presetId ?? null,             // 旧 API 互換
    fontPresetId: opts.fontPresetId ?? null,     // フォントプリセット ID
    zabutonPresetId: opts.zabutonPresetId ?? null, // 座布団プリセット ID
    customPresetId: opts.customPresetId ?? null,   // カスタムプリセット ID（文字＋配置＋装飾）
    emphasis: opts.emphasis || [],
    groups: opts.groups || [],
    stagger: opts.stagger ?? 0,  // 文字ごとの開始ずらし秒数（0 = 同時）
    tracking: opts.tracking ?? 0, // カーニング調整（負で詰め、正で開く）
    interTypeGap: opts.interTypeGap ?? 0, // 文字種別ギャップ（em）手動時のみ使用
    autoKerning: opts.autoKerning ?? false, // true で組版ルールによる自動カーニング（和文↔欧文のみ 0.25em）
    textColor: opts.textColor ?? null,    // テキスト色 (null = 既定 = 白)
    textStroke: opts.textStroke ?? null,  // 文字の縁取り { color, width } / null で無し
    zabuton: opts.zabuton ?? null, // null = 無し / defaultZabuton() 形式のオブジェクト
    // 下線（ライン）。null = 無し
    // { enabled, style:"solid"|"brackets", color, width(px), offset(px), extend(px),
    //   texture:"scratchy"|null, pitch(px), wobble(px), rough(0-1), seed }
    underline: opts.underline ?? null,
    glow: opts.glow ?? null,       // テキストの光彩（グロー）。null = なし / { enabled, color, opacity, blur }
    jitter: opts.jitter ?? null,   // null = 無し / defaultJitter() 形式のオブジェクト
    motion: opts.motion ?? defaultMotion(),  // 出入りの動き（フェード/スライド/スケール）
    skip: opts.skip || false,
    note: opts.note || "",
  };
}

export function createTitle(id, opts = {}) {
  return {
    id,
    text: opts.text || "",
    subtext: opts.subtext || "",
    tIn: opts.tIn ?? null,
    tOut: opts.tOut ?? null,
    fadeIn: opts.fadeIn ?? 0.5,
    fadeOut: opts.fadeOut ?? 0.5,
    font: opts.font || { family: "Yu Mincho Demibold", size: 96, subSize: 36 },
    layout: opts.layout || "h_center",
    color: opts.color || "#FFFFFF",
    subColor: opts.subColor || "#CADCFC",
    file: opts.file || "",     // 素材（画像/動画）のパス、空文字なら無し
    fit: opts.fit || "cover",  // 素材のフィット方法
    opacity: opts.opacity ?? 1.0,
    template: opts.template || null, // タイトルエフェクトテンプレ名（"_title_xxx"）、null = 従来の素材+テキスト配置
    note: opts.note || "",
  };
}

export function createBackground(id, opts = {}) {
  return {
    id,
    file: opts.file || "",
    solidColor: opts.solidColor || null, // 非null なら単色レイヤとして扱う（file は無視）
    tIn: opts.tIn ?? 0,
    tOut: opts.tOut ?? 0,
    fadeIn: opts.fadeIn ?? 0,
    fadeOut: opts.fadeOut ?? 0,
    fit: opts.fit || "cover",
    opacity: opts.opacity ?? 1.0,
    blend: opts.blend || "normal",
    note: opts.note || "",
  };
}

export function createTemplateRef(opts) {
  return {
    name: opts.name,
    slot: opts.slot, // "entry" | "hold" | "exit" | "design"
    displayName: opts.displayName || opts.name,
    tags: opts.tags || [],
  };
}

// 最初に登録しておくサンプルテンプレ参照
export function defaultTemplateRefs() {
  return [
    createTemplateRef({ name: "_entry_fade_in",       slot: "entry",  displayName: "フェードイン" }),
    createTemplateRef({ name: "_entry_slide_up",      slot: "entry",  displayName: "下からスライド" }),
    createTemplateRef({ name: "_hold_static",         slot: "hold",   displayName: "静止" }),
    createTemplateRef({ name: "_hold_wave",           slot: "hold",   displayName: "上下に揺れ" }),
    createTemplateRef({ name: "_exit_fade_out",       slot: "exit",   displayName: "フェードアウト" }),
    createTemplateRef({ name: "_exit_slide_down",     slot: "exit",   displayName: "下にスライド" }),
    createTemplateRef({ name: "_design_white_mincho", slot: "design", displayName: "白明朝＋グロー" }),
    createTemplateRef({ name: "_design_pop_color",    slot: "design", displayName: "ポップカラー" }),
  ];
}

// --- JSON シリアライズ ---

export function toJSON(project, pretty = true) {
  return JSON.stringify(project, null, pretty ? 2 : 0);
}

export function fromJSON(jsonString) {
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch (e) {
    throw new Error("JSON のパースに失敗: " + e.message);
  }
  return upgradeProject(data);
}

// バージョン違いを吸収（将来のために枠だけ用意）
export function upgradeProject(data) {
  if (!data.version) {
    throw new Error("プロジェクト形式の version フィールドが無い");
  }
  if (data.version === PROJECT_VERSION) {
    return data;
  }
  // 将来：旧バージョン → 現バージョンへの変換
  throw new Error(`未対応のバージョン: ${data.version}`);
}

// --- ID 払い出し ---

export function nextLineId(project) {
  return project.nextLineId;
}

export function nextBgId(project) {
  return project.nextBgId;
}

// --- 簡易クローン ---

export function clone(project) {
  return deepClone(project);
}
