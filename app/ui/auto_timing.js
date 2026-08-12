// タイミング自動検出パネル
//
// 重い処理（ボーカル分離・書き起こし）はローカルヘルパーに任せる。
// アプリ本体は GitHub Pages のままなので、push すれば全員最新という利点は保たれる。
// https のページから http://localhost を叩けることは検証済み
// （ヘルパー側が CORS と Access-Control-Allow-Private-Network を返す）。
//
// ヘルパーが無くても、tools/auto_timing.py が出した timing.json を
// 直接読み込む経路を用意してあるので、そちらだけでも実用できる。

import { getProject, setProject, getUi } from "./state.js?v=90b2bb6";
import * as ops from "../core/operations.js?v=90b2bb6";
import { escapeHtml } from "../core/html.js?v=90b2bb6";
import { pingHelper, startJob, pollJob, fetchResult, cancelJob,
         helperStatusHtml, helperMissingHtml, stepsHtml, fmtSec } from "./helper_client.js?v=90b2bb6";

const POLL_MS = 1500;

let overlayEl = null;
let stopPoll = null;
let currentJob = null;

export function init() {
  const btn = document.getElementById("btnAutoTiming");
  if (btn) btn.addEventListener("click", open);
}

// ────────────────────────────────── パネル

function open() {
  if (overlayEl) return;
  overlayEl = document.createElement("div");
  overlayEl.className = "at-overlay";
  overlayEl.innerHTML = `
    <div class="at-panel">
      <div class="at-head">
        <div class="at-title">タイミング自動検出</div>
        <button class="at-close" id="atClose">×</button>
      </div>
      <div class="at-body" id="atBody"></div>
    </div>`;
  document.body.appendChild(overlayEl);
  overlayEl.querySelector("#atClose").addEventListener("click", close);
  overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) close(); });
  renderIdle();
  checkHelper();
}

function close() {
  stopPoll?.(); stopPoll = null;
  overlayEl?.remove();
  overlayEl = null;
}

function body() { return overlayEl?.querySelector("#atBody"); }

function lyricLines() {
  return getProject().lines.map(l => (l.text || "").replace(/\\n/g, " ").trim()).filter(Boolean);
}

// ────────────────────────────────── 待機画面

function renderIdle(helperState = "checking") {
  const el = body(); if (!el) return;
  const n = lyricLines().length;
  const audio = getUi().audioFile;

  el.innerHTML = `
    ${helperStatusHtml(helperState)}

    <div class="at-section">
      <div class="at-row"><span>歌詞</span><b>${n} 行</b></div>
      <div class="at-row"><span>楽曲</span><b>${audio ? escapeHtml(audio.name || "読込済み") : "未読込"}</b></div>
    </div>

    ${helperState === "ng" ? helperMissingHtml(
        "<br>ヘルパー無しでも、<code>auto_timing.py</code> が出力した " +
        "<code>timing.json</code> を下のボタンから読み込めます。") : ``}

    <div class="at-actions">
      <button class="tool-btn at-primary" id="atRun"
        ${helperState === "ok" && audio && n ? "" : "disabled"}>自動検出を実行</button>
      <button class="tool-btn" id="atLoad">結果ファイルを読み込む</button>
      <input type="file" id="atFile" accept=".json,application/json" style="display:none">
    </div>

    ${!audio ? `<div class="at-warn">先にヘッダの「楽曲読込」で曲を読み込んでください。</div>` : ``}
    ${!n ? `<div class="at-warn">歌詞が 1 行もありません。</div>` : ``}
  `;

  el.querySelector("#atRun")?.addEventListener("click", run);
  el.querySelector("#atLoad")?.addEventListener("click", () => el.querySelector("#atFile").click());
  el.querySelector("#atFile")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      renderReview(JSON.parse(await f.text()));
    } catch (err) {
      alert("JSON として読めませんでした: " + err.message);
    }
  });
}

async function checkHelper() {
  renderIdle(await pingHelper());
}

// ────────────────────────────────── 実行と進捗

