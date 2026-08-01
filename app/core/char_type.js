// 文字種判定ユーティリティ
// - 縦組みでの小書きかな位置補正
// - 文字種別カーニング（将来）
// - その他文字種別のスタイル分岐

// 小書きかな（ぁぃぅぇぉっゃゅょ 等）
// 縦組みで em ボックスの右上寄りに配置される慣習があるが、AE の per-char レイヤでは
// 中央に置かれるだけなので視覚的に左下に寄って見える。右にオフセットする必要がある。
export const SMALL_KANA = new Set(
  "ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ".split("")
);

// 縦組みで 90° 回転すべき文字（長音、括弧類、ダッシュ、記号など）
export const ROTATE_IN_VERTICAL = new Set(
  "ー〜～－‐―…‥＝=（）()「」『』【】［］[]｛｝{}〈〉《》＜＞<>".split("")
);

// 文字種分類
// 戻り値: "ascii" | "hiragana" | "katakana" | "kanji" | "small_kana" | "punct" | "digit" | "other"
export function classifyChar(c) {
  if (!c) return "other";
  const cp = c.codePointAt(0);
  if (SMALL_KANA.has(c)) return "small_kana";
  // ASCII 数字
  if (cp >= 0x30 && cp <= 0x39) return "digit";
  // 全角数字
  if (cp >= 0xFF10 && cp <= 0xFF19) return "digit";
  // ASCII 英字 + 記号
  if (cp >= 0x21 && cp <= 0x7E) {
    if ((cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A)) return "ascii";
    return "punct";
  }
  // ひらがな U+3040–U+309F
  if (cp >= 0x3040 && cp <= 0x309F) return "hiragana";
  // カタカナ U+30A0–U+30FF
  if (cp >= 0x30A0 && cp <= 0x30FF) return "katakana";
  // 半角カナ U+FF66–U+FF9F
  if (cp >= 0xFF66 && cp <= 0xFF9F) return "katakana";
  // 全角英字 U+FF21-U+FF5A
  if ((cp >= 0xFF21 && cp <= 0xFF3A) || (cp >= 0xFF41 && cp <= 0xFF5A)) return "ascii";
  // CJK 統合漢字
  if (cp >= 0x4E00 && cp <= 0x9FFF) return "kanji";
  if (cp >= 0x3400 && cp <= 0x4DBF) return "kanji";  // 拡張A
  if (cp >= 0x20000 && cp <= 0x2A6DF) return "kanji"; // 拡張B
  // 句読点系
  if ("、。，．！？「」『』（）：；・".indexOf(c) >= 0) return "punct";
  return "other";
}

export function isSmallKana(c) {
  return SMALL_KANA.has(c);
}

export function isRotateInVertical(c) {
  return ROTATE_IN_VERTICAL.has(c);
}
