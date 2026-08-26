// 処理中の見張り
//
// これまでは、タイミング検出や動画書き出しのパネルが自分で進捗を見に行き、
// パネルを閉じると監視ごと止めていた。ヘルパー側の処理は続いているのに
// アプリが忘れてしまうので、他の作業をしていると終わったかどうか分からない。
//
// そこで見張りをパネルから切り離す。
//   - 画面の隅に出しっぱなしにして、どのタブにいても進み具合が見える
//   - 終わったらブラウザの通知を出す（席を外していても気づける）
//   - パネルを開き直せば、途中でも終わっていても続きが見られる

import { pollJob, fetchJob } from "./helper_client.js?v=2d47649";

const KINDS = {
  timing: { label: "タイミング自動検出", open: "btnAutoTiming" },
  export: { label: "動画書き出し",       open: "btnExportVideo" },
};

let el = null;                 // 隅に出す小さな表示
let job = null;                // { kind, jobId, status, steps, elapsed, error, startedAt }
let stopPoll = null;
const listeners = new Set();

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function current() { return job; }

/** その種類の処理が今も動いているか */
export function isRunning(kind) {
  return !!job && job.kind === kind && job.status === "running";
}

/** 終わっていて、まだ結果を見せていないもの */
export function pending(kind) {
  return !!job && job.kind === kind && (job.status === "done" || job.status === "error");
}

export function clear() {
  stopPoll?.(); stopPoll = null;
  job = null;
  paint();
}

/** 処理を始めたら呼ぶ。以降はパネルを閉じても見張り続ける */
export function start(kind, jobId) {
  stopPoll?.();
  job = { kind, jobId, status: "running", steps: [], elapsed: 0, error: null, result: null,
          startedAt: Date.now() };
  askNotifyPermission();
  paint();
  stopPoll = pollJob(jobId, {
    intervalMs: kind === "export" ? 1000 : 1500,
    onProgress: (steps, elapsed) => { job.steps = steps; job.elapsed = elapsed; emit(); paint(); },
    onDone: (d) => { job.result = d && d.result; job.elapsed = (d && d.elapsed) || job.elapsed; finish("done"); },
    onError: (msg) => { job.error = msg; finish("error"); },
  });
}

function finish(status) {
  if (!job) return;
  job.status = status;
  stopPoll = null;
  emit();
  paint();
  notify(status);
}

function emit() { for (const fn of listeners) fn(job); }

// ---- 通知 ----
// 許可を求められるのは操作の直後だけなので、始めたときに済ませておく。

function askNotifyPermission() {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") Notification.requestPermission();
  } catch (e) { /* 使えなくても進捗表示は出る */ }
}

function notify(status) {
  const name = KINDS[job.kind]?.label || "処理";
  const body = status === "done"
    ? "終わりました。画面を開いて結果を確認してください。"
    : "失敗しました。画面を開いて内容を確認してください。";
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const n = new Notification("うたみた05 — " + name, { body, tag: "utamita05-job" });
      n.onclick = () => { window.focus(); openPanel(); n.close(); };
      return;
    }
  } catch (e) { /* 下のタイトル点滅に落ちる */ }
  flashTitle(name + " が" + (status === "done" ? "終わりました" : "失敗しました"));
}

// 通知が使えないとき用。タブのタイトルを点滅させる
let titleTimer = null;
function flashTitle(msg) {
  const orig = document.title;
  let on = false;
  clearInterval(titleTimer);
  titleTimer = setInterval(() => {
    document.title = (on = !on) ? msg : orig;
  }, 1000);
  const stop = () => {
    clearInterval(titleTimer); titleTimer = null;
    document.title = orig;
    window.removeEventListener("focus", stop);
    document.removeEventListener("click", stop);
  };
  window.addEventListener("focus", stop);
  document.addEventListener("click", stop);
}

// ---- 隅の表示 ----

function openPanel() {
  const id = KINDS[job?.kind]?.open;
  if (id) document.getElementById(id)?.click();
}

function overallPercent() {
  const steps = job?.steps || [];
  if (!steps.length) return 0;
  const sum = steps.reduce((a, s) => a + (Number(s.percent) || 0), 0);
  return Math.min(99, sum / steps.length);
}

function nowStep() {
  const steps = job?.steps || [];
  const active = steps.find(s => (s.percent || 0) > 0 && (s.percent || 0) < 100);
  return (active || steps.find(s => (s.percent || 0) < 100) || {}).label || "";
}

function fmtElapsed(sec) {
  sec = Math.round(sec || 0);
  return sec < 60 ? sec + " 秒" : Math.floor(sec / 60) + " 分 " + String(sec % 60).padStart(2, "0") + " 秒";
}

export function init() {
  if (el) return;
  el = document.createElement("div");
  el.id = "jobStatus";
  el.className = "job-status";
  el.hidden = true;
  el.addEventListener("click", (e) => {
    if (e.target.closest(".job-close")) { clear(); return; }
    openPanel();
  });
  document.body.appendChild(el);
  paint();
}

function paint() {
  if (!el) return;
  if (!job) { el.hidden = true; return; }
  el.hidden = false;
  const name = KINDS[job.kind]?.label || "処理";
  if (job.status === "running") {
    const p = overallPercent();
    el.className = "job-status is-running";
    el.innerHTML =
      '<div class="job-head"><b>' + name + '</b><span class="job-pct">' + p.toFixed(0) + '%</span></div>' +
      '<div class="job-bar"><i style="width:' + p.toFixed(1) + '%"></i></div>' +
      '<div class="job-sub">' + (nowStep() || "処理中") + '　' + fmtElapsed(job.elapsed) + '</div>' +
      '<div class="job-sub job-hint">クリックで画面を開く</div>';
  } else {
    const ok = job.status === "done";
    el.className = "job-status " + (ok ? "is-done" : "is-error");
    el.innerHTML =
      '<button class="job-close" title="消す">×</button>' +
      '<div class="job-head"><b>' + name + '</b></div>' +
      '<div class="job-sub">' + (ok ? "終わりました" : "失敗しました") + '　' + fmtElapsed(job.elapsed) + '</div>' +
      '<div class="job-sub job-hint">クリックで結果を開く</div>';
  }
}

/** ヘルパーが再起動していないか、開いたときに念のため確かめる */
export async function refresh() {
  if (!job || job.status !== "running") return;
  try { await fetchJob(job.jobId); } catch (e) {
    if (e.gone) { job.error = e.message; finish("error"); }
  }
}
