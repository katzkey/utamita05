// 行の見た目を HTML として組み立てる
//
// ここは「行データ → HTML 文字列」の変換だけを持ち、状態には触らない。
// 詳細ペインのプレビュー（この行 / 曲に合わせて）と動画書き出しから使うので、
// UI の都合（選択状態や再描画）とは切り離してある。
//
// 動画書き出しでは、ここが返した HTML をそのまま画像化する。
// プレビューと完成品を必ず一致させるため、描き方を二重に持たない。

import { getBlobUrl as getFileBlobUrl } from "./blob_registry.js?v=db39581";
import { cssFamilyFor, labelFor } from "./fonts_loader.js?v=db39581";
import { parseJitterBlocks, jitterOffsetFor } from "./utils.js?v=db39581";
import { SMALL_KANA, classifyChar, autoKerningEm } from "./char_type.js?v=db39581";
import { escapeHtml } from "./html.js?v=db39581";

// フォントごとの「行ボックスの中心」と「文字のインクの中心」のずれ（em、＋で文字が下寄り）。
//
// 行ボックスの高さはフォントの上下（fontBoundingBox）で決まるが、その上下は
// 欧文のアクセントや下ぶら下がりの分を含むため、和文の字面は真ん中に来ない。
// 座布団をそのまま行ボックスに合わせると、フォントによって上下どちらかへ寄る。
// 実測は 0.075em〜-0.06em（60px で ±4px 前後）あり、目で分かる差になる。
//
// 縦組みは字面が列の中央に来るので補正しない（ラスタライズして実測、ずれ 0px）。
const inkOffsetCache = new Map();
let inkCanvas = null;
function inkCenterOffsetEm(cssFam, italic, lineHeight) {
  const key = `${cssFam}|${italic ? 1 : 0}|${lineHeight}`;
  if (inkOffsetCache.has(key)) return inkOffsetCache.get(key);
  let v = 0;
  try {
    inkCanvas = inkCanvas || document.createElement("canvas");
    const c = inkCanvas.getContext("2d");
    c.font = `${italic ? "italic " : ""}100px '${String(cssFam).replace(/'/g, "\\'")}', system-ui, sans-serif`;
    const m = c.measureText("国");     // 字面いっぱいの全角字を基準にする
    const fa = m.fontBoundingBoxAscent / 100, fd = m.fontBoundingBoxDescent / 100;
    const asc = m.actualBoundingBoxAscent / 100, des = m.actualBoundingBoxDescent / 100;
    if ([fa, fd, asc, des].every(n => isFinite(n))) {
      const baseline = (lineHeight - (fa + fd)) / 2 + fa;   // 行ボックス上端からベースラインまで
      v = (baseline + (des - asc) / 2) - lineHeight / 2;    // インクの中心 − 行ボックスの中心
    }
  } catch (e) {
    v = 0;   // 測れない環境では補正しない（今までどおりの位置）
  }
  inkOffsetCache.set(key, v);
  return v;
}

// プレビューのステージ枠。
// 「この行」と「曲に合わせて」で枠の見た目・寸法が変わらないよう、一箇所に置く。
export function previewStageStyle(project) {
  const w = project.resolution?.w || 1920;
  const h = project.resolution?.h || 1080;
  return `container-type:inline-size;width:100%;aspect-ratio:${w}/${h};background:#101014;`
       + `border:1px solid var(--gray-5,#333);border-radius:4px;position:relative;overflow:hidden`;
}

