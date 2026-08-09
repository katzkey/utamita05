// HTML 文字列を組み立てるときの共通ユーティリティ

// 属性値・テキストとして埋め込む前に必ず通す。
// 以前は 7 ファイルに同じ実装が散らばっていた。
export function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
