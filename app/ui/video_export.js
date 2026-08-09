// 動画書き出しパネル
//
// 作り：
//   ブラウザは「行ごとに透過 PNG を 1 枚描く」だけ。
//   重ね合わせ・フェード・エンコード・音声の多重化は ffmpeg（ローカルヘルパー）に任せる。
//   ブラウザで全部やるより速く、音声と背景動画がそのまま扱えるため。

import { getProject, getUi, getFileBlob } from "./state.js";
import { renderLinePreviewHtml } from "../core/render_line.js";
import { renderLineLayer } from "../core/render_layer.js";
import { escapeHtml } from "../core/html.js";
import { pingHelper, startJob, pollJob, downloadUrl,
         helperStatusHtml, helperMissingHtml, stepsHtml, fmtSec } from "./helper_client.js";

const POLL_MS = 1000;

let overlayEl = null;
let stopPoll = null;
let currentJob = null;

export function init() {
  document.getElementById("btnExportVideo")?.addEventListener("click", open);
}

function open() {
  if (overlayEl) return;
  overlayEl = document.createElement("div");
  overlayEl.className = "at-overlay";
  overlayEl.innerHTML = `
    <div class="at-panel">
      <div class="at-head">
        <div class="at-title">動画書き出し</div>
        <button class="at-close" id="veClose">×</button>
      </div>
      <div class="at-body" id="veBody"></div>
    </div>`;
  document.body.appendChild(overlayEl);
  overlayEl.querySelector("#veClose").addEventListener("click", close);
  overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) close(); });
  renderIdle();
  checkHelper();
}

function close() {
  stopPoll?.(); stopPoll = null;
  overlayEl?.remove();
  overlayEl = null;
}

const body = () => overlayEl?.querySelector("#veBody");

function timedLines() {
  return getProject().lines.filter(l => l.tIn != null && l.tOut != null && l.tOut > l.tIn);
}

const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;

// 書き出しに使える背景を集める。
// 単色は一番下に敷く色として扱い、素材は時間範囲つきのレイヤーとして送る。
// ファイル本体が手元に無い背景（別 PC で作った .json を開いた等）は除外する。
function exportableBackgrounds() {
  const p = getProject();
  const files = [], solids = [];
  const missing = [];
  for (const bg of p.backgrounds || []) {
    if (bg.solidColor) { solids.push(bg); continue; }
    if (!bg.file) continue;
    const f = getFileBlob(bg.file);
    if (!f) { missing.push(bg.file); continue; }
    files.push({ bg, file: f });
  }
  return { files, solids, missing };
}

// ────────────────────────────── 待機画面

function renderIdle(helper = "checking") {
  const el = body(); if (!el) return;
  const p = getProject();
  const lines = timedLines();
  const audio = getUi().audioFile;
  const bgs = exportableBackgrounds();
  el.innerHTML = `
    ${helperStatusHtml(helper)}
    <div class="at-section">
      <div class="at-row"><span>解像度</span><b>${p.resolution.w} × ${p.resolution.h}</b></div>
      <div class="at-row"><span>FPS</span><b>${p.fps}</b></div>
      <div class="at-row"><span>書き出す行</span><b>${lines.length} 行 / 全 ${p.lines.length} 行</b></div>
      <div class="at-row"><span>音声</span><b>${audio ? escapeHtml(audio.name || "読込済み") : "なし（無音になります）"}</b></div>
      <div class="at-row"><span>背景</span><b>${bgs.files.length ? bgs.files.length + " 素材" : "なし（下の色のみ）"}</b></div>
    </div>
    ${bgs.missing.length ? `<div class="at-warn">
      次の背景ファイルがこの PC に見つからないため、書き出しから外します：<br>
      ${bgs.missing.map(escapeHtml).join("、")}</div>` : ``}
    <div class="at-section">
      <div class="at-row">
        <span>フェード</span>
        <span>イン <input class="field-input" id="veFadeIn" type="number" step="0.1" min="0" value="0.4" style="width:60px">
              アウト <input class="field-input" id="veFadeOut" type="number" step="0.1" min="0" value="0.4" style="width:60px"> 秒</span>
      </div>
      <div class="at-row">
        <span>下地の色</span>
        <input type="color" id="veBgColor" value="#101014" style="width:44px;height:24px;padding:0;border:none">
      </div>
    </div>
    ${helper === "ng" ? helperMissingHtml() : ``}
    ${!lines.length ? `<div class="at-warn">TC が入っている行がありません。先にタイミングを入れてください。</div>` : ``}
    <div class="at-actions">
      <button class="tool-btn at-primary" id="veRun" ${helper === "ok" && lines.length ? "" : "disabled"}>書き出す</button>
    </div>`;
  el.querySelector("#veRun")?.addEventListener("click", run);
}

async function checkHelper() {
  renderIdle(await pingHelper());
}

// ────────────────────────────── 実行

