// ブラウザで選択した素材ファイルの置き場
//
// Web 版はサーバー経由でファイルを配信できないので、選択された File を
// ここに登録し、プレビュー用の Blob URL を発行する。
// project.json にはファイル名だけ保存し、URL は都度作り直す。
//
// 描画（core/render_line.js）からも引くため、UI 層ではなく core に置く。

const blobs = new Map();   // filename → { file, url }

export function putBlob(file) {
  if (!file || !file.name) return null;
  const existing = blobs.get(file.name);
  if (existing) {
    try { URL.revokeObjectURL(existing.url); } catch (e) {}
  }
  const url = URL.createObjectURL(file);
  blobs.set(file.name, { file, url });
  return url;
}

export function getBlobUrl(name) {
  if (!name) return null;
  const e = blobs.get(name);
  return e ? e.url : null;
}

export function getBlobFile(name) {
  if (!name) return null;
  const e = blobs.get(name);
  return e ? e.file : null;
}

export function hasBlob(name) {
  return !!(name && blobs.has(name));
}

export function clearBlobs() {
  for (const { url } of blobs.values()) {
    try { URL.revokeObjectURL(url); } catch (e) {}
  }
  blobs.clear();
}
