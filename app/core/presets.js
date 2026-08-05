// プリセット定義（Phase 1）
// フォントと座布団を独立プリセット化。UI では
//   ① フォントプリセットを選ぶ → 該当カテゴリの座布団プリセットが選択可
//   ② 座布団プリセットを選ぶ → zabuton だけ上書き
// PDF の各テイスト（5 カテゴリ）× 3 種を目安に構成。
// 色は PDF に明示無ければテイスト別の代表色をデフォルトに（後で個別編集可）。

// フォントプリセット：font family / size / layout を上書き
export const FONT_PRESETS = [
  // ========== 可愛い・ポップ ==========
  { id: "font_pop_iroha",  category: "可愛い・ポップ", label: "いろはマル",           apply: { fontOverride: { family: "irohamaru-Regular",           size: 36 }, layout: "h_bottom" } },
  { id: "font_pop_mplus",  category: "可愛い・ポップ", label: "M+ Rounded 1p",         apply: { fontOverride: { family: "rounded-mplus-1p-medium",     size: 36 }, layout: "h_bottom" } },
  { id: "font_pop_olive",  category: "可愛い・ポップ", label: "Sic オリーブ Dance",    apply: { fontOverride: { family: "SicOliveDanceR",              size: 36 }, layout: "h_bottom" } },
  // ========== かっこいい・クール ==========
  { id: "font_cool_sanp",  category: "かっこいい・クール", label: "源ノ角ゴ Medium", apply: { fontOverride: { family: "SourceHanSansJP-Medium",  size: 36 }, layout: "h_bottom" } },
  { id: "font_cool_mincho", category: "かっこいい・クール", label: "源ノ明朝 Medium", apply: { fontOverride: { family: "SourceHanSerifJP-Medium", size: 36 }, layout: "h_bottom" } },
  { id: "font_cool_senobi", category: "かっこいい・クール", label: "せのびゴシック",  apply: { fontOverride: { family: "Senobi-Gothic-Regular",   size: 36 }, layout: "h_bottom" } },
  // ========== 激しい・情熱的 ==========
  { id: "font_hot_sanp",   category: "激しい・情熱的", label: "源ノ角ゴ Heavy",  apply: { fontOverride: { family: "SourceHanSansJP-Heavy",  size: 36 }, layout: "h_bottom" } },
  { id: "font_hot_mincho", category: "激しい・情熱的", label: "源ノ明朝 Heavy",  apply: { fontOverride: { family: "SourceHanSerifJP-Heavy", size: 36 }, layout: "h_bottom" } },
  { id: "font_hot_chiaro", category: "激しい・情熱的", label: "FOT-キアロ Std B", apply: { fontOverride: { family: "ChiaroStd-B",             size: 36 }, layout: "h_bottom" } },
  // ========== 切ない・エモい ==========
  { id: "font_emo_shippori", category: "切ない・エモい", label: "しっぽり明朝 SemiBold", apply: { fontOverride: { family: "ShipporiMincho-SemiBold",   size: 36 }, layout: "vc_center" } },
  { id: "font_emo_mincho",   category: "切ない・エモい", label: "源ノ明朝 Light",         apply: { fontOverride: { family: "SourceHanSerifJP-Light",   size: 36 }, layout: "vc_center" } },
  { id: "font_emo_rehitsu",  category: "切ない・エモい", label: "TA-礼筆 M",              apply: { fontOverride: { family: "TA_rehitsu_m",             size: 36 }, layout: "vc_center" } },
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
  {
    id: "zab_pop_color", category: "可愛い・ポップ", label: "カラー座布団（ピンク）",
    apply: { zabuton: { ...ZABUTON_BASE, color: "#FF69B4", opacity: 0.85 } },
  },
  {
    id: "zab_pop_gradient", category: "可愛い・ポップ", label: "カラフルグラデ座布団",
    apply: { zabuton: {
      ...ZABUTON_BASE, color: "#FFB6C1", opacity: 0.85,
      gradient: { enabled: true, angle: 90, colorA: "#FF69B4", colorB: "#FFD54A", colorC: "#4FC3F7" },
    } },
  },
  {
    id: "zab_pop_none", category: "可愛い・ポップ", label: "座布団なし",
    apply: { zabuton: null },
  },

  // ========== かっこいい・クール ==========
  {
    id: "zab_cool_outline", category: "かっこいい・クール", label: "アウトライン",
    apply: { zabuton: {
      ...ZABUTON_BASE, shape: "round", mode: "stroke",
      color: "#FFFFFF", opacity: 1.0, cornerRadius: 12, strokeWidth: 3,
    } },
  },
  {
    id: "zab_cool_gradient", category: "かっこいい・クール", label: "グラデ座布団（青→グレー）",
    apply: { zabuton: {
      ...ZABUTON_BASE, color: "#4A6FA5", opacity: 0.85, cornerRadius: 12,
      gradient: { enabled: true, angle: 90, colorA: "#4A6FA5", colorB: "#B0BEC5", colorC: null },
    } },
  },
  {
    id: "zab_cool_none", category: "かっこいい・クール", label: "座布団なし",
    apply: { zabuton: null },
  },

  // ========== 激しい・情熱的 ==========
  {
    id: "zab_hot_black", category: "激しい・情熱的", label: "黒座布団（半透明）",
    apply: { zabuton: {
      ...ZABUTON_BASE, shape: "rect", color: "#000000", opacity: 0.7, cornerRadius: 0,
    } },
  },
  {
    id: "zab_hot_red", category: "激しい・情熱的", label: "赤座布団",
    apply: { zabuton: {
      ...ZABUTON_BASE, shape: "rect", color: "#B71C1C", opacity: 0.85, cornerRadius: 0,
    } },
  },
  {
    id: "zab_hot_none", category: "激しい・情熱的", label: "座布団なし",
    apply: { zabuton: null },
  },

  // ========== 切ない・エモい ==========
  {
    id: "zab_emo_box", category: "切ない・エモい", label: "塗りボックス（濃紺）",
    apply: { zabuton: {
      ...ZABUTON_BASE, shape: "rect", color: "#111A2E", opacity: 0.6, cornerRadius: 0,
    } },
  },
  {
    id: "zab_emo_outlinebox", category: "切ない・エモい", label: "アウトラインボックス（白）",
    apply: { zabuton: {
      ...ZABUTON_BASE, shape: "rect", mode: "stroke",
      color: "#FFFFFF", opacity: 0.9, cornerRadius: 0, strokeWidth: 2,
    } },
  },
  {
    id: "zab_emo_none", category: "切ない・エモい", label: "座布団なし",
    apply: { zabuton: null },
  },

  // ========== ダーク・妖艶 ==========
  {
    id: "zab_dark_blur", category: "ダーク・妖艶", label: "ぼかし座布団（暗赤）",
    apply: { zabuton: {
      ...ZABUTON_BASE, shape: "rect", color: "#4B0000", opacity: 0.85, cornerRadius: 0,
      blurX: 8, blurY: 8,
    } },
  },
  {
    id: "zab_dark_box", category: "ダーク・妖艶", label: "色ボックス（暗紫）",
    apply: { zabuton: {
      ...ZABUTON_BASE, shape: "rect", color: "#2B0F1A", opacity: 0.9, cornerRadius: 0,
    } },
  },
  {
    id: "zab_dark_none", category: "ダーク・妖艶", label: "座布団なし",
    apply: { zabuton: null },
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
