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
  c.getContext("2d").drawImage(img, 0, 0);
  return await new Promise(r => c.toBlob(r, "image/png"));
}