// 選択行のプレビュー：最終解像度の比率のステージ上に、AE と同じ配置ルールで描画
// - Y: layoutToY 相当（top=15% / center=50% / bottom=85%）+ dy
// - X: 中央 + dx（AE 側と同じ）
// - フォントサイズ等は cqw 単位（ステージ幅基準）で解像度比スケール
// 動画書き出しでも同じ絵を使うため公開している（app/ui/video_export.js が利用）
export function renderLinePreviewHtml(line, project) {
  const resW = project.resolution?.w || 1920;
  const resH = project.resolution?.h || 1080;
  const familyValue = line.fontOverride?.family || project.font.family || "";
  const cssFam = cssFamilyFor(familyValue);
  const rawSize = line.fontOverride?.size || project.font.size || 48;
  const tracking = Number(line.tracking) || 0;

  // AE 実寸 → ステージ幅基準の cqw 換算（1cqw = ステージ幅の1%）
  const toCqw = (px) => (px / resW * 100);
  const fontCqw = toCqw(rawSize);
  // char モードの文字送りは ratio = 1.10 + tracking → 余白分 = (0.10 + tracking) * fontSize
  const letterCqw = toCqw((0.10 + tracking) * rawSize);

  const layout = String(line.layout || "h_bottom");
  const vertical = /^v[lrc]_/.test(layout);

  const dx = line.pos?.dx || 0;
  const dy = line.pos?.dy || 0;
  const scale = line.pos?.scale ?? 1.0;
  const rot = line.pos?.rot || 0;

  const text = (line.text || "");
  const htmlText = buildLineInnerHtml(line, { resW, resH, toCqw, rawSize }) || "<span style='opacity:.4'>（歌詞なし）</span>";

  // 位置は % 指定（absolute 配置の % はステージ寸法基準なので確実）
  let leftPct, topPct, translate;
  if (vertical) {
    // 縦組み：列 X = vl:15% / vc:50% / vr:85%、Y は top/center/bottom で列のアンカーが変わる
    let xPct = 50;
    if (layout.startsWith("vl_")) xPct = 15;
    else if (layout.startsWith("vr_")) xPct = 85;
    leftPct = xPct + (dx / resW * 100);
    if (layout.includes("top"))         { topPct = 15 + (dy / resH * 100); translate = "translate(-50%, 0)"; }
    else if (layout.includes("bottom")) { topPct = 85 + (dy / resH * 100); translate = "translate(-50%, -100%)"; }
    else                                { topPct = 50 + (dy / resH * 100); translate = "translate(-50%, -50%)"; }
  } else {
    // 横組み：X 中央、Y = top:15% / center:50% / bottom:85%
    let yPct = 50;
    if (layout.includes("top")) yPct = 15;
    else if (layout.includes("bottom")) yPct = 85;
    leftPct = 50 + (dx / resW * 100);
    topPct = yPct + (dy / resH * 100);
    translate = "translate(-50%, -50%)";
  }

  // 座布団：perBlock=false のとき text と分離した absolute layer で描画
  // （blur 等が text に影響しないよう別 div にする）
  const zab = line.zabuton;
  const perBlockZab = !!(zab && zab.enabled && zab.perBlock);
  const filterId = `zab-blur-${line.id}`;
  // 座布団の長辺のおおよその長さ（cqw）。
  // ギザギザの歯を「行の長さに関わらず同じ大きさ」にするために渡す。
  const zabSpanCqw = (() => {
    const rows = String(text).split(/\\n|\n/);
    const maxChars = Math.max(1, ...rows.map(s => [...s].length));
    const adv = fontCqw + letterCqw;                 // 1 文字あたりの送り
    // 縦組みは列の高さが長辺、横組みは行の幅が長辺
    const pad = toCqw(2 * ((vertical ? zab?.paddingY : zab?.paddingX) ?? 0));
    return maxChars * adv + pad;
  })();
  // 行ごとにちぎれ方を変える（同じ形が並ぶと切り抜きに見えるため）
  const zabSeed = (Number(zab?.edge?.seed) || 1) + (Number(line.id) || 0) * 977;
  // 縦組みは字面が列の中央に来るので補正しない
  const zabShiftEm = vertical ? 0 : inkCenterOffsetEm(cssFam, !!line.fontOverride?.italic, 1.3);
  const zabResult = (zab && zab.enabled && !perBlockZab)
    ? buildZabLayerCss(zab, toCqw, vertical, filterId, zabSpanCqw, zabSeed, zabShiftEm, fontCqw)
    : { css: "", svgDef: "" };
  const zabLayerHtml = zabResult.css
    ? `${zabResult.svgDef}<div style="${zabResult.css}"></div>`
    : '';

  // 下線（アンダーライン）
  //  style="solid"    : 横組みは text の下 / 縦組みは左（1 本の連続線）
  //  style="brackets" : 読む方向の両端に線（横=左右、縦=上下）
  //  texture="scratchy": SVG feTurbulence で線に カスレ 効果
  const ul = line.underline;
  let underlineHtml = '';
  let underlineSvgDef = '';
  if (ul && ul.enabled) {
    const w = toCqw(Math.max(0.5, Number(ul.width) || 2));
    const off = toCqw(Math.max(0, Number(ul.offset) || 4));
    const ext = toCqw(Math.max(0, Number(ul.extend) || 0));
    const col = ul.color || "#FFFFFF";
    const style = ul.style || "solid";
    // scratchy filter を必要に応じ差し込む
    let filterCss = "";
    if (ul.texture === "scratchy") {
      const ulFid = `ul-scratchy-${line.id}`;
      const seed = ((Number(line.id) || 0) * 17 + 3) % 100;
      // PDF 実測：線は途切れていない。手描きの線が横に微妙に揺れ、
      // 太さがゆらいで縁がわずかに荒れている＝カスレ。
      // → 透明度ムラだけでは出ないので feDisplacementMap で線自体を歪ませる。
      // brackets は「読む方向と平行」なので、縦組み＝線は縦 / 横組み＝線は横。
      const lineIsVertical = (style === "brackets") ? vertical : !vertical;
      // 線が伸びる方向のノイズは低周波（＝ゆるやかな蛇行）、
      // 太さ方向は高周波（＝縁のざらつき）
      const warpFreq = lineIsVertical ? "0.5 0.035" : "0.035 0.5";
      const fadeFreq = lineIsVertical ? "0.7 0.09"  : "0.09 0.7";
      // 細い辺に振れ幅を確保するためフィルタ領域を太さ方向へ大きく広げる
      const region = lineIsVertical
        ? `x="-400%" y="-2%" width="900%" height="104%"`
        : `x="-2%" y="-400%" width="104%" height="900%"`;
      const warp = Math.max(0.5, Number(ul.warp) || 2.5); // 蛇行の振れ幅(px)
      // alpha = 0.45(R+G+B) + 0.35 → おおよそ 0.5〜1.0。完全に切れはしない
      underlineSvgDef = `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0"><filter id="${ulFid}" ${region}><feTurbulence type="fractalNoise" baseFrequency="${warpFreq}" numOctaves="3" seed="${seed}" result="warp"/><feDisplacementMap in="SourceGraphic" in2="warp" scale="${warp}" xChannelSelector="R" yChannelSelector="G" result="wobbly"/><feTurbulence type="fractalNoise" baseFrequency="${fadeFreq}" numOctaves="1" seed="${(seed + 41) % 100}" result="fade"/><feColorMatrix in="fade" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.45 0.45 0.45 0 0.35" result="mask"/><feComposite in="wobbly" in2="mask" operator="in"/></filter></svg>`;
      filterCss = `;filter:url(#${ulFid})`;
    }
    const bgStyle = `background:${col};z-index:0;pointer-events:none${filterCss}`;
    if (style === "brackets") {
      // 線は「読む方向と平行」にテキストの両脇へ。
      // 縦組み（上→下に読む）＝左右に縦線 / 横組み（左→右）＝上下に横線
      if (vertical) {
        const left  = `position:absolute;left:-${off.toFixed(3)}cqw;top:-${ext.toFixed(3)}cqw;bottom:-${ext.toFixed(3)}cqw;width:${w.toFixed(3)}cqw;${bgStyle}`;
        const right = `position:absolute;right:-${off.toFixed(3)}cqw;top:-${ext.toFixed(3)}cqw;bottom:-${ext.toFixed(3)}cqw;width:${w.toFixed(3)}cqw;${bgStyle}`;
        underlineHtml = `<div style="${left}"></div><div style="${right}"></div>`;
      } else {
        const top = `position:absolute;top:-${off.toFixed(3)}cqw;left:-${ext.toFixed(3)}cqw;right:-${ext.toFixed(3)}cqw;height:${w.toFixed(3)}cqw;${bgStyle}`;
        const bot = `position:absolute;bottom:-${off.toFixed(3)}cqw;left:-${ext.toFixed(3)}cqw;right:-${ext.toFixed(3)}cqw;height:${w.toFixed(3)}cqw;${bgStyle}`;
        underlineHtml = `<div style="${top}"></div><div style="${bot}"></div>`;
      }
    } else {
      // solid（従来）：横組み=下 / 縦組み=左
      const s = vertical
        ? `position:absolute;top:-${ext.toFixed(3)}cqw;bottom:-${ext.toFixed(3)}cqw;left:-${off.toFixed(3)}cqw;width:${w.toFixed(3)}cqw;${bgStyle}`
        : `position:absolute;left:-${ext.toFixed(3)}cqw;right:-${ext.toFixed(3)}cqw;bottom:-${off.toFixed(3)}cqw;height:${w.toFixed(3)}cqw;${bgStyle}`;
      underlineHtml = `<div style="${s}"></div>`;
    }
    underlineHtml = underlineSvgDef + underlineHtml;
  }

  // 外枠 wrapper: 位置・変形はここに（子は shrink-to-fit で text natural size）
  const wrapperStyle = [
    `position:absolute`,
    `left: ${leftPct.toFixed(3)}%`,
    `top: ${topPct.toFixed(3)}%`,
    `transform: ${translate}${vertical ? " translate(-0.1em, 0)" : ""} rotate(${rot}deg) scale(${scale})`,
    `white-space: nowrap`,
  ].join(";");

  // text 要素は wrapper 内に置く。位置指定なし（wrapper が位置を持つ）、z-index で座布団 layer の上に。
  const italic = !!line.fontOverride?.italic;
  // 光彩（テキストグロー）：text-shadow を多層で塗って強めのグローを再現
  const glow = line.glow;
  let glowCss = "";
  if (glow && glow.enabled) {
    const gc = hexToRgba(glow.color || "#FF69B4", glow.opacity ?? 0.9);
    const gb = Number(glow.blur) || 20;
    // 極濃い光彩：同一 blur を 8 回重ねて色を積み上げ + 外側 2 段ハロー
    const stack = [];
    for (let i = 0; i < 8; i++) stack.push(`0 0 ${gb}px ${gc}`);
    stack.push(`0 0 ${(gb*2).toFixed(1)}px ${gc}`);
    stack.push(`0 0 ${(gb*4).toFixed(1)}px ${gc}`);
    glowCss = `text-shadow: ${stack.join(", ")}`;
  }
  const textStyle = [
    `position: relative`,
    `z-index: 1`,
    `font-family: '${(cssFam || "").replace(/'/g, "\\'")}', system-ui, sans-serif`,
    `font-size: ${fontCqw.toFixed(3)}cqw`,
    `letter-spacing: ${letterCqw.toFixed(3)}cqw`,
    // letter-spacing は最後の 1 文字の後ろにも入る。そのままだと行の箱が
    // 字間 1 つ分だけ広くなり、座布団が読み終わり側へずれて見える
    //（横組みは右へ、縦組みは下へ）。その分を戻す。
    letterCqw ? `margin-inline-end: -${letterCqw.toFixed(3)}cqw` : ``,
    `line-height: ${vertical ? 1 : 1.3}`,
    `color: ${line.textColor || "#fff"}`,
    line.textStroke ? `-webkit-text-stroke: ${Number(line.textStroke.width)||2}px ${line.textStroke.color || "#000"}` : ``,
    line.textStroke ? `paint-order: stroke fill` : ``,
    `text-align: center`,
    italic ? `font-style: italic` : ``,
    vertical ? `writing-mode: vertical-rl` : ``,
    glowCss,
  ].filter(Boolean).join(";");

  // 配置ガイド（15/50/85% の水平線 + 中央縦線）
  const guide = (pct) => `<div style="position:absolute;left:0;right:0;top:${pct}%;border-top:1px dashed rgba(255,255,255,.12)"></div>`;
  const vGuide = `<div style="position:absolute;top:0;bottom:0;left:50%;width:1px;background:rgba(255,80,80,.55)"></div>`;

  const meta = `${escapeHtml(labelFor(familyValue) || "(継承)")} / size ${rawSize} / tracking ${tracking} / ${escapeHtml(layout)}${dx || dy ? ` / dx:${dx} dy:${dy}` : ""}`;
  return `
    <div style="${previewStageStyle(project)}">
      ${renderPreviewBackgrounds(line, project)}
      ${guide(15)}${guide(50)}${guide(85)}
      ${vGuide}
      <div style="${wrapperStyle}">
        ${zabLayerHtml}
        ${underlineHtml}
        <div style="${textStyle}">${htmlText}</div>
      </div>
    </div>
    <div style="margin-top:6px;font-size:10px;color:var(--gray-3, #999)">${escapeHtml(meta)}</div>
  `;
}

