// 隔離テスト版だけで読み込む補助スクリプト（本番には置かない）
(function(){
  const bar = document.createElement("div");
  bar.textContent = "隔離テスト版（段階7f P9・iPhone 2台・修正版 fix1）｜本番データ・本番iCloud「出荷検品」は使わない";
  bar.style.cssText = "position:sticky;top:0;z-index:9999;background:#b00020;color:#fff;font-weight:700;padding:6px 10px;font-size:14px;text-align:center";
  document.body.prepend(bar);
})();
