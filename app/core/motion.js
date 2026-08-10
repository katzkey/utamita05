// 行の出入りの動き
//
// 「フェード」「スライド」「スケール」を重ねて掛けられるようにしている。
// 下からスライドしながらフェードイン、のような組み合わせが定番のため、
// 種類をひとつ選ぶ形にはしていない。
//
// 同じ計算式を 3 箇所で使う：
//   - 詳細ペインのプレビュー（静止）
//   - 再生プレビュー（ブラウザで動かす）
//   - 動画書き出し（ffmpeg のフィルタ式に変換する）
// 式を一箇所に置くことで、見たものと書き出したものがずれないようにする。

// ---- イージング ----
// 0..1 の進み具合を受けて 0..1 を返す。1 を超える戻り値があるものは行き過ぎる動き。
export const EASINGS = {
  linear:   { label: "均一",              fn: p => p },
  easeOut:  { label: "減速（自然）",       fn: p => 1 - Math.pow(1 - p, 3) },
  easeIn:   { label: "加速",              fn: p => p * p * p },
  easeInOut:{ label: "加速して減速",       fn: p => p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p + 2, 3) / 2 },
  back:     { label: "ぽよん（行き過ぎて戻る）",
              fn: p => { const c1 = 1.70158, c3 = c1 + 1;
                         return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); } },
  elastic:  { label: "びよん（揺れて収まる）",
              fn: p => { if (p === 0 || p === 1) return p;
                         const c4 = (2 * Math.PI) / 3;
                         return Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * c4) + 1; } },
};

export const SLIDE_DIRS = {
  up:    { label: "下から上へ", dx:  0, dy:  1 },
  down:  { label: "上から下へ", dx:  0, dy: -1 },
  left:  { label: "右から左へ", dx:  1, dy:  0 },
  right: { label: "左から右へ", dx: -1, dy:  0 },
};

export function defaultMotionSide() {
  return {
    dur: 0.4,
    ease: "easeOut",
    fade: true,
    slide: { enabled: false, dir: "up", dist: 40 },   // dist は AE px
    scale: { enabled: false, from: 0.8 },             // from → 1.0 へ
  };
}

export function defaultMotion() {
  return {
    unit: "line",        // "line" = 行ごと / "char" = 文字ごと
    stagger: 0.03,       // 文字ごとのときの 1 文字あたりの遅れ（秒）
    in:  defaultMotionSide(),
    out: { ...defaultMotionSide(), ease: "easeIn" },
  };
}

/**
 * 欠けている項目を既定値で埋める。
 * 古いプロジェクトには motion が無く、UI で 1 項目だけ触った行も
 * 途中までしか入っていないことがあるため、使う前に必ず通す。
 */
export function normalizeMotion(m) {
  const d = defaultMotion();
  if (!m) return d;
  const side = (s, def) => ({
    ...def, ...(s || {}),
    slide: { ...def.slide, ...((s || {}).slide || {}) },
    scale: { ...def.scale, ...((s || {}).scale || {}) },
  });
  return {
    unit: m.unit || d.unit,
    stagger: m.stagger ?? d.stagger,
    in: side(m.in, d.in),
    out: side(m.out, d.out),
  };
}

// ---- 進み具合 ----

/**
 * その時刻での「出の進み」と「入りの進み」を返す。
 * 戻り値 { p, phase } … p は 0..1（イージング適用前）
 *   phase: "before" | "in" | "hold" | "out" | "after"
 */
export function phaseAt(t, tIn, tOut, motion) {
  const m = normalizeMotion(motion);
  const di = Math.max(0, m.in.dur ?? 0);
  const doo = Math.max(0, m.out.dur ?? 0);
  if (t < tIn) return { phase: "before", p: 0 };
  if (t < tIn + di) return { phase: "in", p: di > 0 ? (t - tIn) / di : 1 };
  if (t <= tOut) return { phase: "hold", p: 1 };
  if (t < tOut + doo) return { phase: "out", p: doo > 0 ? (t - tOut) / doo : 1 };
  return { phase: "after", p: 1 };
}