const BG_FIT = { cover: "cover", contain: "contain", stretch: "fill", original: "none" };
const BG_BLEND = { normal: "normal", multiply: "multiply", screen: "screen", overlay: "overlay",
                   add: "plus-lighter", lighten: "lighten", darken: "darken" };
export const VIDEO_EXTS = /\.(mp4|m4v|mov|webm)$/i;

// 背景 1 つ分の HTML。
// 不透明度はここでは bg.opacity のみ。フェードは時間で変わるので、
// 曲に合わせたプレビュー側が毎フレーム上書きする（書き出しは ffmpeg 側で掛ける）。
export function backgroundLayerHtml(bg) {
  const blend = BG_BLEND[bg.blend] || "normal";
  const common = `position:absolute;inset:0;opacity:${bg.opacity ?? 1.0};mix-blend-mode:${blend}`;
  if (bg.solidColor) {
    return `<div style="${common};background:${escapeHtml(bg.solidColor)}"></div>`;
  }
  if (bg.file) {
    // Web 版：ブラウザで選択したファイルを Blob URL レジストリから引く
    const src = getFileBlobUrl(bg.file);
    if (!src) {
      return `<div style="${common};background:#222;display:flex;align-items:center;justify-content:center;color:#666;font-size:11px">背景ファイル未読込<br>${escapeHtml(bg.file)}</div>`;
    }
    const fit = BG_FIT[bg.fit] || "cover";
    if (VIDEO_EXTS.test(bg.file)) {
      return `<video src="${escapeHtml(src)}" preload="auto" muted playsinline style="${common};width:100%;height:100%;object-fit:${fit}"></video>`;
    }
    return `<img src="${escapeHtml(src)}" style="${common};width:100%;height:100%;object-fit:${fit}">`;
  }
  return "";
}

