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
//
//   背景と行は別々に作り直す。行の値をいじるたびに背景の <video> まで
//   作り直していたら、操作 100 回ほどで音が出なくなった（作っては捨てた
//   動画要素がブラウザの再生資源を食い尽くす）。背景は、背景そのものが
//   変わったときだけ作り直す。

import { getProject } from "./state.js?v=6c5382d";
import { renderLinePreviewHtml, backgroundLayerHtml, previewStageStyle, VIDEO_EXTS } from "../core/render_line.js?v=6c5382d";
import { secondsToTC } from "./tc.js?v=6c5382d";
import { transformAt, motionTransformCss } from "../core/motion.js?v=6c5382d";

let timer = null;
let hostRef = null;      // いま使っている枠。変わったら作り直す
let stageEl = null;
let noteEl = null;
let bgHost = null;
let layers = [];         // { line, el }
let bgLayers = [];       // { bgId, el, video }
let player = null;
let stageSig = null;     // ステージの見た目（解像度など）
let bgSig = null;        // 背景レイヤーの顔ぶれ
let lineSig = null;      // 行レイヤーの顔ぶれ

/**
 * 背景のその時刻の不透明度。
 * tools/render_video.py の背景フェード（fade=alpha=1）と同じ形にしてある。
 * 直線的に上げ下げし、フェード秒は表示時間の半分で頭打ち。
 */
function bgAlpha(bg, t) {
  const tIn = bg.tIn ?? 0;
  const span = Math.max(0.05, (bg.tOut ?? Infinity) - tIn);
  if (!isFinite(span)) return t >= tIn ? (bg.opacity ?? 1) : 0;
  if (t < tIn || t > tIn + span) return 0;
  const fi = Math.min(Number(bg.fadeIn) || 0, span / 2);
  const fo = Math.min(Number(bg.fadeOut) || 0, span / 2);
  const local = t - tIn;
  let a = 1;
  if (fi > 0 && local < fi) a = local / fi;
  if (fo > 0 && local > span - fo) a = Math.min(a, (span - local) / fo);
  return Math.max(0, Math.min(1, a)) * (bg.opacity ?? 1);
}

// 背景動画を曲の時刻に合わせる（ずれたときだけシークする）
function syncVideo(el, local, playing) {
  if (!el || !el.duration) return;
  const want = Math.max(0, Math.min(local, el.duration - 0.05));
  if (Math.abs(el.currentTime - want) > 0.3) {
    try { el.currentTime = want; } catch (e) { /* 読み込み中は無視 */ }
  }
  if (playing && el.paused) el.play().catch(() => {});
  else if (!playing && !el.paused) el.pause();
}

// 動画要素を捨てるときは、読み込みを断ち切ってから捨てる。
// DOM から外すだけでは中の再生資源が残り、積もると音が出なくなる。
function releaseVideo(el) {
  if (!el) return;
  try {
    el.pause();
    el.removeAttribute("src");
    el.load();
  } catch (e) { /* すでに壊れていても捨てるだけなので無視 */ }
}

function clearBgLayers() {
  for (const b of bgLayers) releaseVideo(b.video);
  bgLayers = [];
  if (bgHost) bgHost.innerHTML = "";
  bgSig = null;
}

export function stop() {
  if (timer) { clearInterval(timer); timer = null; }
  clearBgLayers();
  hostRef = null; stageEl = null; noteEl = null; bgHost = null;
  layers = []; stageSig = null; lineSig = null;
}

