// TC 表示変換ヘルパー

export function secondsToTC(sec, fps = 30) {
  if (sec == null || isNaN(sec)) return "--:--:--:--";
  if (sec < 0) sec = 0;
  const totalFrames = Math.round(sec * fps);
  const hours = Math.floor(totalFrames / (3600 * fps));
  const minutes = Math.floor((totalFrames % (3600 * fps)) / (60 * fps));
  const seconds = Math.floor((totalFrames % (60 * fps)) / fps);
  const frames = totalFrames % fps;
  const pad = n => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

export function tcToSeconds(tc, fps = 30) {
  if (!tc) return null;
  const raw = String(tc).trim();
  if (!raw || raw.includes("--")) return null;

  // コロン付きの正規表記：h:m:s:f
  if (raw.includes(":")) {
    const parts = raw.split(":").map(Number);
    if (parts.length !== 4) return null;
    const [h, m, s, f] = parts;
    if ([h, m, s, f].some(v => isNaN(v))) return null;
    return h * 3600 + m * 60 + s + f / fps;
  }

  // 連番入力：非数字を除去して右寄せ 8桁 HHMMSSFF として解釈
  //   "00000300" → 00:00:03:00
  //   "300"      → 00:00:03:00
  //   "3"        → 00:00:00:03
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const padded = digits.padStart(8, "0").slice(-8);
  const h = Number(padded.slice(0, 2));
  const m = Number(padded.slice(2, 4));
  const s = Number(padded.slice(4, 6));
  const f = Number(padded.slice(6, 8));
  if ([h, m, s, f].some(v => isNaN(v))) return null;
  return h * 3600 + m * 60 + s + f / fps;
}

// TC 入力フィールドにドラッグ編集を付与
// - クリック（動かさず離す）→ 入力モード（focus）
// - ドラッグ → スクラブ編集（Shift=1F, Ctrl=1秒, 通常=数F）
// - 入力モード中はドラッグ無効、フォーカス外せば再びドラッグ可
export function attachTcDrag(inputEl, fpsGetter, onCommit) {
  inputEl.style.cursor = "ew-resize";

  inputEl.addEventListener("mousedown", (e) => {
    // フォーカス済みなら通常の編集を許可
    if (document.activeElement === inputEl) return;
    e.preventDefault();
    const startX = e.clientX;
    const fps = fpsGetter();
    const startSec = tcToSeconds(inputEl.value, fps) ?? 0;
    let endSec = startSec;
    let didDrag = false;
    document.body.style.cursor = "ew-resize";

    const onMove = (ev) => {
      const fps2 = fpsGetter();
      const dx = ev.clientX - startX;
      if (!didDrag && Math.abs(dx) >= 3) didDrag = true;
      if (!didDrag) return;
      // 4px あたりの秒数変化
      let secPerStep;
      if (ev.shiftKey) secPerStep = 1 / fps2;          // 細：1F
      else if (ev.ctrlKey || ev.metaKey) secPerStep = 1; // 粗：1秒
      else secPerStep = 0.25;                            // 通常：0.25秒
      const steps = Math.round(dx / 4);
      endSec = Math.max(0, startSec + steps * secPerStep);
      inputEl.value = secondsToTC(endSec, fps2);
    };
    const onUp = () => {
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (didDrag) {
        onCommit(endSec);
      } else {
        // 動かなかった = クリックとみなして入力モードへ
        inputEl.focus();
        inputEl.select();
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}
