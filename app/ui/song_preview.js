// 曲に合わせたプレビュー
//
// 詳細ペインのプレビュー枠の中で、TC どおりに全行が出入りするのを見せる。
// 以前は独立したモーダル（再生プレビュー）だったが、見る場所が 2 つあると
// 行を選び直すたびに開き直すことになるので、詳細ペインに寄せた。
//
// 作り：
//   全行のレイヤーを最初に 1 回だけ DOM に積んでおき、
//   再生中は opacity と transform を書き換えるだけにする（毎フレーム作り直さない）。
//   音と再生位置は既存の #player をそのまま使うので、下の再生バーで操作でき、
//   状態が食い違うこともない。

import { getProject } from "./state.js?v=432cea1";
import { renderLinePreviewHtml, renderPreviewBackgrounds, previewStageStyle } from "../core/render_line.js?v=432cea1";
import { secondsToTC } from "./tc.js?v=432cea1";
import { transformAt, motionTransformCss } from "../core/motion.js?v=432cea1";

let timer = null;
let stageEl = null;
let noteEl = null;
let bgHost = null;
let bgKey = "";
let layers = [];        // { line, el }
let player = null;

export function stop() {
  if (timer) { clearInterval(timer); timer = null; }
  stageEl = null; noteEl = null; bgHost = null; bgKey = "";
  layers = [];
}

/** hostEl の中身を「曲に合わせたプレビュー」に差し替えて回し始める */
export function start(hostEl) {
  stop();
  if (!hostEl) return;
  const p = getProject();
  player = document.getElementById("player");

  hostEl.innerHTML = `
    <div style="${previewStageStyle(p)}" id="spStage"></div>
    <div style="margin-top:6px;font-size:10px;color:var(--gray-3,#999)" id="spNote"></div>`;
  stageEl = hostEl.querySelector("#spStage");
  noteEl = hostEl.querySelector("#spNote");

  build(p);
  tick();
  // requestAnimationFrame はタブが非表示だと発火せず固まるのでタイマーで回す。
  // tick は値が変わったときだけスタイルを書くので、回し続けても負荷はほぼ無い。
  timer = setInterval(tick, 1000 / 60);
}

// 全行のレイヤーを 1 回だけ積む
function build(p) {
  bgHost = document.createElement("div");
  bgHost.style.cssText = "position:absolute;inset:0;overflow:hidden";
  stageEl.appendChild(bgHost);

  const tmp = document.createElement("div");
  layers = [];
  for (const line of p.lines) {
    if (line.tIn == null || line.tOut == null || line.tOut <= line.tIn) continue;
    tmp.innerHTML = renderLinePreviewHtml(line, p);
    // renderLinePreviewHtml が返すステージの最後の子が、行の中身（座布団＋文字）
    const inner = tmp.firstElementChild?.lastElementChild;
    if (!inner) continue;
    const el = inner.cloneNode(true);
    // 元の transform を控える。動きは「中心合わせの直後」に差し込む。
    // 後ろに足すと rotate や scale より先に効いてしまい、位置がずれる。
    el._orig = el.style.transform || "";
    el.style.opacity = "0";
    el.style.willChange = "opacity";
    stageEl.appendChild(el);
    layers.push({ line, el });
  }
}

function tick() {
  if (!stageEl || !stageEl.isConnected) { stop(); return; }
  const p = getProject();
  const t = player?.currentTime || 0;

  // 書き出しと同じ式（core/motion.js）で見た目を決める
  const sx = (stageEl.clientWidth || p.resolution.w) / p.resolution.w;
  for (const { line, el } of layers) {
    const r = transformAt(t, line.tIn, line.tOut, line.motion);
    const css = motionTransformCss(el._orig, r, sx);
    if (el._a !== r.opacity) { el.style.opacity = String(r.opacity); el._a = r.opacity; }
    if (el._tr !== css) { el.style.transform = css; el._tr = css; }
  }

  // 背景は「今どれが出ているか」が変わったときだけ作り直す
  const active = (p.backgrounds || []).filter(b => (b.tIn ?? 0) <= t && t < (b.tOut ?? Infinity));
  const key = active.map(b => b.id).join(",");
  if (key !== bgKey) {
    bgKey = key;
    bgHost.innerHTML = renderPreviewBackgrounds({ tIn: t }, p);
  }

  const note = !player?.src
    ? "楽曲が読み込まれていません。ヘッダの「楽曲読込」から読み込んでください。"
    : layers.length
      ? `${secondsToTC(t, p.fps)}　${layers.length} 行（TC が入っている行のみ／全 ${p.lines.length} 行）`
      : "TC が入っている行がありません。先にタイミングを入れてください。";
  if (noteEl && noteEl._n !== note) { noteEl.textContent = note; noteEl._n = note; }
}
