// 再生プレビュー
//
// 曲を流しながら、TC どおりに歌詞がフェードで出入りするのを確認する。
// 書き出しに 6 分かかるので、その前にここで見て判断できるようにする。
//
// 作り：
//   全行のレイヤーを最初に 1 回だけ DOM に積んでおき、
//   再生中は opacity を書き換えるだけにする（毎フレーム作り直さない）。
//   音は既存の #player をそのまま使うので、再生バーと状態が食い違わない。

import { getProject, getUi } from "./state.js?v=ab744b0";
import { renderLinePreviewHtml, renderPreviewBackgrounds } from "../core/render_line.js?v=ab744b0";
import { secondsToTC } from "./tc.js?v=ab744b0";
import { transformAt, defaultMotion } from "../core/motion.js?v=ab744b0";

let overlayEl = null;
let rafId = null;
let player = null;
let layers = [];        // { line, el }
let bgHost = null;
let bgKey = "";

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
        <span class="pp-fade">動きは「見た目」の隣の<b>動き</b>タブで設定します</span>
      </div>
      <div class="at-note" id="ppNote"></div>
    </div>`;
  document.body.appendChild(overlayEl);

  overlayEl.querySelector("#ppClose").addEventListener("click", close);
  overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) close(); });
  overlayEl.querySelector("#ppPlay").addEventListener("click", togglePlay);
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
  if (rafId) { clearInterval(rafId); rafId = null; }
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
    // 元の transform をそのまま控える。動きは「中心合わせの直後」に差し込む。
    // 後ろに足すと rotate や scale より先に効いてしまい、位置がずれる。
    el._orig = el.style.transform || "";
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


function tick() {
  if (!overlayEl || !player) return;
  const t = player.currentTime || 0;
  const p = getProject();

  // 書き出しと同じ式（core/motion.js）で見た目を決める
  const sx = (overlayEl.querySelector("#ppStage")?.clientWidth || p.resolution.w) / p.resolution.w;
  for (const { line, el } of layers) {
    const r = transformAt(t, line.tIn, line.tOut, line.motion || defaultMotion());
    const mv = `translate(${(r.dx * sx).toFixed(2)}px, ${(r.dy * sx).toFixed(2)}px) scale(${r.scale.toFixed(4)})`;
    const css = el._orig.includes("translate(-50%")
      ? el._orig.replace(/translate\(-50%,\s*-50%\)/, `translate(-50%, -50%) ${mv}`)
      : `${mv} ${el._orig}`;
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

  overlayEl.querySelector("#ppTC").textContent = secondsToTC(t, p.fps);
  const dur = player.duration || 0;
  overlayEl.querySelector("#ppSeekFill").style.width = dur ? (t / dur * 100) + "%" : "0%";
  overlayEl.querySelector("#ppPlay").textContent = player.paused ? "▶" : "⏸";
}

// requestAnimationFrame はタブが非表示だと発火せず、プレビューが固まる。
// 書き出しのときと同じ理由でタイマーで回す（tick は値が変わったときだけ
// スタイルを書くので、回し続けても負荷はほぼ無い）。
function loop() {
  tick();
  rafId = setInterval(tick, 1000 / 60);
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
