
const state={staff:null,staffList:[],inspectionRows:[],barcodeMap:new Map(),aliasMap:new Map(),noBarcodeSet:new Set(),currentInvoice:null,currentItems:[],currentIndex:0,results:[],startedAt:null,lastReadBarcode:""};
const $=id=>document.getElementById(id);
let barcodeInputTimer = null;
function show(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  $(id).classList.add("active");
}
function showMsg(id,text,ok=false){const el=$(id);el.textContent=text||"";el.style.color=ok?"#047857":"#b91c1c"}

function currentStaffText(){
  if(!state.staff) return "";
  return `作業者：${state.staff.staff_name || state.staff.staff_code}`;
}
function updateStaffLabels(){
  const text=currentStaffText();
  if($("staffNameLabel")) $("staffNameLabel").textContent=text;
  if($("orderStaffLabel")) $("orderStaffLabel").textContent=text;
  if($("itemStaffLabel")) $("itemStaffLabel").textContent=text;
}
function showChangeStaffModal(){
  showModal("作業者変更",
    `<p>以後の検品結果は、新しい作業者の社員番号で記録されます。</p>
     <p>すでに検品済みの商品は変更されません。</p>
     <label class="label">社員番号</label>
     <input id="changeStaffCodeInput" class="input big" inputmode="numeric" pattern="[0-9]*" autocomplete="off">
     <p id="changeStaffMsg" class="msg"></p>`,
    [
      {label:"変更",kind:"primary",onClick:()=>{
        const code=$("changeStaffCodeInput").value.trim();
        const staff=state.staffList.find(s=>s.staff_code===code && s.active_flag==="1");
        if(!staff){
          $("changeStaffMsg").textContent="社員番号が登録されていない、または使用できません";
          return;
        }
        state.staff=staff;
        updateStaffLabels();
        closeModal();
      }},
      {label:"キャンセル",onClick:()=>{closeModal(); focusBarcodeInput();}}
    ]
  );
  setTimeout(()=>$("changeStaffCodeInput")?.focus(),100);
}

function focusInvoiceInput(){
  const input = $("invoiceInput");
  if(!input) return;

  input.value = "";

  // まず即時フォーカス
  input.focus();
  input.select();

  // iPhone Safari / AsReader 対策で少し遅れて再フォーカス
  setTimeout(() => {
    input.focus();
    input.select();
  }, 100);

  setTimeout(() => {
    input.focus();
    input.select();
  }, 300);
}

function resetInvoiceScreen(){
  const msg = $("invoiceMsg");

  if(msg){
    msg.textContent = "";
  }

  focusInvoiceInput();
}

