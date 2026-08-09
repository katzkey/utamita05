// 再生プレビュー
//
// 曲を流しながら、TC どおりに歌詞がフェードで出入りするのを確認する。
// 書き出しに 6 分かかるので、その前にここで見て判断できるようにする。
//
// 作り：
//   全行のレイヤーを最初に 1 回だけ DOM に積んでおき、
//   再生中は opacity を書き換えるだけにする（毎フレーム作り直さない）。
//   音は既存の #player をそのまま使うので、再生バーと状態が食い違わない。

import { getProject, getUi } from "./state.js";
import { renderLinePreviewHtml, renderPreviewBackgrounds } from "../core/render_line.js";
import { secondsToTC } from "./tc.js";

let overlayEl = null;
let rafId = null;
let player = null;
let layers = [];        // { line, el }
let bgHost = null;
let bgKey = "";
let fadeIn = 0.4, fadeOut = 0.4;

export function init() {
  document.getElementById("btnPlayPreview")?.addEventListener("click", open);
}

function open() {
  if (overlayEl) return;
  player = document.getElementById("player");
  const p = getProject();

  overlayEl = document.createElement("div");
  overlayEl.className = "at-overlay pp-overlay";
  overlayEl.innerHTML = `
    <div class="pp-panel">
      <div class="at-head">
        <div class="at-title">再生プレビュー</div>
        <button class="at-close" id="ppClose">×</button>
      </div>
      <div class="pp-stage-wrap">
        <div class="pp-stage" id="ppStage" style="aspect-ratio:${p.resolution.w}/${p.resolution.h}"></div>
      </div>
      <div class="pp-bar">
        <button class="tool-btn" id="ppPlay">▶</button>
        <span class="pp-tc" id="ppTC">00:00:00:00</span>
        <div class="pp-seek" id="ppSeek"><i id="ppSeekFill"></i></div>
        <span class="pp-fade">フェード
          <input class="field-input" id="ppFadeIn" type="number" step="0.1" min="0" value="0.4" style="width:56px">
          <input class="field-input" id="ppFadeOut" type="number" step="0.1" min="0" value="0.4" style="width:56px"> 秒
        </span>
      </div>
      <div class="at-note" id="ppNote"></div>
    </div>`;
  document.body.appendChild(overlayEl);

  overlayEl.querySelector("#ppClose").addEventListener("click", close);
  overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) close(); });
  overlayEl.querySelector("#ppPlay").addEventListener("click", togglePlay);
  overlayEl.querySelector("#ppFadeIn").addEventListener("change", e => { fadeIn = Number(e.target.value) || 0; });
  overlayEl.querySelector("#ppFadeOut").addEventListener("change", e => { fadeOut = Number(e.target.value) || 0; });
  const seek = overlayEl.querySelector("#ppSeek");
  seek.addEventListener("click", (e) => {
    if (!player?.duration) return;
    const r = seek.getBoundingClientRect();
    player.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * player.duration;
    tick();
  });

  build();
  tick();
  loop();
}

function close() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  player?.pause();
  overlayEl?.remove();
  overlayEl = null;
  layers = []; bgHost = null; bgKey = "";
}

// 全行のレイヤーを 1 回だけ積む
function build() {
  const p = getProject();
  const stage = overlayEl.querySelector("#ppStage");
  stage.style.background = "#101014";
  stage.innerHTML = "";

  bgHost = document.createElement("div");
  bgHost.style.cssText = "position:absolute;inset:0;overflow:hidden";
  stage.appendChild(bgHost);

  const tmp = document.createElement("div");
  layers = [];
  for (const line of p.lines) {
    if (line.tIn == null || line.tOut == null || line.tOut <= line.tIn) continue;
    tmp.innerHTML = renderLinePreviewHtml(line, p);
    // renderLinePreviewHtml が返すステージの最後の子が、行の中身（座布団＋文字）
    const inner = tmp.firstElementChild?.lastElementChild;
    if (!inner) continue;
    const el = inner.cloneNode(true);
    el.style.opacity = "0";
    el.style.willChange = "opacity";
    stage.appendChild(el);
    layers.push({ line, el });
  }

  const note = overlayEl.querySelector("#ppNote");
  const total = p.lines.length;
  note.textContent = layers.length
    ? `${layers.length} 行を表示（TC が入っている行のみ／全 ${total} 行）`
    : "TC が入っている行がありません。先にタイミングを入れてください。";
}

// その時刻での不透明度。フェードイン中／アウト中は途中の値になる。
function alphaAt(line, t) {
  const fi = Math.min(fadeIn, (line.tOut - line.tIn) / 2);
  const fo = Math.min(fadeOut, (line.tOut - line.tIn) / 2);
  if (t < line.tIn || t > line.tOut + fo) return 0;
  if (t < line.tIn + fi) return fi > 0 ? (t - line.tIn) / fi : 1;
  if (t > line.tOut) return fo > 0 ? 1 - (t - line.tOut) / fo : 0;
  return 1;
}

function tick() {
  if (!overlayEl || !player) return;
  const t = player.currentTime || 0;
  const p = getProject();

  for (const { line, el } of layers) {
    const a = alphaAt(line, t);
    if (el._a !== a) { el.style.opacity = String(a); el._a = a; }
  }

  // 背景は「今どれが出ているか」が変わったときだけ作り直す
  const active = (p.backgrounds || []).filter(b => (b.tIn ?? 0) <= t && t < (b.tOut ?? Infinity));
  const key = active.map(b => b.id).join(",");
  if (key !== bgKey) {
    bgKey = key;
    bgHost.innerHTML = renderPreviewBackgrounds({ tIn: t }, p);
  }

  overlayEl.querySelector("#ppTC").textContent = secondsToTC(t, p.fps);
  const dur = player.duration || 0;
  overlayEl.querySelector("#ppSeekFill").style.width = dur ? (t / dur * 100) + "%" : "0%";
  overlayEl.querySelector("#ppPlay").textContent = player.paused ? "▶" : "⏸";
}

function loop() {
  tick();
  rafId = requestAnimationFrame(loop);
}

function togglePlay() {
  if (!player) return;
  if (!player.src) {
    overlayEl.querySelector("#ppNote").textContent =
      "楽曲が読み込まれていません。ヘッダの「楽曲読込」から読み込んでください。";
    return;
  }
  player.paused ? player.play() : player.pause();
}
