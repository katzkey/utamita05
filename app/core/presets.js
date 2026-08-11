// プリセット定義（Phase 1）
// フォントと座布団を独立プリセット化。UI では
//   ① フォントプリセットを選ぶ → 該当カテゴリの座布団プリセットが選択可
//   ② 座布団プリセットを選ぶ → zabuton だけ上書き
// PDF の各テイスト（5 カテゴリ）× 3 種を目安に構成。
// 色は PDF に明示無ければテイスト別の代表色をデフォルトに（後で個別編集可）。

// フォントプリセット：font family / size / layout を上書き
export const FONT_PRESETS = [
  // ========== 可愛い・ポップ ==========
  { id: "font_pop_iroha",  category: "可愛い・ポップ", label: "いろはマル",           apply: { fontOverride: { family: "irohamaru-Regular",           size: 28 }, layout: "h_bottom", tracking: 0.05, autoKerning: true } },
  { id: "font_pop_mplus",  category: "可愛い・ポップ", label: "M+ Rounded 1p",         apply: { fontOverride: { family: "rounded-mplus-1p-medium",     size: 28 }, layout: "h_bottom", tracking: 0.05, autoKerning: true } },
  { id: "font_pop_olive",  category: "可愛い・ポップ", label: "Sic オリーブ Dance",    apply: { fontOverride: { family: "SicOliveDanceR",              size: 28 }, layout: "h_bottom", tracking: 0.05, autoKerning: true } },
  // ========== かっこいい・クール ==========
  { id: "font_cool_sanp",  category: "かっこいい・クール", label: "源ノ角ゴ Medium", apply: { fontOverride: { family: "SourceHanSansJP-Medium",  size: 28 }, layout: "h_bottom", autoKerning: true } },
  { id: "font_cool_mincho", category: "かっこいい・クール", label: "源ノ明朝 Medium", apply: { fontOverride: { family: "SourceHanSerifJP-Medium", size: 28 }, layout: "h_bottom", autoKerning: true } },
  { id: "font_cool_senobi", category: "かっこいい・クール", label: "せのびゴシック",  apply: { fontOverride: { family: "Senobi-Gothic-Regular",   size: 28 }, layout: "h_bottom", autoKerning: true } },
  // ========== 激しい・情熱的 ==========
  { id: "font_hot_sanp",   category: "激しい・情熱的", label: "源ノ角ゴ Heavy（斜体）",  apply: { fontOverride: { family: "SourceHanSansJP-Heavy",  size: 28, italic: true }, layout: "h_bottom", autoKerning: true } },
  { id: "font_hot_mincho", category: "激しい・情熱的", label: "源ノ明朝 Heavy（斜体）",  apply: { fontOverride: { family: "SourceHanSerifJP-Heavy", size: 28, italic: true }, layout: "h_bottom", autoKerning: true } },
  { id: "font_hot_chiaro", category: "激しい・情熱的", label: "FOT-キアロ Std B（斜体）", apply: { fontOverride: { family: "ChiaroStd-B",             size: 28, italic: true }, layout: "h_bottom", autoKerning: true } },
  // ========== 切ない・エモい ==========
  { id: "font_emo_shippori", category: "切ない・エモい", label: "しっぽり明朝 SemiBold", apply: { fontOverride: { family: "ShipporiMincho-SemiBold",   size: 28 }, layout: "vr_center", autoKerning: true } },
  { id: "font_emo_mincho",   category: "切ない・エモい", label: "源ノ明朝 Light",         apply: { fontOverride: { family: "SourceHanSerifJP-Light",   size: 28 }, layout: "vr_center", autoKerning: true } },
  { id: "font_emo_rehitsu",  category: "切ない・エモい", label: "TA-礼筆 M",              apply: { fontOverride: { family: "TA_rehitsu_m",             size: 28 }, layout: "vr_center", autoKerning: true } },
  // ========== ダーク・妖艶 ==========
  { id: "font_dark_tsukushi", category: "ダーク・妖艶", label: "FOT-筑紫Aオールド明朝 Pr6N L", apply: { fontOverride: { family: "TsukuAOldMinPr6N-L",       size: 28 }, layout: "h_bottom", autoKerning: true } },
  { id: "font_dark_shuei",    category: "ダーク・妖艶", label: "DNP 秀英にじみ明朝 Std L",     apply: { fontOverride: { family: "DNPShueiNMinStd-L",        size: 28 }, layout: "h_bottom", autoKerning: true } },
  { id: "font_dark_vdl",      category: "ダーク・妖艶", label: "VDL G 明朝 R",                 apply: { fontOverride: { family: "VDL-GothicMincho-Regular", size: 28 }, layout: "h_bottom", autoKerning: true } },
];

// 座布団プリセット：line.zabuton を上書き（null で座布団なし）
// カテゴリ毎に 3 種（PDF に沿う。実装未対応の 光彩・斜線・ギザギザ・ライン はここでは無しに）
const ZABUTON_BASE = {
  enabled: true, shape: "round", mode: "fill",
  paddingX: 0, paddingY: 0, cornerRadius: 20,
  timingMode: "follow", fade: 0.3,
  strokeWidth: 2, perBlock: false,
  blurX: 0, blurY: 0, gradient: null, pattern: null, edge: null,
};