function focusBarcodeInput(){
  const input = $("barcodeInput");
  if(!input) return;

  input.value = "";

  // まず即時フォーカス
  input.focus();

  // iPhone Safari / AsReader 対策で少し遅れてもう一度フォーカス
  setTimeout(() => {
    input.focus();
    if($("readValue")){
      $("readValue").textContent = "スキャン待機中";
    }
  }, 100);

  setTimeout(() => {
    input.focus();
  }, 300);
}
function nowText(){const d=new Date(),p=n=>String(n).padStart(2,"0");
return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`}
function csvEscape(v){const s=v==null?"":String(v);return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function parseCsv(text){text=text.replace(/^\uFEFF/,"");
const rows=[];let row=[],cell="",q=false;for(let i=0;
i<text.length;i++){const c=text[i],n=text[i+1];if(q){if(c=='"'&&n=='"'){cell+='"';
i++}else if(c=='"')q=false;else cell+=c}else{if(c=='"')q=true;else if(c==","){row.push(cell);
cell=""}else if(c=="\n"){row.push(cell);rows.push(row);row=[];
cell=""}else if(c!="\r")cell+=c}}row.push(cell);rows.push(row);const h=rows.shift().map(x=>x.trim());
return rows.filter(r=>r.some(v=>String(v).trim()!="")).map(r=>Object.fromEntries(h.map((x,i)=>[x,(r[i]??"").trim()])))}
function renderLoadedCsvList(){const f=$("bundleFile").files[0];$("loadedCsvList").innerHTML=f?`<li>${f.name}</li>`:"<li>未選択</li>"}
async function readBundleCsv(input){const f=input.files[0];
if(!f)throw new Error("inspection_bundle.csv が選択されていません");
const rows=await f.text().then(parseCsv);
const staffRows=[],itemRows=[],barcodeRows=[],aliasRows=[],noBarcodeRows=[];
for(const r of rows){const t=String(r.record_type||"").trim().toUpperCase();
if(t==="STAFF")staffRows.push(r);
else if(t==="ITEM")itemRows.push(r);else if(t==="BARCODE")barcodeRows.push(r);
else if(t==="ALIAS")aliasRows.push(r);
else if(t==="NO_BARCODE")noBarcodeRows.push(r)}
if(!staffRows.length)throw new Error("STAFF行がありません");
if(!itemRows.length)throw new Error("ITEM行がありません");
if(!barcodeRows.length && !noBarcodeRows.length)throw new Error("BARCODE行またはNO_BARCODE行がありません");
return{staffRows,itemRows,barcodeRows,aliasRows,noBarcodeRows}}
function normalizeBarcode(v){return String(v||"").replace(/[\s-]/g,"")}
function itemKey(r){return `${r.invoice_no}__${r.line_no}__${r.sku}`}
function getResult(r){return state.results.find(x=>x.key===itemKey(r))}
function setResult(r,d){const k=itemKey(r),e=state.results.find(x=>x.key===k);e?Object.assign(e,d):state.results.push({key:k,...d})}
function allowedBarcodes(sku){const a=[];if(state.barcodeMap.has(sku))a.push(state.barcodeMap.get(sku));
if(state.aliasMap.has(sku))a.push(...state.aliasMap.get(sku));
return a.map(normalizeBarcode).filter(Boolean)}
function statusOf(r){const x=getResult(r);return x?x.status:"未検品"}
function renderOrder(){
  const items=state.currentItems;
  $("orderInvoice").textContent=state.currentInvoice;
  $("orderNo").textContent=items[0]?.order_no||"";
  $("orderShipName").textContent=items[0]?.ship_name||"";
  const ok=items.filter(i=>statusOf(i)==="OK").length;
  const hold=items.filter(i=>statusOf(i)==="保留").length;
  const pending=items.length-ok-hold;

  $("progressLabel").innerHTML =
    `<div class="progressChips">
      <span class="chip pending">未検品 ${pending}</span>
      <span class="chip ok">✓ OK ${ok}</span>
      <span class="chip hold">⚠ 保留 ${hold}</span>
    </div>`;

  $("itemList").innerHTML=items.map((r,i)=>{
    const st=statusOf(r);
    const cls=st==="OK"?"ok":st==="保留"?"hold":"pending";
    const label=st==="OK"?"✓ OK":st==="保留"?"⚠ 保留":"未検品";
    return `<div class="itemRow ${cls}" data-idx="${i}">
      <div class="state">${label}</div>
      <div><strong>${r.sku}</strong>　数量:${r.quantity}</div>
      <div>${r.item_name||""}</div>
    </div>`;
  }).join("");
  document.querySelectorAll(".itemRow").forEach(el=>el.onclick=()=>{state.currentIndex=Number(el.dataset.idx);renderItem()});
  show("orderView");
}

function firstPendingIndex(){return state.currentItems.findIndex(r=>statusOf(r)==="未検品")}
function renderItem(){const r=state.currentItems[state.currentIndex];if(!r)return renderComplete();
$("itemInvoice").textContent=r.invoice_no||"";
$("itemOrderNo").textContent=r.order_no||"";
$("itemShipName").textContent=r.ship_name||"";
$("itemSku").textContent=r.sku;
$("itemQty").textContent=`数量：${r.quantity}`;
$("itemName").textContent=r.item_name||"";
$("readValue").textContent="スキャン待機中";$("itemMsg").textContent="";$("quantityPanel")
.classList.add("hidden");$("checkedQtyInput").value="";const img=$("itemImage"),no=$("noImage");if(r.image_url){img.src=r.image_url;img.classList.remove("hidden");no.classList.add("hidden");img.onerror=()=>{img.classList.add("hidden");no
.classList.remove("hidden")}}else{
  img.classList.add("hidden");
  no.classList.remove("hidden");
}

updateStaffLabels();
show("itemView");
focusBarcodeInput();
}

function goNextItem(){const n=firstPendingIndex();if(n>=0){state.currentIndex=n;renderItem()}else renderComplete()}
function markOk(r,method,read,qty){
  const t=nowText();
  setResult(r,{
    invoice_no:r.invoice_no,
    order_no:r.order_no,
    line_no:r.line_no,
    sku:r.sku,
    read_barcode:read||"",
    master_barcode:state.barcodeMap.get(r.sku)||"",
    quantity:r.quantity,
    checked_quantity:qty||r.quantity,
    status:"OK",
    hold_reason:"",
    staff_code:state.staff.staff_code,
    admin_staff_code:"",
    check_method:method,
    barcode_register_flag:"0",
    admin_review_required:"0",
    started_at:state.startedAt,
    checked_at:t,
    completed_at:"",
    memo:""
  });
}
function markHold(r,reason,memo=""){
  const t=nowText();
  setResult(r,{
    invoice_no:r.invoice_no,
    order_no:r.order_no,
    line_no:r.line_no,
    sku:r.sku,
    read_barcode:state.lastReadBarcode||"",
    master_barcode:state.barcodeMap.get(r.sku)||"",
    quantity:r.quantity,
    checked_quantity:"",
    status:"保留",
    hold_reason:reason,
    staff_code:state.staff.staff_code,
    admin_staff_code:"",
    check_method:"hold",
    barcode_register_flag:"0",
    admin_review_required:"0",
    started_at:state.startedAt,
    checked_at:t,
    completed_at:"",
    memo:memo
  });
}

function handleBarcode(raw){
  const r = state.currentItems[state.currentIndex];
  const read = normalizeBarcode(raw);

  if(!r || !read) return;

  state.lastReadBarcode = read;
  $("readValue").textContent = read;

  const allowed = allowedBarcodes(r.sku);
  const isNoBarcodeItem = state.noBarcodeSet.has(r.sku);

  // BARCODE行もALIAS行もなく、NO_BARCODE行にある商品
  // → 商品バーコード未登録として登録候補フローへ進む
  if(!allowed.length && isNoBarcodeItem){
    return showNoBarcodeRegister(r, read);
  }

  // BARCODE行またはALIAS行があるが、読取値が一致しない
  // → 管理者確認が必要なバーコード不一致
  if(!allowed.includes(read)){
    return showBarcodeMismatch(r, read, allowed[0] || "");
  }

  // 通常一致
  if(Number(r.quantity || 1) >= 2){
    showQuantityModal(r);
  }else{
    markOk(r, "barcode", read, "1");
    showMsg("itemMsg", "✓ 一致", true);
    setTimeout(goNextItem, 600);
  }
}
function showModal(t,b,acts){$("modalTitle").textContent=t;$("modalBody").innerHTML=b;$("modalActions").innerHTML="";acts
.forEach(a=>{const btn=document.createElement("button");btn.className="btn "+(a.kind||"");btn
.textContent=a.label;btn.onclick=a.onClick;$("modalActions").appendChild(btn)});$("modal").classList.remove("hidden")}
function closeModal(){$("modal").classList.add("hidden")}
function showBarcodeMismatch(r,read,master){showModal("バーコード不一致",`<p><strong>品番</strong><br>${r.sku}</p><p><strong>登録</strong><br>${master||"登録なし"}</p><p><strong>読取</strong><br>${read}</p>`,[{label:"再スキャン",onClick:()=>{
  closeModal();
  focusBarcodeInput();
}},{label:"正しければ登録",kind:"primary",onClick:()=>showAdminRegister(r,read,master)},{label:"保留",kind:"danger",onClick:()=>{closeModal();showHoldModal(r)}}])}
function showAdminRegister(r,read,master){
  showModal(
    "管理者社員番号",
    `<input id="adminCodeInput" class="input big" inputmode="numeric" pattern="[0-9]*" autocomplete="off"><p id="adminMsg" class="msg"></p>`,
    [
      {
        label:"確認",
        kind:"primary",
        onClick:()=>{
          const code=$("adminCodeInput").value.trim();
          const admin=state.staffList.find(s=>s.staff_code===code&&s.active_flag==="1"&&s.is_admin==="1");

          if(!admin){
            $("adminMsg").textContent="管理者社員番号が確認できません";
            return;
          }

          showModal(
            "正しければ登録",
            `<p><strong>品番</strong><br>${r.sku}</p>
             <p><strong>商品名</strong><br>${r.item_name||""}</p>
             <p><strong>登録済</strong><br>${master||"登録なし"}</p>
             <p><strong>今回読取</strong><br>${read}</p>
             <p>このバーコードを管理者確認済みとして記録しますか？</p>`,
            [
              {
                label:"登録する",
                kind:"primary",
                onClick:()=>{
                  const arr=state.aliasMap.get(r.sku)||[];
                  if(!arr.includes(read))arr.push(read);
                  state.aliasMap.set(r.sku,arr);

                  markOk(r,"barcode_admin_alias",read,r.quantity);

                  const res=getResult(r);
                  if(res){
                    res.admin_staff_code=admin.staff_code;
                    res.barcode_register_flag="0";
                    res.admin_review_required="1";
                    res.memo="管理者確認済み・別バーコード";
                  }

                  closeModal();
                  showMsg("itemMsg","管理者確認済みとして記録しました",true);
                  setTimeout(goNextItem,800);
                }
              },
              {
                label:"キャンセル",
                onClick:()=>{
                  closeModal();
                  focusBarcodeInput();
                }
              }
            ]
          );
        }
      },
      {
        label:"キャンセル",
        onClick:()=>{
          closeModal();
          focusBarcodeInput();
        }
      }
    ]
  );

  setTimeout(()=>$("adminCodeInput")?.focus(),100);
}



function showNoBarcodeRegister(r, read){
  showModal(
    "商品バーコード未登録",
    `<p><strong>品番</strong><br>${r.sku}</p>
     <p><strong>商品名</strong><br>${r.item_name || ""}</p>
     <p><strong>今回読取</strong><br>${read}</p>
     <p>この商品バーコードを登録候補として保存しますか？</p>`,
    [
      {
        label:"登録候補にする",
        kind:"primary",
        onClick:()=>{
          closeModal();

          if(Number(r.quantity || 1) >= 2){
            showQuantityModalForNoBarcode(r, read);
            return;
          }

          markOk(r, "barcode_register_new", read, "1");

          const res = getResult(r);
          if(res){
            res.master_barcode = "";
            res.barcode_register_flag = "1";
            res.admin_review_required = "0";
            res.memo = "商品バーコード未登録・登録候補";
          }

          // 同じCSV内で同じSKUが再度出た場合、同じバーコードを許可扱いにする
          const arr = state.aliasMap.get(r.sku) || [];
          if(!arr.includes(read)) arr.push(read);
          state.aliasMap.set(r.sku, arr);

          showMsg("itemMsg", "商品バーコードを登録候補にしました", true);
          setTimeout(goNextItem, 800);
        }
      },
      {label:"再スキャン",onClick:()=>{
  closeModal();
  focusBarcodeInput();
}},
      {
        label:"保留",
        kind:"danger",
        onClick:()=>{
          closeModal();
          showHoldModal(r);
        }
      }
    ]
  );
}

function showQuantityModalForNoBarcode(r, read){
  const need = String(Number(r.quantity || 0));

  showModal("数量確認",
    `<div class="qtyModal">
      <div class="qtyModalSku">${r.sku}</div>
      <div class="qtyModalName">${r.item_name || ""}</div>
      <div class="qtyModalNeed">必要数量：${need}</div>
      <input id="modalQtyInput" class="input qtyInput" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="確認数量">
      <div class="keypad">
        <button data-mkey="1">1</button><button data-mkey="2">2</button><button data-mkey="3">3</button>
        <button data-mkey="4">4</button><button data-mkey="5">5</button><button data-mkey="6">6</button>
        <button data-mkey="7">7</button><button data-mkey="8">8</button><button data-mkey="9">9</button>
        <button data-mkey="clear">C</button><button data-mkey="0">0</button><button data-mkey="back">←</button>
      </div>
      <p id="modalQtyMsg" class="msg"></p>
    </div>`,
    [
      {
        label:"確定",
        kind:"primary",
        onClick:()=>{
          const input = $("modalQtyInput");
          const checked = String(Number(input.value || 0));

          if(!input.value){
            $("modalQtyMsg").textContent = "確認数量を入力してください";
            return;
          }

          if(checked !== need){
            $("modalQtyMsg").textContent = "数量が一致しません。保留処理を行ってください。";
            return;
          }

          closeModal();

          markOk(r, "barcode_register_new", read, checked);

          const res = getResult(r);
          if(res){
            res.master_barcode = "";
            res.barcode_register_flag = "1";
            res.admin_review_required = "0";
            res.memo = "商品バーコード未登録・登録候補";
          }

          // 同じCSV内で同じSKUが再度出た場合、同じバーコードを許可扱いにする
          const arr = state.aliasMap.get(r.sku) || [];
          if(!arr.includes(read)) arr.push(read);
          state.aliasMap.set(r.sku, arr);

          showMsg("itemMsg", "商品バーコードを登録候補にしました", true);
          setTimeout(goNextItem, 600);
        }
      },
      {
        label:"保留",
        kind:"danger",
        onClick:()=>{
          closeModal();
          showHoldModal(r);
        }
      },
      {
        label:"キャンセル",
        onClick:()=>{
          closeModal();
          focusBarcodeInput();
        }
      }
    ]
  );

  document.querySelectorAll("[data-mkey]").forEach(btn=>{
    btn.onclick=()=>{
      const k = btn.dataset.mkey;
      const input = $("modalQtyInput");

      if(k === "clear") input.value = "";
      else if(k === "back") input.value = input.value.slice(0, -1);
      else input.value += k;
    };
  });

  setTimeout(()=>$("modalQtyInput")?.focus(),100);
}

function showQuantityModal(r){
  const need = String(Number(r.quantity || 0));
  showModal("数量確認",
    `<div class="qtyModal">
      <div class="qtyModalSku">${r.sku}</div>
      <div class="qtyModalName">${r.item_name || ""}</div>
      <div class="qtyModalNeed">必要数量：${need}</div>
      <input id="modalQtyInput" class="input qtyInput" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="確認数量">
      <div class="keypad">
        <button data-mkey="1">1</button><button data-mkey="2">2</button><button data-mkey="3">3</button>
        <button data-mkey="4">4</button><button data-mkey="5">5</button><button data-mkey="6">6</button>
        <button data-mkey="7">7</button><button data-mkey="8">8</button><button data-mkey="9">9</button>
        <button data-mkey="clear">C</button><button data-mkey="0">0</button><button data-mkey="back">←</button>
      </div>
      <p id="modalQtyMsg" class="msg"></p>
    </div>`,
    [
      {label:"確定", kind:"primary", onClick:()=>{
        const input = $("modalQtyInput");
        const checked = String(Number(input.value || 0));
        if(!input.value){
          $("modalQtyMsg").textContent = "確認数量を入力してください";
          return;
        }
        if(checked !== need){
          $("modalQtyMsg").textContent = "数量が一致しません。保留処理を行ってください。";
          return;
        }
        closeModal();
        markOk(r, state.lastReadBarcode ? "barcode" : "manual", state.lastReadBarcode, checked);
        showMsg("itemMsg","✓ 数量一致",true);
        setTimeout(goNextItem,600);
      }},
      {label:"保留", kind:"danger", onClick:()=>{ closeModal(); showHoldModal(r); }},
      {label:"キャンセル", onClick:()=>{ closeModal(); focusBarcodeInput(); }}
    ]
  );

  document.querySelectorAll("[data-mkey]").forEach(btn=>{
    btn.onclick=()=>{
      const k=btn.dataset.mkey, input=$("modalQtyInput");
      if(k==="clear") input.value="";
      else if(k==="back") input.value=input.value.slice(0,-1);
      else input.value += k;
    };
  });
  setTimeout(()=>$("modalQtyInput")?.focus(),100);
}

function showHoldModal(r){const reasons=["数量不足","商品バーコード不明","商品なし","送り状修正","その他"];showModal("保留理由",`<div>${reasons.map(x=>`<button class="btn holdReason" data-r="${x}">${x}</button>`).join("")}<textarea id="holdMemo" class="input" placeholder="メモ"></textarea></div>`,[{label:"キャンセル",onClick:()=>{closeModal();}}]);document.querySelectorAll(".holdReason").forEach(btn=>btn.onclick=()=>{markHold(r,btn.dataset.r,$("holdMemo").value||"");closeModal();renderOrder()})}
function renderComplete(){
  const items=state.currentItems;
  const resultRows=items.map(i=>getResult(i)).filter(Boolean);
  const ok=items.filter(i=>statusOf(i)==="OK").length;
  const hold=items.filter(i=>statusOf(i)==="保留").length;
  const pending=items.length-ok-hold;

  if(pending>0 || resultRows.length<items.length){
    showModal("未検品があります",
      `<p>この送り状の商品がまだすべて検品されていません。</p>
       <p>商品数：${items.length}<br>OK：${ok}<br>保留：${hold}<br>未検品：${pending}</p>`,
      [{label:"検品に戻る",kind:"primary",onClick:()=>{closeModal();const i=firstPendingIndex();state.currentIndex=i>=0?i:0;renderItem()}}]
    );
    return;
  }

  $("completeTitle").textContent=hold?"保留":"検品完了";
  $("completeSummary").textContent=
    `送り状No：${state.currentInvoice}\n注文番号：${items[0]?.order_no||""}\n商品数：${items.length}\nOK：${ok}\n保留：${hold}\n未検品：${pending}`;

  /* 完了画面を開くたびに保存ボタン状態を初期化 */
  $("saveResultBtn").disabled = false;
  $("saveResultBtn").textContent = "保存";
  $("nextInvoiceBtn").disabled = true;
  $("nextInvoiceBtn").classList.add("hidden");
  $("saveMsg").textContent = "";

  show("completeView");
}

function buildResultCsv(){
  const completedAt=nowText();

  const headers=[
    "result_id",
    "invoice_no",
    "invoice_status",
    "order_no",
    "line_no",
    "sku",
    "read_barcode",
    "master_barcode",
    "quantity",
    "checked_quantity",
    "status",
    "hold_reason",
    "staff_code",
    "admin_staff_code",
    "check_method",
    "barcode_register_flag",
    "admin_review_required",
    "started_at",
    "checked_at",
    "completed_at",
    "memo"
  ];

  const invoiceStatus=state.currentItems.some(i=>statusOf(i)==="保留")?"HOLD":"OK";

  const rows=state.results
    .filter(r=>r.invoice_no===state.currentInvoice)
    .map((r,i)=>({
      result_id:`${state.currentInvoice}_${i+1}`,
      invoice_status:invoiceStatus,
      barcode_register_flag:r.barcode_register_flag||"0",
      admin_review_required:r.admin_review_required||"0",
      ...r,
      completed_at:completedAt
    }));

  return [
    headers.join(","),
    ...rows.map(r=>headers.map(h=>csvEscape(r[h])).join(","))
  ].join("\r\n");
}

function downloadCsv(){
  const csv="\uFEFF"+buildResultCsv();
  const d=new Date(),p=n=>String(n).padStart(2,"0");
  const name=`inspection_result_${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.csv`;

  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");

  a.href=url;
  a.download=name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  showMsg("saveMsg","保存しました。次の送り状へ進んでください。",true);

  $("saveResultBtn").disabled = true;
  $("saveResultBtn").textContent = "保存済み";

  $("nextInvoiceBtn").disabled = false;
  $("nextInvoiceBtn").classList.remove("hidden");
}

$("loginBtn").onclick=()=>{const code=$("staffCodeInput").value.trim();if(!code)return showMsg("loginMsg","社員番号を入力してください");state.pendingStaffCode=code;show("loadView")};
$("bundleFile").addEventListener("change",renderLoadedCsvList);
$("loadCsvBtn").onclick=async()=>{try{const b=await readBundleCsv($("bundleFile"));state.staffList=b.staffRows;state.inspectionRows=b.itemRows;const staff=state.staffList.find(s=>s.staff_code===state.pendingStaffCode&&s.active_flag==="1");if(!staff){
      showModal("社員番号エラー",
        `<p>社員番号が登録されていない、または使用できません。</p>
         <p>入力した社員番号：${state.pendingStaffCode}</p>`,
        [{label:"社員番号を入力し直す",kind:"primary",onClick:()=>{closeModal();state.pendingStaffCode="";$("staffCodeInput").value="";$("loadMsg").textContent="";show("loginView");setTimeout(()=>$("staffCodeInput").focus(),100)}}]
      );
      return;
    }state.staff=staff;
    state.barcodeMap.clear();
    b.barcodeRows.forEach(r=>{if(r.sku&&r.barcode)state.barcodeMap.set(r.sku,normalizeBarcode(r.barcode))});
    state.aliasMap.clear();
    b.aliasRows.forEach(r=>{if(!r.sku||!r.barcode)return;
    const arr=state.aliasMap.get(r.sku)||[];
    arr.push(normalizeBarcode(r.barcode));
    state.aliasMap.set(r.sku,arr)});
    state.noBarcodeSet.clear();
    b.noBarcodeRows.forEach(r=>{if(r.sku)state.noBarcodeSet.add(r.sku)});
    updateStaffLabels();
show("scanInvoiceView");
resetInvoiceScreen();
}catch(e){showMsg("loadMsg","CSV読込に失敗しました： "+e.message)}};

if($("changeStaffBtn")) $("changeStaffBtn").onclick=showChangeStaffModal;
if($("changeStaffBtnOrder")) $("changeStaffBtnOrder").onclick=showChangeStaffModal;
if($("changeStaffBtnItem")) $("changeStaffBtnItem").onclick=showChangeStaffModal;

function clearInvoiceInput(){
  focusInvoiceInput();
}

$("invoiceSearchBtn").onclick=()=>{
  const inv=normalizeInvoiceNo($("invoiceInput").value);

  if(!inv){
    showMsg("invoiceMsg","送り状Noを読み込んでください");
    clearInvoiceInput();
    return;
  }

  const items=state.inspectionRows.filter(r=>normalizeInvoiceNo(r.invoice_no)===inv);

  if(!items.length){
    showMsg("invoiceMsg",`該当なし：${inv} は検品データにありません。もう一度読み込んでください。`);
    clearInvoiceInput();
    return;
  }

  state.currentInvoice=inv;
  state.currentItems=items;
  state.currentIndex=0;
  state.lastReadBarcode="";
  showMsg("invoiceMsg","");

  const ok=items.filter(i=>statusOf(i)==="OK").length;
  const hold=items.filter(i=>statusOf(i)==="保留").length;
  const pending=items.length-ok-hold;
  const existing=state.results.filter(r=>r.invoice_no===inv);

  if(existing.length>0){
    if(pending===0 && hold===0 && ok===items.length){
      showModal("完了済み送り状",
        `<p>この送り状は検品完了済みです。</p>
         <p>送り状No：${inv}</p>
         <p>OK：${ok}<br>保留：${hold}<br>未検品：${pending}</p>`,
        [
          {label:"管理者再検品",kind:"primary",onClick:()=>showAdminReinspection(inv)},
          {label:"この画面を閉じる",onClick:()=>{
  closeModal();
  show("scanInvoiceView");
  resetInvoiceScreen();
}}
        ]
      );
      return;
    }

    const title=hold>0?"保留中の送り状":"作業途中の送り状";
    const note=hold>0?"この送り状は保留中です。":"この送り状は作業途中です。";
    showModal(title,
      `<p>${note}</p>
       <p>送り状No：${inv}</p>
       <p>OK：${ok}<br>保留：${hold}<br>未検品：${pending}</p>`,
      [
        {label:"続きから再開",kind:"primary",onClick:()=>{closeModal();const i=firstPendingIndex();state.currentIndex=i>=0?i:0;renderOrder()}},
        {label:"最初からやり直す",kind:"danger",onClick:()=>{state.results=state.results.filter(r=>r.invoice_no!==inv);state.startedAt=nowText();closeModal();renderOrder()}},
        {label:"キャンセル",onClick:()=>{
  closeModal();
  show("scanInvoiceView");
  resetInvoiceScreen();
}}
      ]
    );
    return;
  }

    state.startedAt=nowText();
  renderOrder();
};

$("invoiceInput").addEventListener("keydown", e => {
  if(e.key === "Enter"){
    e.preventDefault();
    $("invoiceSearchBtn").click();
  }
});

function showAdminReinspection(inv){
  showModal("管理者社員番号",
    `<input id="reinspectAdminCodeInput" class="input big" inputmode="numeric" pattern="[0-9]*" autocomplete="off">
     <p id="reinspectAdminMsg" class="msg"></p>`,
    [
      {label:"確認",kind:"primary",onClick:()=>{
        const code=$("reinspectAdminCodeInput").value.trim();
        const admin=state.staffList.find(s=>s.staff_code===code&&s.active_flag==="1"&&s.is_admin==="1");
        if(!admin){
          $("reinspectAdminMsg").textContent="管理者社員番号が確認できません";
          return;
        }
        showModal("再検品開始",
  `<p>再検品を開始しますか？</p>
   <p>※既存の検品結果は削除されます。</p>
   <p>管理者：${admin.staff_name||admin.staff_code}</p>`,
  [
    {label:"再検品開始",kind:"danger",onClick:()=>{
      state.results=state.results.filter(r=>r.invoice_no!==inv);
      state.startedAt=nowText();
      state.currentIndex=0;
      state.lastReadBarcode="";
      closeModal();
      renderOrder();
    }},
    {label:"キャンセル",onClick:()=>{
      closeModal();
      show("scanInvoiceView");
      resetInvoiceScreen();
    }}
  ]
);
      }},
      {label:"キャンセル",onClick:()=>{
  closeModal();
  show("scanInvoiceView");
  resetInvoiceScreen();
}}
    ]
  );
  setTimeout(()=>$("reinspectAdminCodeInput")?.focus(),100);
}


$("startInspectionBtn").onclick=()=>{
  const i=firstPendingIndex();
  if(i<0)return renderComplete();
  state.currentIndex=i;
  renderItem();
};

$("backToInvoiceBtn").onclick=()=>{
  show("scanInvoiceView");
  resetInvoiceScreen();
};

$("toOrderBtn").onclick=renderOrder;

$("holdBtn").onclick=()=>showHoldModal(state.currentItems[state.currentIndex]);

$("manualBtn").onclick=()=>{
  const r=state.currentItems[state.currentIndex];
  if(Number(r.quantity||1)>=2){
    state.lastReadBarcode="";
    $("readValue").textContent="手動確認";
    showQuantityModal(r);
  }else{
    markOk(r,"manual","","1");
    showMsg("itemMsg","手動確認OK",true);
    setTimeout(goNextItem,600);
  }
};
$("barcodeInput").addEventListener("keydown",e=>{if(e.key==="Enter"){clearTimeout(barcodeInputTimer);const v=$("barcodeInput").value;
$("barcodeInput").value="";
handleBarcode(v)}});
$("barcodeInput").addEventListener("change",e=>{const v=e.target.value;
if(v){e.target.value="";handleBarcode(v)}});
document.querySelectorAll(".keypad button").forEach(btn=>btn.onclick=()=>{const k=btn.dataset.key,input=$("checkedQtyInput");
if(k==="clear")input.value="";else if(k==="back")input.value=input.value.slice(0,-1);else input.value+=k});
$("confirmQtyBtn").onclick=()=>{const r=state.currentItems[state.currentIndex],need=String(Number(r.quantity||0)),checked=String(Number($("checkedQtyInput").value||0));
if(!$("checkedQtyInput").value)return showMsg("itemMsg","確認数量を入力してください");
if(need!==checked)return showMsg("itemMsg","数量が一致しません。保留処理を行ってください。");
markOk(r,state.lastReadBarcode?"barcode":"manual",state.lastReadBarcode,checked);
showMsg("itemMsg","✓ 数量一致",true);setTimeout(goNextItem,600)};
$("saveResultBtn").onclick=downloadCsv;
$("nextInvoiceBtn").onclick=()=>{
  $("nextInvoiceBtn").classList.add("hidden");
  $("saveMsg").textContent="";
  show("scanInvoiceView");
  resetInvoiceScreen();
};
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState === "visible"){
    const activeView = document.querySelector(".view.active");
    if(activeView && activeView.id === "itemView"){
      focusBarcodeInput();
    }
  }
});
$("reloadBtn").onclick=()=>showModal(
  "CSV再読込",
  "<p>未保存の検品データがある場合は、先に保存してください。</p>",
  [
    {
      label:"保存してから再読込",
      kind:"primary",
      onClick:()=>{
        closeModal();
        renderComplete();
      }
    },
    {
  label:"再読込する",
  onClick:()=>{
    closeModal();
    show("loadView");
    if($("invoiceInput")) $("invoiceInput").value = "";
if($("invoiceMsg")) $("invoiceMsg").textContent = "";
  }
},
    {
      label:"キャンセル",
      onClick:closeModal
    }
  ]
);

function normalizeInvoiceNo(v){
  let s = String(v || "")
    .replace(/\s/g, "")
    .replace(/　/g, "")
    .replace(/-/g, "")
    .replace(/－/g, "")
    .replace(/ー/g, "")
    .replace(/―/g, "")
    .trim();

  // 佐川：D + 番号 + D
  if(/^D\d+D$/i.test(s)){
    s = s.slice(1, -1);
  }

  // ヤマト：A + 番号 + A
  if(/^A\d+A$/i.test(s)){
    s = s.slice(1, -1);
  }

  return s;
}