/**
 * その時刻の見た目を返す。
 * @returns {{opacity:number, dx:number, dy:number, scale:number, visible:boolean}}
 *   dx / dy は AE px。scale は倍率。
 */
export function transformAt(t, tIn, tOut, motion, delay = 0) {
  const m = normalizeMotion(motion);
  const { phase, p } = phaseAt(t - delay, tIn, tOut, m);
  const idle = { opacity: 0, dx: 0, dy: 0, scale: 1, visible: false };
  if (phase === "before" || phase === "after") return idle;
  if (phase === "hold") return { opacity: 1, dx: 0, dy: 0, scale: 1, visible: true };

  const side = phase === "in" ? m.in : m.out;
  const ease = (EASINGS[side.ease] || EASINGS.easeOut).fn;
  // 出のときは 1 → 0 に向かうので、進みを反転して同じ式を使う
  const e = ease(phase === "in" ? p : 1 - p);

  const out = { opacity: 1, dx: 0, dy: 0, scale: 1, visible: true };
  if (side.fade) out.opacity = Math.max(0, Math.min(1, e));
  if (side.slide?.enabled) {
    const d = SLIDE_DIRS[side.slide.dir] || SLIDE_DIRS.up;
    const dist = Number(side.slide.dist) || 0;
    out.dx = d.dx * dist * (1 - e);
    out.dy = d.dy * dist * (1 - e);
  }
  if (side.scale?.enabled) {
    const from = Number(side.scale.from);
    out.scale = (isFinite(from) ? from : 0.8) + (1 - (isFinite(from) ? from : 0.8)) * e;
  }
  return out;
}

/** 文字ごとのとき、i 文字目の遅れ（秒） */
export function charDelay(motion, i) {
  if (!motion || motion.unit !== "char") return 0;
  return (Number(motion.stagger) || 0) * i;
}

/** 動きが何も設定されていない（＝ずっと出しっぱなし）か */
export function isStatic(motion) {
  const none = s => !s || (!s.fade && !s.slide?.enabled && !s.scale?.enabled) || !(s.dur > 0);
  return none(motion?.in) && none(motion?.out);
}

// ---- ffmpeg 用の式 ----
// ブラウザと同じ動きを ffmpeg に伝えるため、イージングを式の文字列にする。
// t は「その行が出始めてからの秒数」。

const EASE_EXPR = {
  linear:    p => p,
  easeOut:   p => `(1-pow(1-(${p}),3))`,
  easeIn:    p => `(pow((${p}),3))`,
  easeInOut: p => `(if(lt((${p}),0.5), 4*pow((${p}),3), 1-pow(-2*(${p})+2,3)/2))`,
  back:      p => `(1 + 2.70158*pow((${p})-1,3) + 1.70158*pow((${p})-1,2))`,
  // elastic は式が長くなるので、ffmpeg では back で近似する
  elastic:   p => `(1 + 2.70158*pow((${p})-1,3) + 1.70158*pow((${p})-1,2))`,
};

/** 進み具合 p（0..1）を表す ffmpeg 式。side は "in" | "out" */
export function progressExpr(side, m, tInRel, tOutRel) {
  const d = Math.max(0.0001, side === "in" ? (m.in?.dur ?? 0) : (m.out?.dur ?? 0));
  if (side === "in") return `min(1,max(0,(t-${tInRel.toFixed(3)})/${d.toFixed(3)}))`;
  return `min(1,max(0,1-(t-${tOutRel.toFixed(3)})/${d.toFixed(3)}))`;
}

/** イージングを適用した式 */
export function easedExpr(sideName, m, tInRel, tOutRel) {
  const s = sideName === "in" ? m.in : m.out;
  const fn = EASE_EXPR[s?.ease] || EASE_EXPR.easeOut;
  return fn(progressExpr(sideName, m, tInRel, tOutRel));
}
