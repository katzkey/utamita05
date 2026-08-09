// 動画書き出しパネル
//
// 作り：
//   ブラウザは「行ごとに透過 PNG を 1 枚描く」だけ。
//   重ね合わせ・フェード・エンコード・音声の多重化は ffmpeg（ローカルヘルパー）に任せる。
//   ブラウザで全部やるより速く、音声と背景動画がそのまま扱えるため。

import { getProject, getUi } from "./state.js";
import { renderLinePreviewHtml } from "./lyrics_tab.js";
import { renderLineLayer } from "../core/render_layer.js";

const HELPER_BASE = "http://127.0.0.1:8777";
const POLL_MS = 1000;

let overlayEl = null;
let pollTimer = null;
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
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  overlayEl?.remove();
  overlayEl = null;
}

const body = () => overlayEl?.querySelector("#veBody");

function timedLines() {
  return getProject().lines.filter(l => l.tIn != null && l.tOut != null && l.tOut > l.tIn);
}

// ────────────────────────────── 待機画面

function renderIdle(helper = "checking") {
  const el = body(); if (!el) return;
  const p = getProject();
  const lines = timedLines();
  const audio = getUi().audioFile;
  const dot = { checking: "at-dot-wait", ok: "at-dot-ok", ng: "at-dot-ng" }[helper];
  const msg = { checking: "ヘルパーを確認しています…", ok: "ヘルパーに接続できました",
                ng: "ヘルパーが見つかりません" }[helper];

  el.innerHTML = `
    <div class="at-status"><span class="at-dot ${dot}"></span> ${msg}</div>
    <div class="at-section">
      <div class="at-row"><span>解像度</span><b>${p.resolution.w} × ${p.resolution.h}</b></div>
      <div class="at-row"><span>FPS</span><b>${p.fps}</b></div>
      <div class="at-row"><span>書き出す行</span><b>${lines.length} 行 / 全 ${p.lines.length} 行</b></div>
      <div class="at-row"><span>音声</span><b>${audio ? escapeHtml(audio.name || "読込済み") : "なし（無音になります）"}</b></div>
    </div>
    <div class="at-section">
      <div class="at-row">
        <span>フェード</span>
        <span>イン <input class="field-input" id="veFadeIn" type="number" step="0.1" min="0" value="0.4" style="width:60px">
              アウト <input class="field-input" id="veFadeOut" type="number" step="0.1" min="0" value="0.4" style="width:60px"> 秒</span>
      </div>
      <div class="at-row">
        <span>背景色</span>
        <input type="color" id="veBgColor" value="#101014" style="width:44px;height:24px;padding:0;border:none">
      </div>
    </div>
    ${helper === "ng" ? `<div class="at-note">
      <code>tools/start_helper.bat</code> を実行してから、もう一度開いてください。</div>` : ``}
    ${!lines.length ? `<div class="at-warn">TC が入っている行がありません。先にタイミングを入れてください。</div>` : ``}
    <div class="at-actions">
      <button class="tool-btn at-primary" id="veRun" ${helper === "ok" && lines.length ? "" : "disabled"}>書き出す</button>
    </div>`;
  el.querySelector("#veRun")?.addEventListener("click", run);
}

async function checkHelper() {
  try {
    const r = await fetch(`${HELPER_BASE}/ping`, { signal: AbortSignal.timeout(3000) });
    renderIdle(r.ok ? "ok" : "ng");
  } catch { renderIdle("ng"); }
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
      // 画像化を 1 フレーム待ってレイアウトを確定させる
      await new Promise(r => requestAnimationFrame(r));
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

  const duration = Math.max(...lines.map(l => l.tOut)) + fadeOut + 0.5;
  const spec = {
    width: W, height: H, fps: p.fps, duration,
    background: { type: "solid", color: bgColor },
    fadeIn, fadeOut,
    lines: lines.map(l => ({ tIn: l.tIn, tOut: l.tOut })),
  };

  const fd = new FormData();
  fd.append("spec", JSON.stringify(spec));
  layers.forEach((b, i) => fd.append(`layer_${i}`, b, `line_${i}.png`));
  const audio = getUi().audioFile;
  if (audio) fd.append("audio", audio, audio.name || "audio.bin");

  try {
    const r = await fetch(`${HELPER_BASE}/render`, { method: "POST", body: fd });
    const d = await r.json();
    if (!r.ok || !d.jobId) throw new Error(d.error || "書き出しを開始できませんでした");
    currentJob = d.jobId;
    pollTimer = setInterval(poll, POLL_MS);
    poll();
  } catch (e) {
    renderError(String(e.message || e));
  }
}

async function poll() {
  if (!currentJob) return;
  try {
    const r = await fetch(`${HELPER_BASE}/jobs/${currentJob}`);
    const d = await r.json();
    const steps = [{ key: "draw", label: "歌詞レイヤーを描く", percent: 100 },
                   ...d.steps.map(s => ({ ...s, label: s.key === "upload" ? "ヘルパーへ送る" : s.label }))];
    if (d.status === "running") {
      renderSteps(steps, d.elapsed);
    } else if (d.status === "done") {
      clearInterval(pollTimer); pollTimer = null;
      renderDone(d);
    } else if (d.status === "error") {
      clearInterval(pollTimer); pollTimer = null;
      renderError(d.error || "書き出しに失敗しました");
    }
  } catch (e) {
    clearInterval(pollTimer); pollTimer = null;
    renderError("ヘルパーとの通信が切れました");
  }
}

function renderSteps(steps, elapsed) {
  const el = body(); if (!el) return;
  el.innerHTML = `
    <div class="at-steps">${steps.map(s => {
      const done = s.percent >= 100, active = !done && s.percent > 0;
      return `<div class="at-step ${done ? "is-done" : active ? "is-active" : ""}">
        <span class="at-step-mark">${done ? "●" : active ? "◐" : "○"}</span>
        <span class="at-step-label">${escapeHtml(s.label)}</span>
        <span class="at-bar"><i style="width:${s.percent}%"></i></span>
        <span class="at-pct">${s.percent.toFixed(0)}%</span></div>`;
    }).join("")}</div>
    <div class="at-elapsed">${elapsed ? "経過 " + fmtSec(elapsed) : ""}</div>`;
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
    a.href = `${HELPER_BASE}/jobs/${currentJob}/download`;
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

function fmtSec(s) {
  s = Math.round(s);
  return s < 60 ? `${s} 秒` : `${Math.floor(s/60)} 分 ${String(s%60).padStart(2,"0")} 秒`;
}
function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
