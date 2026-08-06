// プリセット定義（Phase 1）
// フォントと座布団を独立プリセット化。UI では
//   ① フォントプリセットを選ぶ → 該当カテゴリの座布団プリセットが選択可
//   ② 座布団プリセットを選ぶ → zabuton だけ上書き
// PDF の各テイスト（5 カテゴリ）× 3 種を目安に構成。
// 色は PDF に明示無ければテイスト別の代表色をデフォルトに（後で個別編集可）。

// フォントプリセット：font family / size / layout を上書き
export const FONT_PRESETS = [
  // ========== 可愛い・ポップ ==========
  { id: "font_pop_iroha",  category: "可愛い・ポップ", label: "いろはマル",           apply: { fontOverride: { family: "irohamaru-Regular",           size: 36 }, layout: "h_bottom", tracking: 0.05, interTypeGap: 0.12 } },
  { id: "font_pop_mplus",  category: "可愛い・ポップ", label: "M+ Rounded 1p",         apply: { fontOverride: { family: "rounded-mplus-1p-medium",     size: 36 }, layout: "h_bottom", tracking: 0.05, interTypeGap: 0.12 } },
  { id: "font_pop_olive",  category: "可愛い・ポップ", label: "Sic オリーブ Dance",    apply: { fontOverride: { family: "SicOliveDanceR",              size: 36 }, layout: "h_bottom", tracking: 0.05, interTypeGap: 0.12 } },
  // ========== かっこいい・クール ==========
  { id: "font_cool_sanp",  category: "かっこいい・クール", label: "源ノ角ゴ Medium", apply: { fontOverride: { family: "SourceHanSansJP-Medium",  size: 36 }, layout: "h_bottom" } },
  { id: "font_cool_mincho", category: "かっこいい・クール", label: "源ノ明朝 Medium", apply: { fontOverride: { family: "SourceHanSerifJP-Medium", size: 36 }, layout: "h_bottom" } },
  { id: "font_cool_senobi", category: "かっこいい・クール", label: "せのびゴシック",  apply: { fontOverride: { family: "Senobi-Gothic-Regular",   size: 36 }, layout: "h_bottom" } },
  // ========== 激しい・情熱的 ==========
  { id: "font_hot_sanp",   category: "激しい・情熱的", label: "源ノ角ゴ Heavy（斜体）",  apply: { fontOverride: { family: "SourceHanSansJP-Heavy",  size: 36, italic: true }, layout: "h_bottom" } },
  { id: "font_hot_mincho", category: "激しい・情熱的", label: "源ノ明朝 Heavy（斜体）",  apply: { fontOverride: { family: "SourceHanSerifJP-Heavy", size: 36, italic: true }, layout: "h_bottom" } },
  { id: "font_hot_chiaro", category: "激しい・情熱的", label: "FOT-キアロ Std B（斜体）", apply: { fontOverride: { family: "ChiaroStd-B",             size: 36, italic: true }, layout: "h_bottom" } },
  // ========== 切ない・エモい ==========
  { id: "font_emo_shippori", category: "切ない・エモい", label: "しっぽり明朝 SemiBold", apply: { fontOverride: { family: "ShipporiMincho-SemiBold",   size: 36 }, layout: "vr_center" } },
  { id: "font_emo_mincho",   category: "切ない・エモい", label: "源ノ明朝 Light",         apply: { fontOverride: { family: "SourceHanSerifJP-Light",   size: 36 }, layout: "vr_center" } },
  { id: "font_emo_rehitsu",  category: "切ない・エモい", label: "TA-礼筆 M",              apply: { fontOverride: { family: "TA_rehitsu_m",             size: 36 }, layout: "vr_center" } },
  // ========== ダーク・妖艶 ==========
  { id: "font_dark_tsukushi", category: "ダーク・妖艶", label: "FOT-筑紫Aオールド明朝 Pr6N L", apply: { fontOverride: { family: "TsukuAOldMinPr6N-L",       size: 36 }, layout: "h_bottom" } },
  { id: "font_dark_shuei",    category: "ダーク・妖艶", label: "DNP 秀英にじみ明朝 Std L",     apply: { fontOverride: { family: "DNPShueiNMinStd-L",        size: 36 }, layout: "h_bottom" } },
  { id: "font_dark_vdl",      category: "ダーク・妖艶", label: "VDL G 明朝 R",                 apply: { fontOverride: { family: "VDL-GothicMincho-Regular", size: 36 }, layout: "h_bottom" } },
];

