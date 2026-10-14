// 隔離テスト版だけで読み込む補助スクリプト（本番には置かない）
(function(){
  // 常時表示の帯
  const bar = document.createElement("div");
  bar.textContent = "隔離テスト版（新画面確認）｜本番データ・本番iCloudフォルダは使わない";
  bar.style.cssText = "position:sticky;top:0;z-index:9999;background:#b00020;color:#fff;font-weight:700;padding:6px 10px;font-size:14px;text-align:center";
  document.body.prepend(bar);

  // 同梱の試験用CSVを、ボタン1つで「CSVを選択」欄に入れる（iCloudのスマホ取込フォルダを使わない）
  const fileInput = document.getElementById("bundleFile");
  if(!fileInput) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn primary";
  btn.textContent = "試験用CSVを入れる";
  btn.style.margin = "8px 0";
  btn.onclick = async () => {
    try{
      const text = await fetch("./TESTONLY_inspection_bundle.csv", {cache:"no-store"}).then(r => { if(!r.ok) throw new Error(r.status); return r.text(); });
      const dt = new DataTransfer();
      dt.items.add(new File([text], "TESTONLY_inspection_bundle.csv", {type:"text/csv"}));
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event("change", {bubbles:true}));
      btn.textContent = "試験用CSVを入れました（続けて読込を押してください）";
    }catch(e){
      btn.textContent = "試験用CSVを入れられませんでした：" + e.message;
    }
  };
  fileInput.insertAdjacentElement("beforebegin", btn);
})();