// 各 preset は zabuton / glow / textColor / textStroke を明示的に設定。
// (未設定だと前 preset の値が残るので、すべての preset で 4 フィールド触る)
export const ZABUTON_PRESETS = [
  // ========== 可愛い・ポップ ==========
  // PDF: 光彩 / カラー座布団 / カラフルグラデーション座布団（色は PDF ピクセル実測）
  // 01 可愛い・ポップ  ─ PDF 実測ベース
  {
    id: "zab_pop_glow", category: "可愛い・ポップ", label: "光彩（マゼンタ）",
    apply: {
      zabuton: null,
      glow: { enabled: true, color: "#B620AD", opacity: 1.0, blur: 3 },
      textColor: "#FFFFFF", textStroke: null,
    },
  },
  {
    id: "zab_pop_color", category: "可愛い・ポップ", label: "カラー座布団（マゼンタ）",
    apply: {
      zabuton: {
        ...ZABUTON_BASE, shape: "round", cornerRadius: 24,
        color: "#802080", opacity: 0.9, paddingX: 30, paddingY: 10,
      },
      glow: null, textColor: "#FFFFFF", textStroke: null,
    },
  },
  {
    id: "zab_pop_gradient", category: "可愛い・ポップ", label: "カラフルグラデ座布団（アクア→ピンク）",
    apply: {
      zabuton: {
        ...ZABUTON_BASE, shape: "rect", cornerRadius: 0,
        color: "#9ADEE3", opacity: 0.9, paddingX: 30, paddingY: 10,
        // PDF 実測（x=0.35/0.55/0.65）: アクア → ラベンダー → ピンク
        gradient: { enabled: true, angle: 90, colorA: "#9ADEE3", colorB: "#C8BCE0", colorC: "#DFACD3" },
      },
      glow: null, textColor: "#000000", textStroke: null,
    },
  },

  // 02 かっこいい・クール  ─ PDF 実測ベース
  {
    id: "zab_cool_outline", category: "かっこいい・クール", label: "アウトライン（青い縁取り）",
    apply: {
      zabuton: null, glow: null,
      textColor: "#FFFFFF",
      textStroke: { color: "#0000E0", width: 3 },
    },
  },
  {
    id: "zab_cool_diag", category: "かっこいい・クール", label: "斜線座布団（ブルーストライプ）",
    apply: {
      zabuton: {
        // PDF 実測: 線間 (27,60,87) / 帯外背景 (41,89,129) → 比 0.67 = 黒 33% の下地
        // 斜線は純黒、向きは "\"（CSS 45deg）、細かいピッチ
        ...ZABUTON_BASE, shape: "rect", color: "#000000", opacity: 0.33,
        cornerRadius: 0, paddingX: 30, paddingY: 12,
        pattern: { type: "stripe", color: "#000000", angle: 45, size: 1.5, gap: 3.5 },
      },
      glow: null, textColor: "#FFFFFF", textStroke: null, underline: null,
    },
  },
  {
    id: "zab_cool_gradient", category: "かっこいい・クール", label: "カラー座布団（ブルーグラデ）",
    apply: {
      zabuton: {
        // PDF 実測 (4,10,217) → #0208D9
        ...ZABUTON_BASE, shape: "rect", color: "#0208D9", opacity: 0.95, cornerRadius: 0,
        paddingX: 80, paddingY: 12,
        blurX: 80, blurY: 0,
        gradient: null,
      },
      glow: null, textColor: "#FFFFFF", textStroke: null,
    },
  },

  // 03 激しい・情熱的  ─ 全て斜体（font preset 側で italic:true）
  {
    id: "zab_hot_black", category: "激しい・情熱的", label: "黒座布団（70%）",
    apply: {
      zabuton: {
        ...ZABUTON_BASE, shape: "rect", color: "#000000", opacity: 0.7,
        cornerRadius: 0, paddingX: 30, paddingY: 10,
      },
      glow: null, textColor: "#FFFFFF", textStroke: null,
    },
  },
  {
    id: "zab_hot_jagged", category: "激しい・情熱的", label: "ギザギザ（破れ紙エッジ）",
    apply: {
      zabuton: {
        // PDF 実測 (216,209,204) を暗い背景(46,17,0)から逆算 → 白 80%（クリームではない）
        // ちぎれ幅は帯高の 4〜5%、ピッチ約 4px の細かいギザ
        ...ZABUTON_BASE, shape: "rect", color: "#FFFFFF", opacity: 0.80,
        cornerRadius: 0, paddingX: 30, paddingY: 14,
        // 歯の大きさは AE px 指定。行の長さで詰まったり間延びしたりしない。
        // 種は行ごとに混ぜるので、同じ形の切り抜きが並ぶこともない。
        edge: { type: "torn", pitch: 6, depth: 7, seed: 7 },
      },
      glow: null, textColor: "#000000", textStroke: null,
    },
  },
  {
    id: "zab_hot_line", category: "激しい・情熱的", label: "ライン（白下線）",
    apply: {
      zabuton: null, glow: null,
      textColor: "#FFFFFF", textStroke: null,
      underline: { enabled: true, style: "solid", color: "#FFFFFF", width: 2, offset: 6 },
    },
  },

  // 04 切ない・エモい  ─ 縦組み右列（font preset 側で layout:vr_center）
  {
    id: "zab_emo_box", category: "切ない・エモい", label: "白ボックス（黒テキスト）",
    apply: {
      zabuton: {
        ...ZABUTON_BASE, shape: "rect", color: "#E8E8E8", opacity: 0.95,
        cornerRadius: 0, paddingX: 14, paddingY: 22,
      },
      glow: null, textColor: "#000000", textStroke: null,
    },
  },
  {
    id: "zab_emo_outlinebox", category: "切ない・エモい", label: "アウトラインボックス（白）",
    apply: {
      zabuton: {
        ...ZABUTON_BASE, shape: "rect", mode: "stroke",
        color: "#FFFFFF", opacity: 0.95, cornerRadius: 0, strokeWidth: 2,
        paddingX: 16, paddingY: 24,
      },
      glow: null, textColor: "#FFFFFF", textStroke: null,
    },
  },
  {
    id: "zab_emo_line", category: "切ない・エモい", label: "ライン（縦組み上下ブラケット・カスレ）",
    apply: {
      zabuton: null, glow: null,
      textColor: "#FFFFFF", textStroke: null,
      underline: {
        enabled: true, style: "brackets", texture: "scratchy",
        color: "#FFFFFF", width: 2, offset: 14, extend: 8, warp: 2.5,
      },
    },
  },

  // 05 ダーク・妖艶  ─ 明るい box + 黒テキストが基調
  {
    id: "zab_dark_blur", category: "ダーク・妖艶", label: "ぼかし座布団（明るい box + 黒テキスト）",
    apply: {
      zabuton: {
        ...ZABUTON_BASE, shape: "rect", color: "#DDE8F0", opacity: 0.9,
        cornerRadius: 0, paddingX: 40, paddingY: 12,
        blurX: 12, blurY: 6,
      },
      glow: null, textColor: "#000000", textStroke: null,
    },
  },
  {
    id: "zab_dark_line", category: "ダーク・妖艶", label: "ライン（アクア細線）",
    apply: {
      zabuton: null, glow: null,
      textColor: "#FFFFFF", textStroke: null,
      underline: { enabled: true, style: "solid", color: "#00A0EF", width: 2, offset: 8 },
    },
  },
  {
    id: "zab_dark_box", category: "ダーク・妖艶", label: "色ボックス（アクア→淡→アクア グラデ）",
    apply: {
      zabuton: {
        // PDF 実測（x=0.35/0.55/0.65）: #56D4D9 → #C6E9F8 → #59EDDE。
        // 明るいアクア系で、テキストは黒。以前の「紺→アクア→紺・白文字」は誤り。
        ...ZABUTON_BASE, shape: "rect", color: "#56D4D9", opacity: 0.95,
        cornerRadius: 0, paddingX: 30, paddingY: 10,
        gradient: { enabled: true, angle: 90, colorA: "#56D4D9", colorB: "#C6E9F8", colorC: "#59EDDE" },
      },
      glow: null, textColor: "#000000", textStroke: null,
    },
  },
];