async function run() {
  const p = getProject();
  const lines = timedLines();
  const fadeIn = Number(document.getElementById("veFadeIn").value) || 0;
  const fadeOut = Number(document.getElementById("veFadeOut").value) || 0;
  const bgColor = document.getElementById("veBgColor").value || "#101014";
  const W = p.resolution.w, H = p.resolution.h;

  // 画面外にステージを立てて、行ごとに 1 枚ずつ描く
  const holder = document.createElement("div");
  holder.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;height:${H}px;pointer-events:none`;
  document.body.appendChild(holder);

  const layers = [];
  try {
    for (let i = 0; i < lines.length; i++) {
      renderSteps([
        { key: "draw", label: "歌詞レイヤーを描く", percent: i / lines.length * 100 },
        { key: "upload", label: "ヘルパーへ送る", percent: 0 },
        { key: "encode", label: "映像を書き出す", percent: 0 },
      ]);
      holder.innerHTML = renderLinePreviewHtml(lines[i], p);
      const stage = holder.firstElementChild;
      stage.style.width = W + "px";
      stage.style.height = H + "px";
      // レイアウトを同期的に確定させる。requestAnimationFrame は
      // タブが非表示だと発火しないので使わない（書き出し中に裏へ回っても止まらないように）
      void stage.offsetHeight;
      await new Promise(r => setTimeout(r, 0));
      layers.push(await renderLineLayer(stage, W, H));
    }
  } catch (e) {
    holder.remove();
    return renderError("レイヤーの描画に失敗しました: " + (e.message || e));
  }
  holder.remove();

  renderSteps([
    { key: "draw", label: "歌詞レイヤーを描く", percent: 100 },
    { key: "upload", label: "ヘルパーへ送る", percent: 20 },
    { key: "encode", label: "映像を書き出す", percent: 0 },
  ]);

  const { files: bgFiles } = exportableBackgrounds();
  const lastLineOut = Math.max(...lines.map(l => l.tOut));
  const lastBgOut = bgFiles.length ? Math.max(...bgFiles.map(x => x.bg.tOut || 0)) : 0;
  const duration = Math.max(lastLineOut + fadeOut, lastBgOut) + 0.5;

  const spec = {
    width: W, height: H, fps: p.fps, duration,
    baseColor: bgColor,
    backgrounds: bgFiles.map(({ bg }) => ({
      kind: VIDEO_EXT.test(bg.file) ? "video" : "image",
      tIn: bg.tIn ?? 0,
      tOut: (bg.tOut && bg.tOut > (bg.tIn ?? 0)) ? bg.tOut : duration,
      fadeIn: bg.fadeIn ?? 0,
      fadeOut: bg.fadeOut ?? 0,
      fit: bg.fit || "cover",
      opacity: bg.opacity ?? 1.0,
    })),
    fadeIn, fadeOut,
    lines: lines.map((l, i) => ({
      tIn: l.tIn, tOut: l.tOut,
      x: layers[i].x, y: layers[i].y, w: layers[i].w, h: layers[i].h,
    })),
  };

  const fd = new FormData();
  fd.append("spec", JSON.stringify(spec));
  layers.forEach((L, i) => fd.append(`layer_${i}`, L.blob, `line_${i}.png`));
  bgFiles.forEach(({ file }, i) => fd.append(`bg_${i}`, file, file.name || `bg_${i}.bin`));
  const audio = getUi().audioFile;
  if (audio) fd.append("audio", audio, audio.name || "audio.bin");

  try {
    currentJob = await startJob("/render", fd);
    stopPoll = pollJob(currentJob, {
      intervalMs: POLL_MS,
      onProgress: (steps, elapsed) => renderProgress(withDrawStep(steps), elapsed),
      onDone: (d) => renderDone(d),
      onError: (msg) => renderError(msg),
    });
  } catch (e) {
    renderError(String(e.message || e));
  }
}

// ヘルパー側の工程の前に、ブラウザ側の「描く」を足して並べる
function withDrawStep(steps) {
  return [{ key: "draw", label: "歌詞レイヤーを描く", percent: 100 },
          ...steps.map(s => ({ ...s, label: s.key === "upload" ? "ヘルパーへ送る" : s.label }))];
}

function renderSteps(steps, elapsed) {
  const el = body(); if (!el) return;
  el.innerHTML = stepsHtml(steps, elapsed);
}

function renderDone(d) {
  const el = body(); if (!el) return;
  const mb = d.result?.bytes ? (d.result.bytes / 1048576).toFixed(1) + " MB" : "";
  el.innerHTML = `
    <div class="at-note">書き出しが完了しました　${mb}　${fmtSec(d.elapsed || 0)}</div>
    <div class="at-actions">
      <button class="tool-btn at-primary" id="veDl">ダウンロード</button>
      <button class="tool-btn" id="veBack">戻る</button>
    </div>`;
  el.querySelector("#veDl").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = downloadUrl(currentJob);
    a.download = (getProject().name || "utamita") + ".mp4";
    a.click();
  });
  el.querySelector("#veBack").addEventListener("click", () => { currentJob = null; renderIdle(); checkHelper(); });
}

function renderError(msg) {
  const el = body(); if (!el) return;
  el.innerHTML = `<div class="at-warn">${escapeHtml(msg)}</div>
    <div class="at-actions"><button class="tool-btn" id="veBack2">戻る</button></div>`;
  el.querySelector("#veBack2").addEventListener("click", () => { currentJob = null; renderIdle(); checkHelper(); });
}

