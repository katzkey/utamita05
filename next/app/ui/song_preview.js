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

import { getProject } from "./state.js?v=60b30cb";
import { renderLinePreviewHtml, backgroundLayerHtml, previewStageStyle, VIDEO_EXTS } from "../core/render_line.js?v=60b30cb";
import { secondsToTC } from "./tc.js?v=60b30cb";
import { transformAt, motionTransformCss } from "../core/motion.js?v=60b30cb";

let timer = null;
let stageEl = null;
let noteEl = null;
let bgHost = null;
let layers = [];        // { line, el }
let bgLayers = [];      // { bg, el, video }
let player = null;

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

export function stop() {
  if (timer) { clearInterval(timer); timer = null; }
  for (const b of bgLayers) b.video?.pause();
  stageEl = null; noteEl = null; bgHost = null;
  layers = []; bgLayers = [];
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

// 背景と全行のレイヤーを 1 回だけ積む
function build(p) {
  bgHost = document.createElement("div");
  bgHost.style.cssText = "position:absolute;inset:0;overflow:hidden";
  stageEl.appendChild(bgHost);

  // 背景も最初に全部積んでおき、あとは不透明度だけ動かす。
  // 出入りのたびに作り直すと、そのたび画像を読み直してちらつくため。
  // リストの上にあるものが手前（AE と同じ）なので、逆順に積む。
  const tmpBg = document.createElement("div");
  bgLayers = [];
  for (const bg of (p.backgrounds || []).slice().reverse()) {
    tmpBg.innerHTML = backgroundLayerHtml(bg);
    const el = tmpBg.firstElementChild;
    if (!el) continue;
    el.style.opacity = "0";
    bgHost.appendChild(el);
    bgLayers.push({ bg, el, video: (bg.file && VIDEO_EXTS.test(bg.file)) ? el : null });
  }

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

  // 背景はフェードを含めて不透明度を毎フレーム決める（書き出しと同じ形）
  const playing = !!player && !player.paused;
  for (const { bg, el, video } of bgLayers) {
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