// 行の tIn 時点でアクティブな背景をステージに描画（画像/動画/単色、fit/opacity/blend 反映）
export function renderPreviewBackgrounds(line, project) {
  const bgs = project.backgrounds || [];
  if (!bgs.length) return "";
  const t = line.tIn;
  // 行に TC があればその時点でアクティブな bg、無ければ最初の bg
  let active = (t != null)
    ? bgs.filter(b => (b.tIn ?? 0) <= t && t < (b.tOut ?? Infinity))
    : [bgs[0]];
  if (!active.length && t != null) return "";

  // リストの上にあるものを手前にする（After Effects と同じ並び）。
  // DOM は後に書いたものが手前に来るので、逆順にして描く。
  return active.slice().reverse().map(backgroundLayerHtml).join("");
}

// #RRGGBB + opacity → rgba() 文字列
export function hexToRgba(hex, opacity) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return `rgba(0,0,0,${opacity})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${opacity})`;
}

// 強調スペック（{text, level, occurrence}）を色分け span で反映
// 色はアプリ内の目印（AE の design 色とは別物）
const EMPHASIS_COLORS = { 1: "#ffd54a", 2: "#ff8a65", 3: "#ff5252" };
// 座布団の CSS スタイル配列を返す（外側でも per-block span でも共用）
// 座布団を absolute layer として描画する用の CSS（text と分離、blur は text に影響しない）。
// inset で padding 分外側に広げる。
function buildZabLayerCss(zab, toCqw, isVertical, filterId, spanCqw = 100, seed = 1, shiftEm = 0, fontCqw = 0) {
  if (!zab || !zab.enabled) return { css: "", svgDef: "" };
  const px = toCqw(zab.paddingX ?? 0);
  const py = toCqw(zab.paddingY ?? 0);
  let radius = "0";
  if (zab.shape === "round") radius = `${toCqw(zab.cornerRadius ?? 16).toFixed(3)}cqw`;
  else if (zab.shape === "pill") radius = "999em";
  else if (zab.shape === "circle") radius = "50%";
  const opacity = zab.opacity ?? 0.5;
  const rgba = hexToRgba(zab.color || "#000000", opacity);
  const grad = zab.gradient;
  let bgCss = rgba;
  if (grad && grad.enabled) {
    const cA = hexToRgba(grad.colorA || "#FF69B4", opacity);
    const cB = hexToRgba(grad.colorB || "#FFD54A", opacity);
    // 縦組みではグラデも「テキスト方向」に沿うよう +90 度回転
    const rawAngle = Number(grad.angle) || 90;
    const angle = ((rawAngle + (isVertical ? 90 : 0)) % 360 + 360) % 360;
    bgCss = grad.colorC
      ? `linear-gradient(${angle}deg, ${cA}, ${cB}, ${hexToRgba(grad.colorC, opacity)})`
      : `linear-gradient(${angle}deg, ${cA}, ${cB})`;
  }
  // 座布団は行ボックスに合わせて置かれるが、文字のインクは行ボックスの
  // 真ん中には来ない（フォントごとに上下の余白が違う）。そのぶんずらして、
  // 文字から見て中央に見えるようにする。shift は em 単位（＋で下へ）。
  const sh = (Number(shiftEm) || 0) * fontCqw;
  const styles = [
    `position:absolute`,
    sh
      ? `inset: ${(-py + sh).toFixed(3)}cqw -${px.toFixed(3)}cqw ${(-py - sh).toFixed(3)}cqw -${px.toFixed(3)}cqw`
      : `inset: -${py.toFixed(3)}cqw -${px.toFixed(3)}cqw`,
    `border-radius: ${radius}`,
    `z-index: 0`,
    `pointer-events: none`,
  ];
  // 破れ縁（ギザギザ）：紙をちぎったような不規則な縁。
  //
  //  - 歯の大きさ（ピッチ・深さ）は AE px で指定する。割合で刻むと、
  //    短い行では歯が詰まり長い行では間延びして、別物に見えてしまう。
  //    → 長辺の実寸から歯の数を決め、深さは cqw で置く。
  //  - 縦組みは読む方向が縦なので、歯は左右の辺に出す（横組みは上下）。
  //  - 乱数の種に行を混ぜてあるので、行ごとにちぎれ方が変わる。
  const edge = zab.edge;
  if (edge && edge.type === "torn") {
    const pitch = toCqw(Math.max(2, Number(edge.pitch) || 18));
    // 旧データの amp（帯の厚みに対する割合）は実寸へ読み替える
    const depthPx = Number(edge.depth) || (edge.amp != null ? Number(edge.amp) * 50 : 9);
    const depth = toCqw(Math.max(0.5, depthPx));
    const n = Math.max(4, Math.min(400, Math.round(spanCqw / pitch)));

    let s = (Number(seed) || 1) % 2147483647; if (s <= 0) s += 2147483646;
    const rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
    // 端は凹ませない（角が欠けて見えるため）
    const d = (i) => (i === 0 || i === n) ? "0cqw" : `${(rnd() * depth).toFixed(3)}cqw`;
    const far = (v) => v === "0cqw" ? "100%" : `calc(100% - ${v})`;
    const at = (i) => (i / n * 100).toFixed(2) + "%";

    const pts = [];
    if (isVertical) {
      for (let i = 0; i <= n; i++) pts.push(`${d(i)} ${at(i)}`);           // 左辺（上→下）
      for (let i = n; i >= 0; i--) pts.push(`${far(d(i))} ${at(i)}`);      // 右辺（下→上）
    } else {
      for (let i = 0; i <= n; i++) pts.push(`${at(i)} ${d(i)}`);           // 上辺（左→右）
      for (let i = n; i >= 0; i--) pts.push(`${at(i)} ${far(d(i))}`);      // 下辺（右→左）
    }
    styles.push(`clip-path: polygon(${pts.join(', ')})`);
  }
  if (zab.mode === "stroke") {
    const strokeColor = (grad && grad.enabled) ? hexToRgba(grad.colorA || "#FF69B4", opacity) : rgba;
    const sw = toCqw(zab.strokeWidth ?? 2);
    styles.push(`background: transparent`);
    styles.push(`box-shadow: inset 0 0 0 ${sw.toFixed(3)}cqw ${strokeColor}`);
  } else {
    // 斜線などのパターンがあれば土台色の上に重ねる
    const pat = zab.pattern;
    if (pat && pat.type === "stripe") {
      const stripeCol = hexToRgba(pat.color || "#0000E0", 1.0);
      const size = toCqw(Math.max(1, Number(pat.size) || 6));
      const gap  = toCqw(Math.max(1, Number(pat.gap)  || size));
      const ang  = (isVertical ? (Number(pat.angle) || 0) + 90 : (Number(pat.angle) || 0));
      const stripeBg = `repeating-linear-gradient(${ang}deg, ${stripeCol} 0 ${size.toFixed(3)}cqw, transparent ${size.toFixed(3)}cqw ${(size+gap).toFixed(3)}cqw)`;
      styles.push(`background: ${stripeBg}, ${bgCss}`);
    } else {
      styles.push(`background: ${bgCss}`);
    }
  }
  const bx = Number(zab.blurX) || 0;
  const by = Number(zab.blurY) || 0;
  let svgDef = "";
  if (bx > 0 || by > 0) {
    if (bx === by) {
      // X=Y のときは CSS blur() が確実
      styles.push(`filter: blur(${bx}px)`);
    } else {
      // X!=Y は SVG feGaussianBlur を DOM に埋め込んで参照
      // filter 領域を大幅に広げて大きな blur でも clip されないよう
      svgDef = `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0"><filter id="${filterId}" x="-500%" y="-500%" width="1100%" height="1100%"><feGaussianBlur stdDeviation="${bx} ${by}"/></filter></svg>`;
      styles.push(`filter: url(#${filterId})`);
    }
  }
  return { css: styles.join(';'), svgDef };
}