/** hostEl の中身を「曲に合わせたプレビュー」にして回し始める（すでに出ていれば中身だけ更新） */
export function start(hostEl) {
  if (!hostEl) { stop(); return; }
  const p = getProject();
  player = document.getElementById("player");

  const sSig = previewStageStyle(p);
  if (!stageEl || stageSig !== sSig) {
    clearBgLayers();
    hostEl.innerHTML = `
      <div style="${sSig}" id="spStage"></div>
      <div style="margin-top:6px;font-size:10px;color:var(--gray-3,#999)" id="spNote"></div>`;
    stageEl = hostEl.querySelector("#spStage");
    noteEl = hostEl.querySelector("#spNote");
    bgHost = document.createElement("div");
    bgHost.style.cssText = "position:absolute;inset:0;overflow:hidden";
    stageEl.appendChild(bgHost);
    hostRef = hostEl; stageSig = sSig;
    layers = []; lineSig = null;
  } else if (hostRef !== hostEl || !stageEl.isConnected) {
    // 詳細ペインは丸ごと描き直されるので、枠は毎回ちがう要素になる。
    // 作り直さず、いまのステージをそのまま新しい枠へ移す。
    // 移すだけなら <video> は読み込み直さない。
    hostEl.innerHTML = "";
    hostEl.appendChild(stageEl);
    hostEl.appendChild(noteEl);
    hostRef = hostEl;
  }

  const nb = bgSignature(p);
  if (nb !== bgSig) { buildBackgrounds(p); bgSig = nb; }
  const nl = lineSignature(p);
  if (nl !== lineSig) { buildLines(p); lineSig = nl; }

  // requestAnimationFrame はタブが非表示だと発火せず固まるのでタイマーで回す。
  // tick は値が変わったときだけスタイルを書くので、回し続けても負荷はほぼ無い。
  if (!timer) timer = setInterval(tick, 1000 / 60);
  tick();
}

// 背景レイヤーの「顔ぶれ」。不透明度や時刻は毎フレーム当てるので入れない。
// ここに入れた値が変わったときだけ、動画要素を作り直す。
function bgSignature(p) {
  return (p.backgrounds || [])
    .map(bg => [bg.id, bg.file || "", bg.solidColor || "", bg.fit || "", bg.blend || ""].join(","))
    .join("|");
}

function lineSignature(p) {
  return JSON.stringify([p.lines, p.font, p.defaults, p.templates, p.resolution]);
}

// 背景を積み直す。リストの上にあるものが手前（AE と同じ）なので逆順に積む。
// 出入りのたびに作り直すと画像を読み直してちらつくので、不透明度だけ動かす。
function buildBackgrounds(p) {
  clearBgLayers();
  const tmp = document.createElement("div");
  for (const bg of (p.backgrounds || []).slice().reverse()) {
    tmp.innerHTML = backgroundLayerHtml(bg);
    const el = tmp.firstElementChild;
    if (!el) continue;
    el.style.opacity = "0";
    bgHost.appendChild(el);
    bgLayers.push({ bgId: bg.id, el, video: (bg.file && VIDEO_EXTS.test(bg.file)) ? el : null });
  }
}

function buildLines(p) {
  for (const { el } of layers) el.remove();
  layers = [];
  const tmp = document.createElement("div");
  for (const line of p.lines) {
    if (line.tIn == null || line.tOut == null || line.tOut <= line.tIn) continue;
    tmp.innerHTML = renderLinePreviewHtml(line, p, { backgrounds: false });
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

  // 背景はフェードを含めて不透明度を毎フレーム決める（書き出しと同じ形）。
  // 作り直さない代わりに、時刻や不透明度はその都度プロジェクトから引く。
  const playing = !!player && !player.paused;
  const byId = new Map((p.backgrounds || []).map(b => [b.id, b]));
  for (const { bgId, el, video } of bgLayers) {
    const bg = byId.get(bgId);
    if (!bg) continue;
    const a = bgAlpha(bg, t);
    if (el._a !== a) { el.style.opacity = String(a); el._a = a; }
    if (video) {
      if (a > 0) syncVideo(video, t - (bg.tIn ?? 0), playing);
      else if (!video.paused) video.pause();
    }
  }

  const note = !player?.src
    ? "楽曲が読み込まれていません。ヘッダの「楽曲読込」から読み込んでください。"
    : layers.length
      ? `${secondsToTC(t, p.fps)}　${layers.length} 行（TC が入っている行のみ／全 ${p.lines.length} 行）`
      : "TC が入っている行がありません。先にタイミングを入れてください。";
  if (noteEl && noteEl._n !== note) { noteEl.textContent = note; noteEl._n = note; }
}
