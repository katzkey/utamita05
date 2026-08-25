// プロジェクトの整合性チェック
// validate(project) → { ok, errors, warnings }

import { splitChars } from "./utils.js?v=60b30cb";

export function validate(project) {
  const errors = [];
  const warnings = [];

  // バージョン
  if (!project.version) errors.push("version フィールドがありません");

  // resolution
  if (!project.resolution || !project.resolution.w || !project.resolution.h) {
    errors.push("resolution が不正");
  }

  // 行
  if (!Array.isArray(project.lines)) {
    errors.push("lines が配列ではない");
  } else {
    const seenIds = new Set();
    project.lines.forEach((line, idx) => {
      // ID 重複
      if (seenIds.has(line.id)) errors.push(`行 #${idx}: ID ${line.id} が重複`);
      seenIds.add(line.id);

      // tIn ≤ tOut
      if (line.tIn != null && line.tOut != null && line.tIn > line.tOut) {
        errors.push(`行 #${idx} (id=${line.id}): tIn (${line.tIn}) > tOut (${line.tOut})`);
      }

      // chars の長さ
      const expectedChars = splitChars(line.text);
      if (line.chars && line.chars.length !== expectedChars.length) {
        warnings.push(`行 #${idx} (id=${line.id}): chars 長 (${line.chars.length}) が text の文字数 (${expectedChars.length}) と一致しない`);
      }

      // テンプレ名が project.templates に登録されているか
      ["entry", "hold", "exit", "design"].forEach(slot => {
        const name = line.template?.[slot];
        if (name && !project.templates.some(t => t.name === name)) {
          warnings.push(`行 #${idx} (id=${line.id}): ${slot} テンプレ '${name}' が未登録`);
        }
      });

      // 強調レベル範囲
      if (line.chars) {
        line.chars.forEach((c, ci) => {
          if (c.emphasisLevel != null && (c.emphasisLevel < 0 || c.emphasisLevel > 3)) {
            warnings.push(`行 #${idx} 文字 #${ci}: emphasisLevel ${c.emphasisLevel} は 0-3 推奨`);
          }
        });
      }
    });

    // 行の重なり（警告レベル）
    for (let i = 0; i < project.lines.length - 1; i++) {
      const a = project.lines[i];
      const b = project.lines[i + 1];
      if (a.tOut != null && b.tIn != null && a.tOut > b.tIn) {
        warnings.push(`行 ${a.id} と ${b.id}: 時間が重なっている (${a.tOut} > ${b.tIn})`);
      }
    }
  }

  // 背景
  if (Array.isArray(project.backgrounds)) {
    const seenBgIds = new Set();
    project.backgrounds.forEach((bg, idx) => {
      if (seenBgIds.has(bg.id)) errors.push(`背景 #${idx}: ID ${bg.id} が重複`);
      seenBgIds.add(bg.id);
      if (bg.tIn > bg.tOut) {
        errors.push(`背景 #${idx} (id=${bg.id}): tIn > tOut`);
      }
      if (bg.opacity < 0 || bg.opacity > 1) {
        warnings.push(`背景 #${idx} (id=${bg.id}): opacity ${bg.opacity} は 0-1 推奨`);
      }
    });
  }

  // テンプレート参照
  if (Array.isArray(project.templates)) {
    const seenNames = new Set();
    project.templates.forEach((t, idx) => {
      if (seenNames.has(t.name)) errors.push(`テンプレ #${idx}: 名前 '${t.name}' が重複`);
      seenNames.add(t.name);
      if (!["entry", "hold", "exit", "design"].includes(t.slot)) {
        errors.push(`テンプレ '${t.name}': slot '${t.slot}' は無効`);
      }
    });
  }

  // フォント
  if (!project.font || !project.font.family) {
    warnings.push("プロジェクトのフォントが未設定");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
