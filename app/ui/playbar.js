// 下部の再生バー：再生制御、TC表示、マーキング

import { getProject, getUi, setProject, setUi } from "./state.js?v=ff7bff3";
import * as ops from "../core/operations.js?v=ff7bff3";
import { secondsToTC } from "./tc.js?v=ff7bff3";

let player, playBtn, loopBtn, markingBtn, markInBtn, markOutBtn;
let currentTCEl, totalTCEl, progressFill, progressMarker, progressBar;
let state = { loopRange: null, loopLineId: null };

function clearLoop() {
  state.loopRange = null;
  state.loopLineId = null;
}

export function init() {
  player = document.getElementById("player");
  playBtn = document.getElementById("playBtn");
  loopBtn = document.getElementById("loopBtn");
  markingBtn = document.getElementById("markingBtn");
  markInBtn = document.getElementById("markInBtn");
  markOutBtn = document.getElementById("markOutBtn");
  currentTCEl = document.getElementById("currentTC");
  totalTCEl = document.getElementById("totalTC");
  progressFill = document.getElementById("progressFill");
  progressMarker = document.getElementById("progressMarker");
  progressBar = document.getElementById("playbarProgress");

  playBtn.addEventListener("click", togglePlay);
  loopBtn.addEventListener("click", () => {
    setUi({ loopCurrentRow: !getUi().loopCurrentRow });
    updateButtonStates();
  });
  markingBtn.addEventListener("click", () => {
    // getUi() は状態そのものを返すので、setUi のあとに読むと新しい値になる。
    // 切り替え後の値を先に持っておく（ここを取り違えると判定が逆になる）。
    const next = !getUi().markingMode;
    setUi({ markingMode: next });
    if (next) {
      // マーキング中は通し再生。ループ指定が残っていると再生がすぐ止まる
      setUi({ loopCurrentRow: false });
      clearLoop();
    }
    updateButtonStates();
  });
  markInBtn.addEventListener("click", markIn);
  markOutBtn.addEventListener("click", markOut);

  progressBar.addEventListener("click", (e) => {
    const rect = progressBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (!isNaN(player.duration)) {
      player.currentTime = pct * player.duration;
      clearLoop();
    }
  });

  player.addEventListener("timeupdate", onTimeUpdate);
  player.addEventListener("loadedmetadata", () => {
    totalTCEl.textContent = secondsToTC(player.duration, getProject().fps);
  });

  updateButtonStates();
}

export function render() {
  updateButtonStates();
  totalTCEl.textContent = secondsToTC(player.duration || getProject().music.duration || 0, getProject().fps);
}

function updateButtonStates() {
  const ui = getUi();
  loopBtn.classList.toggle("active", ui.loopCurrentRow);
  markingBtn.classList.toggle("active", ui.markingMode);
}

function togglePlay() {
  if (!player.src) return;
  if (player.paused) {
    // 再生位置がループの範囲外なら、その指定はもう用済み。
    // 残しておくと「範囲の終わりを過ぎている」と判定されて即座に止まる。
    const t = player.currentTime;
    if (state.loopRange && (t < state.loopRange.start || t >= state.loopRange.end)) clearLoop();
    player.play();
  } else {
    player.pause();
  }
  playBtn.textContent = player.paused ? "▶" : "⏸";
}

function onTimeUpdate() {
  const t = player.currentTime;
  const fps = getProject().fps;
  currentTCEl.textContent = secondsToTC(t, fps);
  // ui.currentTime の setUi は毎 timeupdate 全再レンダを引き起こしてたので削除。

  // マーキング中は通し再生。ループも自動停止もしない
  if (getUi().markingMode) { updateProgress(t); return; }

  // ループ判定：ループ対象行の tIn/tOut は毎回プロジェクトから引く（TC 変更を追随）
  if (state.loopLineId != null) {
    const line = getProject().lines.find(l => l.id === state.loopLineId);
    if (line && line.tIn != null) {
      const loopStart = line.tIn;
      const loopEnd = (line.tOut != null && line.tOut > line.tIn) ? line.tOut : (line.tIn + 5);
      state.loopRange = { start: loopStart, end: loopEnd };
    }
  }
  if (state.loopRange && t >= state.loopRange.end) {
    if (getUi().loopCurrentRow) {
      player.currentTime = state.loopRange.start;
    } else {
      player.pause();
      playBtn.textContent = "▶";
    }
  }

  updateProgress(t);
}

function updateProgress(t) {
  const dur = player.duration || 1;
  const pct = (t / dur) * 100;
  progressFill.style.width = pct + "%";
  progressMarker.style.left = pct + "%";
}

// 選択中の行を再生（外部から呼ばれる）
// markingMode ではループ無しで通し再生、それ以外は IN〜OUT でループ。
// tIn が null（未マーク）の行は seek せず、現在の再生は維持。
export function playRow(lineId) {
  const project = getProject();
  const ui = getUi();
  const line = project.lines.find(l => l.id === lineId);
  if (!line) return;
  if (!player.src) return;

  if (line.tIn == null) {
    // TC未設定：再生中なら継続、停止中なら現在位置から再生開始
    if (player.paused) {
      player.play().catch(() => {});
      playBtn.textContent = "⏸";
    }
    return;
  }

  if (ui.markingMode) {
    clearLoop();
    player.currentTime = line.tIn;
  } else {
    const tOut = line.tOut != null ? line.tOut : line.tIn + 5;
    state.loopRange = { start: line.tIn, end: tOut };
    state.loopLineId = line.id;  // TC 変更を追随するために lineId を覚える
    player.currentTime = line.tIn;
  }
  // 必ず再生（停止中でも再開）
  player.play().catch(() => {});
  playBtn.textContent = "⏸";
}

function markIn() {
  const ui = getUi();
  if (ui.selectedLineIds.size === 0) return;
  const id = [...ui.selectedLineIds][0];
  const t = player.currentTime;
  setProject(ops.setLineIn(getProject(), id, t));
  flashRow(id, "in");
  flashBtn(markInBtn, "flash-in");
}

function markOut() {
  const ui = getUi();
  if (ui.selectedLineIds.size === 0) return;
  const id = [...ui.selectedLineIds][0];
  const t = player.currentTime;
  setProject(ops.setLineOut(getProject(), id, t));
  flashRow(id, "out");
  flashBtn(markOutBtn, "flash-out");
}

function flashRow(id, kind) {
  const el = document.querySelector(`.lyric-row[data-id="${id}"]`);
  if (!el) return;
  const cls = kind === "in" ? "flash-in" : "flash-out";
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 280);
}

function flashBtn(el, cls) {
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 200);
}
