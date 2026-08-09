// 行レイヤーのラスタライズ
//
// プレビューの DOM をそのまま SVG の foreignObject に入れて画像化する。
// Canvas 2D で描き直さないので、プレビューと動画が必ず同じ絵になる。
//
// 実測でわかっている制約（いずれも回避済み）:
//   - blob: URL で SVG を読むと canvas が汚染されて書き出せない → data: URL を使う
//   - CSS 変数は隔離された文書で解決されない → 実値に展開してから入れる
//   - 外部参照（blob: の画像/動画）は SVG 内から読めない → 背景は ffmpeg 側で合成する

const CSS_VARS = {
  "--navy": "#1E2761", "--navy-2": "#2A3A8C", "--navy-3": "#151A4A",
  "--ice": "#CADCFC", "--coral": "#F96167", "--gold": "#F9E795",
  "--white": "#FFFFFF", "--gray-1": "#F1F4F9", "--gray-2": "#DEE3EC",
  "--gray-3": "#A5ACB8", "--gray-4": "#5B6273", "--gray-5": "#2F3441",
  "--dark": "#0F142A",
};

// var(--x, fallback) を実値へ展開する
function expandVars(html) {
  return html.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (m, name, fb) => {
    return CSS_VARS[name] || (fb || "").trim() || "transparent";
  });
}

/**
 * プレビューのステージ要素を、背景ぬきの透過 PNG にする。
 * @param {HTMLElement} stageEl  #linePreview の中のステージ div
 * @param {number} w  出力幅（例 1920）
 * @param {number} h  出力高さ（例 1080）
 * @returns {Promise<Blob>} PNG
 */
export async function renderLineLayer(stageEl, w, h) {
  const clone = stageEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  clone.style.width = w + "px";
  clone.style.height = h + "px";
  clone.style.aspectRatio = "";
  // 動画には背景も枠もガイドも要らない（背景は ffmpeg 側で敷く）
  clone.style.background = "transparent";
  clone.style.border = "none";
  clone.style.borderRadius = "0";
  clone.style.boxShadow = "none";

  for (const el of [...clone.querySelectorAll("div, img, video")]) {
    const s = el.getAttribute("style") || "";
    // 配置ガイド（点線・中央の赤線）と背景素材を除去
    if (s.includes("dashed") || s.includes("rgba(255,80,80")) { el.remove(); continue; }
    if (el.tagName === "IMG" || el.tagName === "VIDEO") { el.remove(); continue; }
    if (s.includes("mix-blend-mode") && s.includes("position:absolute;inset:0")) el.remove();
  }

  const html = expandVars(new XMLSerializer().serializeToString(clone));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`
            + `<foreignObject width="${w}" height="${h}">${html}</foreignObject></svg>`;

  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await new Promise((ok, ng) => {
    img.onload = ok;
    img.onerror = () => ng(new Error("レイヤーの画像化に失敗しました"));
  });

  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);

  // 絵があるのは画面のごく一部なので、その範囲だけ切り出す。
  // 全画面のまま渡すと ffmpeg が 1 行ごとに全面を合成することになり、
  // 行数が増えるほど書き出しが極端に遅くなる。
  const box = alphaBounds(g, w, h);
  if (!box) {
    // 完全に透明（歌詞が空など）。1px だけ返して合成対象から外れるようにする
    const e = document.createElement("canvas");
    e.width = e.height = 1;
    return { blob: await toBlob(e), x: 0, y: 0, w: 1, h: 1, empty: true };
  }

  const cut = document.createElement("canvas");
  cut.width = box.w; cut.height = box.h;
  cut.getContext("2d").drawImage(c, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return { blob: await toBlob(cut), x: box.x, y: box.y, w: box.w, h: box.h, empty: false };
}

function toBlob(canvas) {
  return new Promise(r => canvas.toBlob(r, "image/png"));
}

/** 不透明な画素が存在する範囲を返す。全部透明なら null。 */
function alphaBounds(ctx, w, h, margin = 2) {
  const d = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (d[row + x * 4 + 3] !== 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  minX = Math.max(0, minX - margin); minY = Math.max(0, minY - margin);
  maxX = Math.min(w - 1, maxX + margin); maxY = Math.min(h - 1, maxY + margin);
  // 幅は偶数にしておく（動画コーデックの都合で奇数を嫌う場面があるため）
  let bw = maxX - minX + 1, bh = maxY - minY + 1;
  if (bw % 2) { bw = Math.min(bw + 1, w - minX); }
  if (bh % 2) { bh = Math.min(bh + 1, h - minY); }
  return { x: minX, y: minY, w: bw, h: bh };
}