async function run() {
  const audio = getUi().audioFile;
  const lines = lyricLines();
  if (!audio || !lines.length) return;

  const fd = new FormData();
  fd.append("song", audio, audio.name || "song.bin");
  fd.append("lines", JSON.stringify(lines));
  fd.append("model", "medium");

  renderProgress([], 0, "送信しています…");
  try {
    currentJob = await startJob("/jobs", fd);
    stopPoll = pollJob(currentJob, {
      intervalMs: POLL_MS,
      onProgress: (steps, elapsed) => renderProgress(steps, elapsed),
      onDone: async () => renderReview(await fetchResult(currentJob)),
      onError: (msg) => renderError(msg),
    });
  } catch (e) {
    renderError(String(e.message || e));
  }
}

function renderProgress(steps, elapsed, note) {
  const el = body(); if (!el) return;
  el.innerHTML = stepsHtml(steps, elapsed, note)
    + `<div class="at-elapsed">処理中は他のタブを操作できます</div>
       <div class="at-actions"><button class="tool-btn tool-btn-danger" id="atCancel">中止</button></div>`;
  el.querySelector("#atCancel")?.addEventListener("click", onCancel);
}

async function onCancel() {
  stopPoll?.(); stopPoll = null;
  await cancelJob(currentJob);
  currentJob = null;
  renderIdle("ok");
}

function renderError(msg) {
  const el = body(); if (!el) return;
  el.innerHTML = `
    <div class="at-warn">${escapeHtml(msg)}</div>
    <div class="at-actions"><button class="tool-btn" id="atBack">戻る</button></div>`;
  el.querySelector("#atBack").addEventListener("click", () => { currentJob = null; renderIdle(); checkHelper(); });
}

// ────────────────────────────────── 結果の確認と適用

function renderReview(result) {
  const el = body(); if (!el) return;
  const lines = result?.lines || [];
  const cov = result?.kanaCoverage;
  const project = getProject();

  // 既に TC が入っている行は差分を見せる（黙って上書きしない）
  const rows = lines.map((r, i) => {
    const cur = project.lines[i];
    const before = cur?.tIn;
    const diff = (before != null && r.tIn != null) ? (r.tIn - before) : null;
    return `<tr>
      <td>${i}</td>
      <td class="at-t">${before != null ? before.toFixed(2) : "—"}</td>
      <td class="at-t"><b>${r.tIn != null ? r.tIn.toFixed(2) : "—"}</b></td>
      <td class="at-t ${diff != null && Math.abs(diff) > 1 ? "at-big" : ""}">${diff != null ? (diff >= 0 ? "+" : "") + diff.toFixed(2) : ""}</td>
      <td class="at-lyr">${escapeHtml(r.text || "")}</td>
    </tr>`;
  }).join("");

  const covWarn = (cov != null && cov < 0.7)
    ? `<div class="at-warn">歌詞と音声の一致率が <b>${(cov*100).toFixed(0)}%</b> と低いため、
       結果が大きくずれている可能性があります。適用前に確認してください。</div>`
    : (cov != null ? `<div class="at-note">歌詞と音声の一致率 <b>${(cov*100).toFixed(0)}%</b></div>` : ``);

  el.innerHTML = `
    ${covWarn}
    <div class="at-note">検出 ${lines.length} 行 ／ 処理時間 ${fmtSec(result?.elapsed || 0)}</div>
    <div class="at-table-wrap">
      <table class="at-table">
        <thead><tr><th>#</th><th>現在</th><th>検出</th><th>差</th><th>歌詞</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="at-actions">
      <button class="tool-btn at-primary" id="atApply">${lines.length} 行に適用</button>
      <button class="tool-btn" id="atApplyEmpty">TC が空の行だけ適用</button>
      <button class="tool-btn" id="atBack2">戻る</button>
    </div>`;

  el.querySelector("#atApply").addEventListener("click", () => apply(lines, false));
  el.querySelector("#atApplyEmpty").addEventListener("click", () => apply(lines, true));
  el.querySelector("#atBack2").addEventListener("click", () => { currentJob = null; renderIdle(); checkHelper(); });
}

// 1 回の setProject にまとめる（Undo 1 手で全部戻せるように）
function apply(lines, onlyEmpty) {
  const p = getProject();
  const byIndex = new Map(lines.map(r => [r.index, r]));
  const next = p.lines.map((l, i) => {
    const r = byIndex.get(i);
    if (!r || r.tIn == null) return l;
    if (onlyEmpty && l.tIn != null) return l;
    return { ...l, tIn: r.tIn, tOut: r.tOut ?? l.tOut };
  });
  setProject({ ...p, lines: next, updatedAt: Date.now() });
  close();
}

// ────────────────────────────────── 小物


