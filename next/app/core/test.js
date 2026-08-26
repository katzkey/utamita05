// Phase 0 純粋ロジックのテスト
// ブラウザで test.html を開くと自動実行

import {
  createEmptyProject, fromJSON, toJSON, defaultTemplate,
} from "./project.js?v=89939f4";
import * as ops from "./operations.js?v=89939f4";
import { validate } from "./validate.js?v=89939f4";
import { splitChars } from "./utils.js?v=89939f4";

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function eq(a, b, msg) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg || ""}\n  期待: ${sb}\n  実際: ${sa}`);
}
function ok(cond, msg) { if (!cond) throw new Error(msg || "Assertion failed"); }

// ──────────────────────────────────────────────────
// プロジェクト作成
// ──────────────────────────────────────────────────

test("createEmptyProject: 空のプロジェクトが作れる", () => {
  const p = createEmptyProject({ name: "test" });
  eq(p.name, "test");
  eq(p.lines, []);
  eq(p.backgrounds, []);
  ok(p.templates.length > 0, "テンプレ参照が初期登録されている");
  eq(p.nextLineId, 0);
});

test("純関数: 元の project は変更されない", () => {
  const p1 = createEmptyProject();
  const p2 = ops.addLine(p1, { text: "テスト" });
  eq(p1.lines.length, 0, "元の project に変更が及ばない");
  eq(p2.lines.length, 1);
  ok(p1 !== p2, "別オブジェクト");
});

// ──────────────────────────────────────────────────
// 行の追加・削除
// ──────────────────────────────────────────────────

test("addLine: 末尾に追加", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "1行目" });
  p = ops.addLine(p, { text: "2行目" });
  eq(p.lines.length, 2);
  eq(p.lines[0].id, 0);
  eq(p.lines[1].id, 1);
  eq(p.nextLineId, 2);
});

test("addLine: afterId で挿入", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "A" });
  p = ops.addLine(p, { text: "B" });
  p = ops.addLine(p, { text: "C", afterId: 0 });  // A の直後に挿入
  eq(p.lines.map(l => l.text), ["A", "C", "B"]);
  eq(p.lines.map(l => l.id), [0, 2, 1]);
});

test("removeLine: 削除しても他の行のIDは不変", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "A" });
  p = ops.addLine(p, { text: "B" });
  p = ops.addLine(p, { text: "C" });
  p = ops.removeLine(p, 1);
  eq(p.lines.map(l => l.id), [0, 2]);
  eq(p.lines.map(l => l.text), ["A", "C"]);
  eq(p.nextLineId, 3, "削除しても nextLineId は減らない");
  // 次に追加されるのは id=3
  p = ops.addLine(p, { text: "D" });
  eq(p.lines.map(l => l.id), [0, 2, 3]);
});

// ──────────────────────────────────────────────────
// 行の属性編集
// ──────────────────────────────────────────────────

test("setLineText: text を変更すると chars も同期", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "あいう" });
  eq(p.lines[0].chars.length, 3);
  p = ops.setLineText(p, 0, "あいうえお");
  eq(p.lines[0].chars.length, 5);
  eq(p.lines[0].chars.map(c => c.ch), ["あ", "い", "う", "え", "お"]);
});

test("setLineIn / setLineOut", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "テスト" });
  p = ops.setLineIn(p, 0, 21.5);
  p = ops.setLineOut(p, 0, 27.3);
  eq(p.lines[0].tIn, 21.5);
  eq(p.lines[0].tOut, 27.3);
});

test("setLineTemplate: スロット個別更新（他スロットは null のまま継承）", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "x" });
  // 初期は全 null（継承）
  eq(p.lines[0].template.entry, null);
  eq(p.lines[0].template.hold, null);
  p = ops.setLineTemplate(p, 0, "entry", "_entry_pop");
  eq(p.lines[0].template.entry, "_entry_pop");
  eq(p.lines[0].template.hold, null, "他スロットは null のまま");
});

test("inheritLineTemplate: 固定値を null に戻す", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "x" });
  p = ops.setLineTemplate(p, 0, "entry", "_entry_custom");
  eq(p.lines[0].template.entry, "_entry_custom");
  p = ops.inheritLineTemplate(p, 0, "entry");
  eq(p.lines[0].template.entry, null);
});

test("inheritTemplateAll: 全行の特定スロットを継承に", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "A" });
  p = ops.addLine(p, { text: "B" });
  p = ops.applyTemplateToAll(p, "entry", "_entry_x");
  eq(p.lines[0].template.entry, "_entry_x");
  p = ops.inheritTemplateAll(p, "entry");
  eq(p.lines[0].template.entry, null);
  eq(p.lines[1].template.entry, null);
});

test("setLineFont: フォント上書き", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "x" });
  p = ops.setLineFont(p, 0, { family: "M PLUS" });
  eq(p.lines[0].fontOverride, { family: "M PLUS" });
  // size も上書き
  p = ops.setLineFont(p, 0, { size: 72 });
  eq(p.lines[0].fontOverride, { family: "M PLUS", size: 72 });
  // クリア
  p = ops.setLineFont(p, 0, {});
  ok(p.lines[0].fontOverride === undefined, "クリアで undefined に");
});

// ──────────────────────────────────────────────────
// splitLine / mergeLines
// ──────────────────────────────────────────────────

test("splitLine: 文字位置で2行に", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "あいうえお", tIn: 0, tOut: 10 });
  p = ops.splitLine(p, 0, 2);
  eq(p.lines.length, 2);
  eq(p.lines[0].text, "あい");
  eq(p.lines[1].text, "うえお");
  eq(p.lines[0].tIn, 0);
  eq(p.lines[0].tOut, 4);   // 2/5 * 10
  eq(p.lines[1].tIn, 4);
  eq(p.lines[1].tOut, 10);
});

test("mergeLines: 2行を1行に", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "ABC", tIn: 0, tOut: 3 });
  p = ops.addLine(p, { text: "DEF", tIn: 4, tOut: 7 });
  p = ops.mergeLines(p, 0, 1);
  eq(p.lines.length, 1);
  eq(p.lines[0].text, "ABCDEF");
  eq(p.lines[0].tIn, 0);
  eq(p.lines[0].tOut, 7);
});

// ──────────────────────────────────────────────────
// 並び替え
// ──────────────────────────────────────────────────

test("moveLine: 上下移動", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "A" });
  p = ops.addLine(p, { text: "B" });
  p = ops.addLine(p, { text: "C" });
  p = ops.moveLine(p, 2, "up");
  eq(p.lines.map(l => l.text), ["A", "C", "B"]);
  p = ops.moveLine(p, 2, "up");
  eq(p.lines.map(l => l.text), ["C", "A", "B"]);
  p = ops.moveLine(p, 2, "bottom");
  eq(p.lines.map(l => l.text), ["A", "B", "C"]);
});

test("reorderLines: 一括並び替え", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "A" });
  p = ops.addLine(p, { text: "B" });
  p = ops.addLine(p, { text: "C" });
  p = ops.reorderLines(p, [2, 0, 1]);
  eq(p.lines.map(l => l.text), ["C", "A", "B"]);
});

// ──────────────────────────────────────────────────
// 文字操作
// ──────────────────────────────────────────────────

test("setCharEmphasis", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "あいう" });
  p = ops.setCharEmphasis(p, 0, 1, 3);
  eq(p.lines[0].chars[1].emphasisLevel, 3);
});

test("overrideCharTemplate / clearCharOverride", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "あいう" });
  p = ops.overrideCharTemplate(p, 0, 0, "design", "_design_special");
  eq(p.lines[0].chars[0].overrideDesign, "_design_special");
  p = ops.clearCharOverride(p, 0, 0);
  ok(p.lines[0].chars[0].overrideDesign === undefined);
});

// ──────────────────────────────────────────────────
// 背景
// ──────────────────────────────────────────────────

test("addBackground / removeBackground", () => {
  let p = createEmptyProject();
  p = ops.addBackground(p, { file: "a.png", tIn: 0, tOut: 30 });
  p = ops.addBackground(p, { file: "b.png", tIn: 28, tOut: 60 });
  eq(p.backgrounds.length, 2);
  eq(p.backgrounds[0].id, 0);
  eq(p.backgrounds[1].id, 1);
  p = ops.removeBackground(p, 0);
  eq(p.backgrounds.length, 1);
  eq(p.backgrounds[0].id, 1);
});

test("setBackgroundFade", () => {
  let p = createEmptyProject();
  p = ops.addBackground(p, { file: "x.png" });
  p = ops.setBackgroundFade(p, 0, 1.5, 2.0);
  eq(p.backgrounds[0].fadeIn, 1.5);
  eq(p.backgrounds[0].fadeOut, 2.0);
});

// ──────────────────────────────────────────────────
// 一括操作
// ──────────────────────────────────────────────────

test("loadLyricsTxt: 空行スキップ", () => {
  let p = createEmptyProject();
  p = ops.loadLyricsTxt(p, "A\n\nB\nC\n", { replaceExisting: true });
  eq(p.lines.length, 3);
  eq(p.lines.map(l => l.text), ["A", "B", "C"]);
});

test("loadLyricsTxt: spacing で TC を均等配置", () => {
  let p = createEmptyProject();
  p = ops.loadLyricsTxt(p, "A\nB\nC", { spacing: 3, replaceExisting: true });
  eq(p.lines[0].tIn, 0);
  eq(p.lines[0].tOut, 3);
  eq(p.lines[1].tIn, 3);
  eq(p.lines[2].tOut, 9);
});

test("applyTemplateToAll: 全行にデザイン適用", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "A" });
  p = ops.addLine(p, { text: "B" });
  p = ops.applyTemplateToAll(p, "design", "_design_neon");
  eq(p.lines[0].template.design, "_design_neon");
  eq(p.lines[1].template.design, "_design_neon");
});

// ──────────────────────────────────────────────────
// JSON シリアライズ
// ──────────────────────────────────────────────────

test("toJSON / fromJSON 往復", () => {
  let p = createEmptyProject({ name: "song" });
  p = ops.addLine(p, { text: "test line", tIn: 1.0, tOut: 5.0 });
  const json = toJSON(p);
  const restored = fromJSON(json);
  eq(restored.name, "song");
  eq(restored.lines[0].text, "test line");
  eq(restored.lines[0].tIn, 1.0);
});

// ──────────────────────────────────────────────────
// バリデーション
// ──────────────────────────────────────────────────

test("validate: 空プロジェクトは OK", () => {
  const p = createEmptyProject();
  const r = validate(p);
  ok(r.ok, "errors: " + r.errors.join(", "));
});

test("validate: tIn > tOut でエラー", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "A", tIn: 10, tOut: 5 });
  const r = validate(p);
  ok(!r.ok);
  ok(r.errors.some(e => e.includes("tIn")));
});

test("validate: 行の重なりは警告", () => {
  let p = createEmptyProject();
  p = ops.addLine(p, { text: "A", tIn: 0, tOut: 5 });
  p = ops.addLine(p, { text: "B", tIn: 3, tOut: 8 });
  const r = validate(p);
  ok(r.ok, "errors: " + r.errors.join(", "));
  ok(r.warnings.length > 0, "重なりは warning");
});

// ──────────────────────────────────────────────────
// 実行
// ──────────────────────────────────────────────────

export function runAllTests(logEl) {
  let passed = 0, failed = 0;
  const log = (msg, kind = "info") => {
    if (logEl) {
      const div = document.createElement("div");
      div.className = "log log-" + kind;
      div.textContent = msg;
      logEl.appendChild(div);
    }
    console.log(msg);
  };
  log(`▶ Phase 0 テスト (${tests.length} 件)`, "info");
  for (const t of tests) {
    try {
      t.fn();
      log("✓ " + t.name, "ok");
      passed++;
    } catch (e) {
      log("✕ " + t.name + " — " + e.message, "ng");
      failed++;
    }
  }
  log(`完了: ${passed} OK / ${failed} NG`, failed === 0 ? "ok" : "ng");
  return { passed, failed, total: tests.length };
}
