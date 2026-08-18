// ローカルヘルパーとのやりとり
//
// タイミング自動検出と動画書き出しの両方から使う。
// 以前はポート番号・接続確認・進捗ポーリング・工程表示が
// 2 ファイルに重複していて、片方だけ直すと不整合になる状態だった。

import { escapeHtml } from "../core/html.js?v=ff7bff3";

// ポート番号はここだけ。ヘルパー側の UTAMITA_HELPER_PORT と合わせる。
export const HELPER_BASE = "http://127.0.0.1:8777";

/** ヘルパーが起動しているか。戻り値 "ok" | "ng" */
export async function pingHelper(timeoutMs = 3000) {
  try {
    const r = await fetch(`${HELPER_BASE}/ping`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok ? "ok" : "ng";
  } catch {
    return "ng";
  }
}

/** multipart を投げてジョブを開始し、jobId を返す */
export async function startJob(path, formData) {
  const r = await fetch(`${HELPER_BASE}${path}`, { method: "POST", body: formData });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.jobId) throw new Error(d.error || "ジョブを開始できませんでした");
  return d.jobId;
}

export async function fetchJob(jobId, timeoutMs = 10000) {
  const r = await fetch(`${HELPER_BASE}/jobs/${jobId}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (r.status === 404) {
    const e = new Error("ジョブが見つかりません（ヘルパーが再起動された可能性があります）");
    e.gone = true;
    throw e;
  }
  return await r.json();
}

export async function fetchResult(jobId) {
  const r = await fetch(`${HELPER_BASE}/jobs/${jobId}/result`);
  return await r.json();
}

export function downloadUrl(jobId) {
  return `${HELPER_BASE}/jobs/${jobId}/download`;
}

export async function cancelJob(jobId) {
  try { await fetch(`${HELPER_BASE}/jobs/${jobId}/cancel`, { method: "POST" }); } catch {}
}

/**
 * 完了・失敗まで一定間隔で見にいく。
 * onProgress(steps, elapsed) / onDone(job) / onError(message)
 * 戻り値: 監視を止める関数
 */
export function pollJob(jobId, { intervalMs = 1000, onProgress, onDone, onError, maxFails = 15 } = {}) {
  let timer = null;
  let stopped = false;
  let fails = 0;

  const stop = () => { stopped = true; if (timer) { clearTimeout(timer); timer = null; } };

  // 書き出し中は ffmpeg が CPU とメモリを占有するため、問い合わせへの応答が
  // 一時的に遅れたり失敗したりする。1 回の失敗で諦めると誤って
  // 「通信が切れました」を出してしまうので、続けて失敗したときだけ諦める。
  //
  // setInterval だと応答が間隔より遅いときにリクエストが重なるので、
  // 1 回終えてから次を予約する形にしている。
  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(step, intervalMs);
  };

  const step = async () => {
    if (stopped) return;
    try {
      const d = await fetchJob(jobId);
      fails = 0;
      if (d.status === "running") {
        onProgress?.(d.steps || [], d.elapsed || 0);
        schedule();
      } else if (d.status === "done") {
        stop(); onDone?.(d);
      } else if (d.status === "error") {
        stop(); onError?.(d.error || "処理に失敗しました");
      } else {
        schedule();   // 想定外の応答は次回に賭ける
      }
    } catch (e) {
      if (e.gone) { stop(); onError?.(e.message); return; }
      fails++;
      if (fails >= maxFails) {
        stop();
        onError?.(`ヘルパーからの応答が ${fails} 回続けてありませんでした。`
                + `処理は裏で続いている可能性があります。`);
        return;
      }
      schedule();
    }
  };

  step();
  return stop;
}

// ---- 表示部品 ----

/** 接続状態の 1 行。state: "checking" | "ok" | "ng" */
export function helperStatusHtml(state) {
  const dot = { checking: "at-dot-wait", ok: "at-dot-ok", ng: "at-dot-ng" }[state] || "at-dot-wait";
  const msg = {
    checking: "ヘルパーを確認しています…",
    ok: "ヘルパーに接続できました",
    ng: "ヘルパーが見つかりません",
  }[state] || "";
  return `<div class="at-status"><span class="at-dot ${dot}"></span> ${msg}</div>`;
}

/** ヘルパーが無いときの案内。Windows と Mac で入れ方が違うので出し分ける */
export function helperMissingHtml(extra = "") {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
  const intro = `<b>この PC に音声処理のソフトを入れます</b>`
    + `（ffmpeg と Python 用の部品。合わせて <b>1〜2GB</b>、10〜30 分）。`
    + `入れ終わると、次回からは起動時に自動で立ち上がります。`;

  // Windows：.bat を保存してダブルクリック。
  //   同じ GitHub Pages から配るので download 属性が効く
  //   （別サイトに置くと保存ではなく表示になってしまう）。
  const win = `
    下のボタンで <code>setup_helper.bat</code> を保存し、<b>ダブルクリック</b>してください。
    ${intro}
    <div class="at-actions" style="margin:8px 0 6px">
      <a class="tool-btn at-primary" href="../tools/setup_helper.bat" download="setup_helper.bat"
         style="text-decoration:none">セットアップを保存する</a>
    </div>
    ソフトを入れる操作なので、Windows が<b>「発行元を確認できません」と必ず警告します</b>。
    <b>詳細情報 → 実行</b> を選んでください。`;

  // Mac：ダウンロードしたファイルには実行権限が付かず Gatekeeper にも止められるため、
  //   ファイルを配らずターミナルの 1 行で済ませる。
  const macHtml = `
    <b>ターミナル</b>を開いて、下の 1 行を貼り付けて Enter を押してください。
    ${intro}
    <div style="margin:8px 0 6px">
      <code id="hxCmd" style="display:block;padding:8px;background:var(--gray-1);border-radius:4px;
        font-size:11px;word-break:break-all;user-select:all">curl -fsSL https://katzkey.github.io/utamita05/tools/setup_helper.sh | bash</code>
      <button class="tool-btn" id="hxCopy" style="margin-top:6px;font-size:11px">この 1 行をコピー</button>
    </div>
    ターミナルは <b>アプリケーション → ユーティリティ</b> にあります。
    Launchpad で「ターミナル」と打っても出ます。<br>
    <b>.bat のファイルは Mac では使えません</b>（Windows 用です）。`;

  return `<div class="at-note">
    <b>はじめての方</b><br>
    ${mac ? macHtml : win}<br>
    <br>
    <b>すでに入れてある方</b><br>
    ヘルパーが止まっているだけです。${mac
      ? `ターミナルで <code>launchctl load ~/Library/LaunchAgents/com.utamita05.helper.plist</code> を実行するか、`
        + `いったんログインし直してから、もう一度開いてください。`
      : `<code>tools</code> フォルダの <code>start_helper.bat</code> をダブルクリックしてから、`
        + `もう一度開いてください。`}${extra}
  </div>`;
}

/** 案内の中のコピーボタンを動かす（描画のあとに呼ぶ） */
export function bindHelperMissing(root) {
  const btn = root?.querySelector("#hxCopy");
  const cmd = root?.querySelector("#hxCmd");
  if (!btn || !cmd) return;
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(cmd.textContent.trim());
      btn.textContent = "コピーしました";
      setTimeout(() => { btn.textContent = "この 1 行をコピー"; }, 1500);
    } catch {
      // クリップボードが使えない環境では、選択させるだけにする
      const r = document.createRange();
      r.selectNodeContents(cmd);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      btn.textContent = "手でコピーしてください";
    }
  });
}

/** 工程を箇条書きにして、それぞれに % を出す */
export function stepsHtml(steps, elapsed, note) {
  const rows = (steps || []).map(s => {
    const done = s.percent >= 100;
    const active = !done && s.percent > 0;
    return `<div class="at-step ${done ? "is-done" : active ? "is-active" : ""}">
      <span class="at-step-mark">${done ? "●" : active ? "◐" : "○"}</span>
      <span class="at-step-label">${escapeHtml(s.label)}</span>
      <span class="at-bar"><i style="width:${s.percent}%"></i></span>
      <span class="at-pct">${s.percent.toFixed(0)}%</span>
    </div>`;
  }).join("");
  return `<div class="at-steps">${rows || `<div class="at-note">${escapeHtml(note || "")}</div>`}</div>
    <div class="at-elapsed">${elapsed ? "経過 " + fmtSec(elapsed) : ""}</div>`;
}

export function fmtSec(s) {
  s = Math.round(s || 0);
  return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${String(s % 60).padStart(2, "0")} 秒`;
}
