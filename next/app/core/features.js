// 機能の出し分け
//
// AE 書き出しは当面使わない方針になったため、AE 依存の UI をまとめて隠せるようにする。
// コードは消さない。AE に戻る判断をしたら AE_ENABLED を true にすれば元通りになる。
//
// AE 依存 = 「After Effects のテンプレートが無いと意味が無い」もの
//   - モーション（Entry / Hold / Exit）
//   - デザイン（Design）
//   - テンプレタブ
//   - 全体設定のデフォルトテンプレ
//   - AE 接続ステータス表示
//   - layerMode（char / line）… AE のレイヤ分割単位の話で、Web 書き出しには無関係
//
// AE 非依存 = 見た目そのもの（フォント・座布団・光彩・下線・配置など）は
//            すべて Web 側で完結しているので、ここでは触らない。

export const AE_ENABLED = false;

// 隠す対象に data-ae="1" を付けておくと、この関数で一括で消える
export function applyFeatureFlags(root = document) {
  if (AE_ENABLED) return;
  for (const el of root.querySelectorAll('[data-ae="1"]')) {
    el.style.display = "none";
  }
}
