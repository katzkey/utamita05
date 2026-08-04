// プリセット定義（Phase 1 = 既存プロパティで表現できる範囲）
// 選択すると各行の対応プロパティが上書きされる。個別のプロパティ編集は継続可能。
//
// apply の中の値:
//   fontOverride: { family, size } — 行のフォント上書き
//   zabuton: 座布団オブジェクト（null で座布団オフ）
//   layout: レイアウト（横組み h_bottom / 縦組み vc_center 等）
//
// 「※要 Phase 2」の注記があるものは、光彩・ぼかし・グラデ・斜線・ギザギザ・イタリック等、
// 新エフェクト追加が必要なので Phase 1 では省略 or 近似実装。

export const PRESETS = [
  // ========== 可愛い・ポップ ==========
  {
    id: "pop_iroha_color",
    category: "可愛い・ポップ",
    label: "いろはマル × カラー座布団",
    apply: {
      fontOverride: { family: "irohamaru-Regular", size: 36 },
      layout: "h_bottom",
      zabuton: {
        enabled: true, shape: "round", mode: "fill",
        color: "#FF69B4", opacity: 0.85,
        paddingX: 30, paddingY: 15, cornerRadius: 20,
        timingMode: "follow", fade: 0.3,
        strokeWidth: 2, perBlock: false,
      },
    },
  },
  {
    id: "pop_mplus_color",
    category: "可愛い・ポップ",
    label: "M+ Rounded × カラー座布団",
    apply: {
      fontOverride: { family: "rounded-mplus-1p-medium", size: 36 },
      layout: "h_bottom",
      zabuton: {
        enabled: true, shape: "round", mode: "fill",
        color: "#FFB6C1", opacity: 0.85,
        paddingX: 30, paddingY: 15, cornerRadius: 20,
        timingMode: "follow", fade: 0.3,
        strokeWidth: 2, perBlock: false,
      },
    },
  },
  {
    id: "pop_olive_none",
    category: "可愛い・ポップ",
    label: "Sic オリーブ Dance（座布団なし）",
    apply: {
      fontOverride: { family: "SicOliveDanceR", size: 36 },
      layout: "h_bottom",
      zabuton: null,
    },
  },

  // ========== かっこいい・クール ==========
  {
    id: "cool_sanp_outline",
    category: "かっこいい・クール",
    label: "源ノ角ゴ M × アウトライン",
    apply: {
      fontOverride: { family: "SourceHanSansJP-Medium", size: 36 },
      layout: "h_bottom",
      zabuton: {
        enabled: true, shape: "round", mode: "stroke",
        color: "#FFFFFF", opacity: 1.0,
        paddingX: 30, paddingY: 15, cornerRadius: 12,
        strokeWidth: 3,
        timingMode: "follow", fade: 0.3, perBlock: false,
      },
    },
  },
  {
    id: "cool_mincho_outline",
    category: "かっこいい・クール",
    label: "源ノ明朝 M × アウトライン",
    apply: {
      fontOverride: { family: "SourceHanSerifJP-Medium", size: 36 },
      layout: "h_bottom",
      zabuton: {
        enabled: true, shape: "round", mode: "stroke",
        color: "#FFFFFF", opacity: 1.0,
        paddingX: 30, paddingY: 15, cornerRadius: 12,
        strokeWidth: 3,
        timingMode: "follow", fade: 0.3, perBlock: false,
      },
    },
  },
  {
    id: "cool_senobi_outline",
    category: "かっこいい・クール",
    label: "せのびゴ × アウトライン",
    apply: {
      fontOverride: { family: "Senobi-Gothic-Regular", size: 36 },
      layout: "h_bottom",
      zabuton: {
        enabled: true, shape: "round", mode: "stroke",
        color: "#FFFFFF", opacity: 1.0,
        paddingX: 30, paddingY: 15, cornerRadius: 12,
        strokeWidth: 3,
        timingMode: "follow", fade: 0.3, perBlock: false,
      },
    },
  },

  // ========== 激しい・情熱的 ==========
  // 斜体は Phase 2（AE 側の font style で表現できないため）
  {
    id: "hot_sanp_black",
    category: "激しい・情熱的",
    label: "源ノ角ゴ Heavy × 黒座布団",
    apply: {
      fontOverride: { family: "SourceHanSansJP-Heavy", size: 36 },
      layout: "h_bottom",
      zabuton: {
        enabled: true, shape: "rect", mode: "fill",
        color: "#000000", opacity: 0.7,
        paddingX: 40, paddingY: 20, cornerRadius: 0,
        timingMode: "follow", fade: 0.3,
        strokeWidth: 2, perBlock: false,
      },
    },
  },
  {
    id: "hot_mincho_black",
    category: "激しい・情熱的",
    label: "源ノ明朝 Heavy × 黒座布団",
    apply: {
      fontOverride: { family: "SourceHanSerifJP-Heavy", size: 36 },
      layout: "h_bottom",
      zabuton: {
        enabled: true, shape: "rect", mode: "fill",
        color: "#000000", opacity: 0.7,
        paddingX: 40, paddingY: 20, cornerRadius: 0,
        timingMode: "follow", fade: 0.3,
        strokeWidth: 2, perBlock: false,
      },
    },
  },
  {
    id: "hot_chiaro_black",
    category: "激しい・情熱的",
    label: "FOT-キアロ × 黒座布団",
    apply: {
      fontOverride: { family: "ChiaroStd-B", size: 36 },
      layout: "h_bottom",
      zabuton: {
        enabled: true, shape: "rect", mode: "fill",
        color: "#000000", opacity: 0.7,
        paddingX: 40, paddingY: 20, cornerRadius: 0,
        timingMode: "follow", fade: 0.3,
        strokeWidth: 2, perBlock: false,
      },
    },
  },

  // ========== 切ない・エモい ==========
  // 縦書き 2 列は Phase 1 では単純に縦組み (vc_center) で近似
  {
    id: "emo_shippori_box",
    category: "切ない・エモい",
    label: "しっぽり明朝（代替: 源ノ明朝 SemiBold） × ボックス",
    apply: {
      fontOverride: { family: "SourceHanSerifJP-SemiBold", size: 36 },
      layout: "vc_center",
      zabuton: {
        enabled: true, shape: "rect", mode: "fill",
        color: "#111111", opacity: 0.6,
        paddingX: 24, paddingY: 24, cornerRadius: 0,
        timingMode: "follow", fade: 0.5,
        strokeWidth: 2, perBlock: false,
      },
    },
  },
  {
    id: "emo_mincho_outlinebox",
    category: "切ない・エモい",
    label: "源ノ明朝 Light × アウトラインボックス",
    apply: {
      fontOverride: { family: "SourceHanSerifJP-Light", size: 36 },
      layout: "vc_center",
      zabuton: {
        enabled: true, shape: "rect", mode: "stroke",
        color: "#FFFFFF", opacity: 0.9,
        paddingX: 30, paddingY: 30, cornerRadius: 0,
        strokeWidth: 2,
        timingMode: "follow", fade: 0.5, perBlock: false,
      },
    },
  },
  {
    id: "emo_rehitsu_none",
    category: "切ない・エモい",
    label: "TA-礼筆 M（座布団なし）",
    apply: {
      fontOverride: { family: "TA_rehitsu_m", size: 36 },
      layout: "vc_center",
      zabuton: null,
    },
  },

  // ========== ダーク・妖艶 ==========
  // 筑紫オールド、DNP 秀英にじみ は AE 未搭載のため 源ノ明朝の類似 weight で代替
  {
    id: "dark_tsukushi_box",
    category: "ダーク・妖艶",
    label: "筑紫オールド（代替: 源ノ明朝 ExtraLight） × 色ボックス",
    apply: {
      fontOverride: { family: "SourceHanSerifJP-ExtraLight", size: 36 },
      layout: "h_bottom",
      zabuton: {
        enabled: true, shape: "rect", mode: "fill",
        color: "#4B0000", opacity: 0.85,
        paddingX: 30, paddingY: 18, cornerRadius: 0,
        timingMode: "follow", fade: 0.5,
        strokeWidth: 2, perBlock: false,
      },
    },
  },
  {
    id: "dark_shuei_box",
    category: "ダーク・妖艶",
    label: "DNP 秀英にじみ（代替: 源ノ明朝 Light） × 色ボックス",
    apply: {
      fontOverride: { family: "SourceHanSerifJP-Light", size: 36 },
      layout: "h_bottom",
      zabuton: {
        enabled: true, shape: "rect", mode: "fill",
        color: "#3D0A0A", opacity: 0.85,
        paddingX: 30, paddingY: 18, cornerRadius: 0,
        timingMode: "follow", fade: 0.5,
        strokeWidth: 2, perBlock: false,
      },
    },
  },
  {
    id: "dark_vdl_box",
    category: "ダーク・妖艶",
    label: "VDL G 明朝 × 色ボックス",
    apply: {
      fontOverride: { family: "VDL-GothicMincho-Regular", size: 36 },
      layout: "h_bottom",
      zabuton: {
        enabled: true, shape: "rect", mode: "fill",
        color: "#2B0F1A", opacity: 0.85,
        paddingX: 30, paddingY: 18, cornerRadius: 0,
        timingMode: "follow", fade: 0.5,
        strokeWidth: 2, perBlock: false,
      },
    },
  },
];

// カテゴリごとにグルーピング
export function getPresetsByCategory() {
  const map = new Map();
  for (const p of PRESETS) {
    if (!map.has(p.category)) map.set(p.category, []);
    map.get(p.category).push(p);
  }
  return map;
}

export function getPresetById(id) {
  return PRESETS.find(p => p.id === id) || null;
}