function buildZabCss(zab, toCqw) {
  if (!zab || !zab.enabled) return [];
  const px = toCqw(zab.paddingX ?? 0);
  const py = toCqw(zab.paddingY ?? 0);
  let radius = "0";
  if (zab.shape === "round") radius = `${toCqw(zab.cornerRadius ?? 16).toFixed(3)}cqw`;
  else if (zab.shape === "pill") radius = "999em";
  else if (zab.shape === "circle") radius = "50%";
  const opacity = zab.opacity ?? 0.5;
  const rgba = hexToRgba(zab.color || "#000000", opacity);
  // グラデーション設定：あれば background に linear-gradient を使用
  const grad = zab.gradient;
  let bgCss = rgba;
  if (grad && grad.enabled) {
    const cA = hexToRgba(grad.colorA || "#FF69B4", opacity);
    const cB = hexToRgba(grad.colorB || "#FFD54A", opacity);
    const angle = Number(grad.angle) || 90;
    if (grad.colorC) {
      const cC = hexToRgba(grad.colorC, opacity);
      bgCss = `linear-gradient(${angle}deg, ${cA}, ${cB}, ${cC})`;
    } else {
      bgCss = `linear-gradient(${angle}deg, ${cA}, ${cB})`;
    }
  }
  const styles = [
    `padding: ${py.toFixed(3)}cqw ${px.toFixed(3)}cqw`,
    `margin: -${py.toFixed(3)}cqw -${px.toFixed(3)}cqw`,
    `border-radius: ${radius}`,
  ];
  if (zab.mode === "stroke") {
    // stroke モードではグラデ非対応（AE 側も同様）、色 A or 単色で描画
    const strokeColor = (grad && grad.enabled) ? hexToRgba(grad.colorA || "#FF69B4", opacity) : rgba;
    const sw = toCqw(zab.strokeWidth ?? 2);
    styles.push(`box-shadow: inset 0 0 0 ${sw.toFixed(3)}cqw ${strokeColor}`);
  } else {
    styles.push(`background: ${bgCss}`);
  }
  // エッジぼかし X/Y：SVG feGaussianBlur で個別指定
  const bx = Number(zab.blurX) || 0;
  const by = Number(zab.blurY) || 0;
  if (bx > 0 || by > 0) {
    // cqw で数値を大きくしても SVG filter は px 相当に解釈するので、
    // まず AE px を preview scale に近似変換する: 1cqw ≒ (stageWidth/100)px
    // ここでは簡易的に AE px の値を SVG stdDeviation に流用（ステージスケールが変わっても目安として使える）
    const svg = `<svg xmlns='http://www.w3.org/2000/svg'><filter id='b'><feGaussianBlur stdDeviation='${bx} ${by}'/></filter></svg>`;
    styles.push(`filter: url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}#b")`);
  }
  return styles;
}