// ---- ヘルパー ----

export function getFontPresetsByCategory() {
  const map = new Map();
  for (const p of FONT_PRESETS) {
    if (!map.has(p.category)) map.set(p.category, []);
    map.get(p.category).push(p);
  }
  return map;
}

export function getZabutonPresetsByCategory(category) {
  return ZABUTON_PRESETS.filter(p => p.category === category);
}

// ---- カスタムプリセット（作業者が保存したもの）のレジストリ ----
// 実体の保存は core/custom_presets.js（localStorage）。ここは参照用の置き場。
let CUSTOM_ZABUTON = [];
export function setCustomZabutonPresets(list) { CUSTOM_ZABUTON = Array.isArray(list) ? list : []; }
export function getCustomZabutonPresets() { return CUSTOM_ZABUTON; }

// 全カテゴリの座布団プリセットを Map<category, preset[]> で返す（カスタムは末尾）
export function getAllZabutonPresetsByCategory() {
  const map = new Map();
  for (const p of ZABUTON_PRESETS.concat(CUSTOM_ZABUTON)) {
    if (!map.has(p.category)) map.set(p.category, []);
    map.get(p.category).push(p);
  }
  return map;
}

export function getFontPresetById(id) {
  return FONT_PRESETS.find(p => p.id === id) || null;
}

export function getZabutonPresetById(id) {
  return ZABUTON_PRESETS.find(p => p.id === id)
      || CUSTOM_ZABUTON.find(p => p.id === id)
      || null;
}

// 互換：旧 API を新プリセットから見つける
export function getPresetsByCategory() {
  return getFontPresetsByCategory();
}
export function getPresetById(id) {
  return getFontPresetById(id) || getZabutonPresetById(id);
}
export const PRESETS = FONT_PRESETS;