// 座布団プリセット：line.zabuton を上書き（null で座布団なし）
// カテゴリ毎に 3 種（PDF に沿う。実装未対応の 光彩・斜線・ギザギザ・ライン はここでは無しに）
const ZABUTON_BASE = {
  enabled: true, shape: "round", mode: "fill",
  paddingX: 0, paddingY: 0, cornerRadius: 20,
  timingMode: "follow", fade: 0.3,
  strokeWidth: 2, perBlock: false,
  blurX: 0, blurY: 0, gradient: null,
};

export const ZABUTON_PRESETS = [
  // ========== 可愛い・ポップ ==========
  // PDF: 光彩 / カラー座布団 / カラフルグラデーション座布団（色は PDF ピクセル実測）
  {
    id: "zab_pop_glow", category: "可愛い・ポップ", label: "光彩（マゼンタ）",
    apply: {
      zabuton: null,
      glow: { enabled: true, color: "#B620AD", opacity: 1.0, blur: 3 },
      textColor: "#FFFFFF",
    },
  },
  {
    id: "zab_pop_color", category: "可愛い・ポップ", label: "カラー座布団（マゼンタ）",
    apply: {
      zabuton: {
        ...ZABUTON_BASE, shape: "round", cornerRadius: 24,
        color: "#A448AB", opacity: 0.85,
        paddingX: 30, paddingY: 10,
      },
      glow: null,
      textColor: "#FFFFFF",
    },
  },
  {
    id: "zab_pop_gradient", category: "可愛い・ポップ", label: "カラフルグラデ座布団（アクア→ピンク）",
    apply: {
      zabuton: {
        ...ZABUTON_BASE, shape: "round", cornerRadius: 24,
        color: "#A0E3DF", opacity: 0.85,
        paddingX: 30, paddingY: 10,
        gradient: { enabled: true, angle: 90, colorA: "#A0E3DF", colorB: "#B0D8E4", colorC: "#E5B5D5" },
      },
      glow: null,
      textColor: "#000000",
    },
  },

  // ========== かっこいい・クール ==========
  // PDF: アウトライン / 斜線座布団 / カラー座布団 (グラデ)
  {
    id: "zab_cool_outline", category: "かっこいい・クール", label: "アウトライン（青）",
    apply: {
      zabuton: {
        ...ZABUTON_BASE, shape: "rect", mode: "stroke",
        color: "#0000FF", opacity: 1.0, cornerRadius: 0, strokeWidth: 2,
        paddingX: 20, paddingY: 8,
      },
      glow: null, textColor: "#FFFFFF",
    },
  },
  {
    id: "zab_cool_diag", category: "かっこいい・クール", label: "斜線座布団（近似：ダーク box）",
    apply: {
      zabuton: {
        ...ZABUTON_BASE, shape: "rect", color: "#111619", opacity: 0.9,
        cornerRadius: 0, paddingX: 24, paddingY: 10,
      },
      glow: null, textColor: "#FFFFFF",
    },
  },
  {
    id: "zab_cool_gradient", category: "かっこいい・クール", label: "カラー座布団（ブルーグラデ）",
    apply: {
      zabuton: {
        ...ZABUTON_BASE, shape: "rect", color: "#0000E1", opacity: 0.95, cornerRadius: 0,
        paddingX: 40, paddingY: 12,
        gradient: { enabled: true, angle: 90, colorA: "#003BE1", colorB: "#0060FF", colorC: null },
      },
      glow: null, textColor: "#FFFFFF",
    },
  },

  // ========== 激しい・情熱的 ==========
  // PDF: 黒座布団(乗算70%) / ギザギザ / ライン
  {
    id: "zab_hot_black", category: "激しい・情熱的", label: "黒座布団（70%）",
    apply: {
      zabuton: {
        ...ZABUTON_BASE, shape: "rect", color: "#000000", opacity: 0.7,
        cornerRadius: 0, paddingX: 30, paddingY: 10,
      },
      glow: null, textColor: "#FFFFFF",
    },
  },
  {
    id: "zab_hot_jagged", category: "激しい・情熱的", label: "ギザギザ（近似：白ボックス）",
    apply: {
      zabuton: {
        ...ZABUTON_BASE, shape: "rect", color: "#F5EEDF", opacity: 0.98,
        cornerRadius: 0, paddingX: 30, paddingY: 10,
      },
      glow: null, textColor: "#000000",
    },
  },
  {
    id: "zab_hot_line", category: "激しい・情熱的", label: "ライン（近似：座布団なし）",
    apply: { zabuton: null, glow: null, textColor: "#FFFFFF" },
  },

  // ========== 切ない・エモい ==========
  // PDF: 縦組み右列 x 2、ボックス / アウトラインボックス / ライン
  // ※ layout は font preset 側で vr_center に指定
  {
    id: "zab_emo_box", category: "切ない・エモい", label: "白ボックス（黒テキスト）",
    apply: {
      zabuton: {
        ...ZABUTON_BASE, shape: "rect", color: "#F8F5EE", opacity: 0.95,
        cornerRadius: 0, paddingX: 12, paddingY: 20,
      },
      glow: null, textColor: "#000000",
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
      glow: null, textColor: "#FFFFFF",
    },
  },
  {
    id: "zab_emo_line", category: "切ない・エモい", label: "ライン（近似：座布団なし）",
    apply: { zabuton: null, glow: null, textColor: "#FFFFFF" },
  },

  // ========== ダーク・妖艶 ==========
  // PDF: ぼかし座布団(白+ blur, 黒テキスト) / ライン / 色ボックス(アクア)
  {
    id: "zab_dark_blur", category: "ダーク・妖艶", label: "ぼかし座布団（白+ぼかし、黒テキスト）",
    apply: {
      zabuton: {
        ...ZABUTON_BASE, shape: "rect", color: "#F5EEDF", opacity: 0.90,
        cornerRadius: 0, paddingX: 40, paddingY: 12,
        blurX: 12, blurY: 6,
      },
      glow: null, textColor: "#000000",
    },
  },
  {
    id: "zab_dark_line", category: "ダーク・妖艶", label: "ライン（近似：座布団なし）",
    apply: { zabuton: null, glow: null, textColor: "#FFFFFF" },
  },
  {
    id: "zab_dark_box", category: "ダーク・妖艶", label: "色ボックス（アクア）",
    apply: {
      zabuton: {
        ...ZABUTON_BASE, shape: "rect", color: "#7DD9C7", opacity: 0.85,
        cornerRadius: 0, paddingX: 30, paddingY: 10,
      },
      glow: null, textColor: "#000000",
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

export function getFontPresetById(id) {
  return FONT_PRESETS.find(p => p.id === id) || null;
}

export function getZabutonPresetById(id) {
  return ZABUTON_PRESETS.find(p => p.id === id) || null;
}

// 互換：旧 API を新プリセットから見つける
export function getPresetsByCategory() {
  return getFontPresetsByCategory();
}
export function getPresetById(id) {
  return getFontPresetById(id) || getZabutonPresetById(id);
}
export const PRESETS = FONT_PRESETS;