// 行の内側HTMLを組み立てる。
// - "/" はジッター区切りとして表示せず、境界としてのみ扱う
// - "\\n" / 実改行は <br>
// - emphasis は splitChars 相当（"/"・改行除外）の文字インデックスで解決
// - line.jitter?.enabled なら parseJitterBlocks で分割し、ブロックごとに translate
// - line.zabuton?.perBlock なら各ブロック span に座布団装飾を掛ける
function buildLineInnerHtml(line, opts) {
  const text = line.text || "";
  if (!text) return "";
  const resW = opts.resW || 1920;
  const toCqw = opts.toCqw || ((px) => (px / resW * 100));

  // トークン化：char / br / sep（区切り"/"）
  const tokens = []; // {type:'char', ch, charIdx} | {type:'br'} | {type:'sep'}
  let charIdx = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\" && text[i + 1] === "n") { tokens.push({ type: "br" }); i++; continue; }
    if (c === "\n") { tokens.push({ type: "br" }); continue; }
    if (c === "/") { tokens.push({ type: "sep" }); continue; }
    tokens.push({ type: "char", ch: c, charIdx });
    charIdx++;
  }
  const totalChars = charIdx;

  // emphasis：splitChars 連結でマッチ
  const cleanText = tokens.filter(t => t.type === "char").map(t => t.ch).join("");
  const levels = new Array(totalChars).fill(0);
  for (const spec of (line.emphasis || [])) {
    if (!spec || !spec.text || !spec.level) continue;
    let from = 0, count = 0;
    const want = spec.occurrence || 1;
    while (true) {
      const idx = cleanText.indexOf(spec.text, from);
      if (idx < 0) break;
      count++;
      if (count === want) {
        for (let i = idx; i < idx + spec.text.length; i++) levels[i] = spec.level;
        break;
      }
      from = idx + 1;
    }
  }

  // 縦組みフラグ（小書きかな位置補正で使用）
  const isVerticalLayout = /^v[lrc]_/.test(String(line.layout || "h_bottom"));

  // ジッター
  const jit = line.jitter;
  const jitterOn = !!(jit && jit.enabled && totalChars > 0);
  // 座布団 perBlock
  const zab = line.zabuton;
  const perBlockZab = !!(zab && zab.enabled && zab.perBlock && totalChars > 0);
  const blockMode = jitterOn || perBlockZab;

  const blockOf = new Array(totalChars).fill(-1);
  const blockOffsets = []; // [{dxCqw, dyCqw}]
  if (blockMode) {
    const blocks = parseJitterBlocks(text);
    // クランプ用にブロック中心の絶対 AE px 座標を算出。JSX 側と同ロジック（近似：全文字同サイズ）。
    const resH = opts.resH || 1080;
    const rawSize = opts.rawSize || 48;
    const tracking = Number(line.tracking) || 0;
    const charAdvance = rawSize * (1.10 + tracking);
    const totalWidth = totalChars * charAdvance;
    const layout = String(line.layout || "h_bottom");
    const vertical = /^v[lrc]_/.test(layout);
    const dx = line.pos?.dx || 0;
    const dy = line.pos?.dy || 0;
    let textCX, textCY;
    if (vertical) {
      let colXPct = 50;
      if (layout.startsWith("vl_")) colXPct = 15;
      else if (layout.startsWith("vr_")) colXPct = 85;
      textCX = resW * colXPct / 100 + dx;
      if (layout.includes("top"))         textCY = resH * 0.15 + totalWidth / 2 + dy;
      else if (layout.includes("bottom")) textCY = resH * 0.85 - totalWidth / 2 + dy;
      else                                textCY = resH / 2 + dy;
    } else {
      textCX = resW / 2 + dx;
      if (layout.includes("top"))         textCY = resH * 0.15 + dy;
      else if (layout.includes("bottom")) textCY = resH * 0.85 + dy;
      else                                textCY = resH / 2 + dy;
    }
    const margin = rawSize / 2; // 文字端の余白（fontSize / 2 = 半文字）
    // 一旦 px で計算して、preventOverlap パスを通してから cqw に変換
    const blockInfos = [];
    blocks.forEach((b, bi) => {
      for (let i = b.start; i <= b.end; i++) blockOf[i] = bi;
      let off = { dx: 0, dy: 0 };
      if (jitterOn) {
        off = jitterOffsetFor(jit.seed | 0, ((line.id | 0) + 1) * 1000 + bi, jit.maxDx || 0, jit.maxDy || 0);
      }
      const blockMidIdx = (b.start + b.end + 1) / 2;
      const offsetAlongAxis = (blockMidIdx - totalChars / 2) * charAdvance;
      const absX = vertical ? textCX : textCX + offsetAlongAxis;
      const absY = vertical ? textCY + offsetAlongAxis : textCY;
      const blockHalf = (b.end - b.start + 1) * charAdvance / 2;
      const halfX = vertical ? (rawSize / 2) : blockHalf;
      const halfY = vertical ? blockHalf : (rawSize / 2);
      let minDx = margin + halfX - absX;
      let maxDxLim = resW - margin - halfX - absX;
      let minDy = margin + halfY - absY;
      let maxDyLim = resH - margin - halfY - absY;
      if (minDx > maxDxLim) off.dx = (minDx + maxDxLim) / 2;
      else off.dx = Math.max(minDx, Math.min(maxDxLim, off.dx));
      if (minDy > maxDyLim) off.dy = (minDy + maxDyLim) / 2;
      else off.dy = Math.max(minDy, Math.min(maxDyLim, off.dy));
      blockInfos.push({ off, absX, absY, blockHalf });
    });
    // 重なり禁止・順序保持：流れ方向のみ、左（or 上）から順に押し出し
    if (jit && jit.preventOverlap && blockInfos.length > 1) {
      let prevEnd = -Infinity;
      const screenLimit = (vertical ? resH : resW) - margin;
      for (let i = 0; i < blockInfos.length; i++) {
        const info = blockInfos[i];
        const origAlong = vertical ? info.absY : info.absX;
        const jitAlong = vertical ? info.off.dy : info.off.dx;
        let center = origAlong + jitAlong;
        const minCenter = prevEnd + info.blockHalf;
        if (center < minCenter) center = minCenter;
        const maxCenter = screenLimit - info.blockHalf;
        if (center > maxCenter) center = maxCenter;
        if (vertical) info.off.dy = center - info.absY;
        else info.off.dx = center - info.absX;
        prevEnd = center + info.blockHalf;
      }
    }
    blockInfos.forEach(info => {
      blockOffsets.push({ dxCqw: toCqw(info.off.dx), dyCqw: toCqw(info.off.dy) });
    });
  }
  const zabInnerStyles = perBlockZab ? buildZabCss(zab, toCqw) : [];

  // 文字種別ギャップ（アキ設定）：異なる種別の文字間に padding-inline-start で空きを追加
  const interTypeGap = Number(line.interTypeGap) || 0;
  const autoKerning = !!line.autoKerning;

  // HTML 組み立て
  let html = "";
  let curBlock = -1;
  let openSpan = false;
  let prevType = null;
  const closeSpan = () => { if (openSpan) { html += "</span>"; openSpan = false; } curBlock = -1; };
  const openBlockSpan = (bi) => {
    const o = blockOffsets[bi];
    const styles = ["display:inline-block"];
    if (jitterOn) styles.push(`transform:translate(${o.dxCqw.toFixed(3)}cqw, ${o.dyCqw.toFixed(3)}cqw)`);
    if (perBlockZab) styles.push(...zabInnerStyles);
    html += `<span style="${styles.join(';')}">`;
    openSpan = true;
    curBlock = bi;
  };
  for (const t of tokens) {
    if (t.type === "br") { closeSpan(); html += "<br>"; prevType = null; continue; }
    if (t.type === "sep") { closeSpan(); prevType = null; continue; }
    if (blockMode) {
      const bi = blockOf[t.charIdx];
      if (bi !== curBlock) { closeSpan(); openBlockSpan(bi); prevType = null; }
    }
    // スペース (半角/全角) の可視化：nbsp / ideographic-space を使って span 化しても崩れない
    const isSpace = (t.ch === " " || t.ch === "　");
    const rawCh = isSpace ? (t.ch === "　" ? "　" : " ") : escapeHtml(t.ch);
    const lv = levels[t.charIdx];
    let chHtml = lv > 0 ? `<span style="color:${EMPHASIS_COLORS[lv] || "#ff5252"}">${rawCh}</span>` : rawCh;
    // 縦組み小書きかな左シフト補正
    if (isVerticalLayout && SMALL_KANA.has(t.ch)) {
      chHtml = `<span style="display:inline-block;transform:translate(-0.04em, 0)">${chHtml}</span>`;
    }
    // 文字種別ギャップ：スペースは判定・prev 更新に含めない（隣接種別の判定を跨がせる）
    if (!isSpace) {
      const curType = classifyChar(t.ch);
      // オートカーニング ON なら組版ルール（和文↔欧文だけ空ける）、
      // OFF なら従来どおり「種類が変わったら一律 interTypeGap」
      const gap = autoKerning
        ? autoKerningEm(prevType, curType)
        : ((interTypeGap > 0 && prevType && curType && prevType !== curType) ? interTypeGap : 0);
      if (gap > 0) {
        chHtml = `<span style="padding-inline-start:${gap}em">${chHtml}</span>`;
      }
      prevType = curType;
    }
    html += chHtml;
  }
  closeSpan();
  return html;
}

// 強調指定のパース：1行 = 1指定、形式 "テキスト:レベル" or "テキスト:レベル:出現回数"
// # で始まる行はコメント、空行はスキップ
