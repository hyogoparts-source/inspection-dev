
const state={staff:null,staffList:[],inspectionRows:[],processedRows:[],barcodeMap:new Map(),aliasMap:new Map(),noBarcodeSet:new Set(),currentInvoice:null,currentItems:[],currentIndex:0,results:[],startedAt:null,lastReadBarcode:"",lastMismatchBarcode:"",lastMismatchMaster:""};
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
  showModal(
    "作業者変更",
    `<p>以後の検品結果は、新しい作業者の社員番号で記録されます。</p>
     <p>すでに検品済みの商品は変更されません。</p>

     <label class="label">社員番号</label>

     <input
       id="changeStaffCodeInput"
       class="input big"
       inputmode="numeric"
       pattern="[0-9]*"
       autocomplete="off"
       readonly
     >

     <div class="keypad">
       <button type="button" data-change-staff-key="1">1</button>
       <button type="button" data-change-staff-key="2">2</button>
       <button type="button" data-change-staff-key="3">3</button>

       <button type="button" data-change-staff-key="4">4</button>
       <button type="button" data-change-staff-key="5">5</button>
       <button type="button" data-change-staff-key="6">6</button>

       <button type="button" data-change-staff-key="7">7</button>
       <button type="button" data-change-staff-key="8">8</button>
       <button type="button" data-change-staff-key="9">9</button>

       <button type="button" data-change-staff-key="clear">C</button>
       <button type="button" data-change-staff-key="0">0</button>
       <button type="button" data-change-staff-key="back">←</button>
     </div>

     <p id="changeStaffMsg" class="msg"></p>`,
    [
      {
        label:"変更",
        kind:"primary",
        onClick:()=>{
          const code = $("changeStaffCodeInput").value.trim();

          if(!code){
            $("changeStaffMsg").textContent =
              "社員番号を入力してください";
            return;
          }

          const staff = state.staffList.find(
            s =>
              s.staff_code === code &&
              s.active_flag === "1"
          );

          if(!staff){
            $("changeStaffMsg").textContent =
              "社員番号が登録されていない、または使用できません";
            return;
          }

          state.staff = staff;
          updateStaffLabels();
          closeModal();

          if(
            document.querySelector(".view.active")?.id === "itemView"
          ){
            focusBarcodeInput();
          }
        }
      },
      {
        label:"キャンセル",
        onClick:()=>{
          closeModal();

          if(
            document.querySelector(".view.active")?.id === "itemView"
          ){
            focusBarcodeInput();
          }
        }
      }
    ]
  );

  document
    .querySelectorAll("[data-change-staff-key]")
    .forEach(btn=>{
      btn.onclick = ()=>{
        const input = $("changeStaffCodeInput");
        const key = btn.dataset.changeStaffKey;

        if(key === "clear"){
          input.value = "";
        }else if(key === "back"){
          input.value = input.value.slice(0, -1);
        }else{
          input.value += key;
        }

        $("changeStaffMsg").textContent = "";
      };
    });
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

  // すぐフォーカス
  input.focus();

  if($("readValue")){
    $("readValue").textContent = "スキャン待機中";
  }

  // 画面描画直後にもう一度フォーカス
  requestAnimationFrame(() => {
    input.focus();
  });

  // AsReader / iPhone Safari 用の保険。待ち時間を短めにする
  setTimeout(() => {
    input.focus();
  }, 50);

  const btn = $("scanEnableBtn");
  if(btn){
    btn.textContent = "バーコード読取中";
    btn.classList.add("active");
  }
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
const staffRows=[],itemRows=[],barcodeRows=[],aliasRows=[],noBarcodeRows=[],processedRows=[];
for(const r of rows){const t=String(r.record_type||"").trim().toUpperCase();
if(t==="STAFF")staffRows.push(r);
else if(t==="ITEM")itemRows.push(r);else if(t==="BARCODE")barcodeRows.push(r);
else if(t==="ALIAS")aliasRows.push(r);
else if(t==="NO_BARCODE")noBarcodeRows.push(r);
else if(t==="PROCESSED")processedRows.push(r)}
if(!staffRows.length)throw new Error("STAFF行がありません");
if(!itemRows.length && !processedRows.length)throw new Error("ITEM行またはPROCESSED行がありません");
if(!barcodeRows.length && !noBarcodeRows.length)throw new Error("BARCODE行またはNO_BARCODE行がありません");
return{staffRows,itemRows,barcodeRows,aliasRows,noBarcodeRows,processedRows}}
function normalizeBarcode(v){return String(v||"").replace(/[\s-]/g,"")}
function normalizeSkuCode(v){
  return normalizeBarcode(v)
    .replace(/\*/g, "")
    .toUpperCase();
}

function isMazdaPartCodeMatch(readBarcode, masterBarcode){
  const read = normalizeSkuCode(readBarcode);
  const master = normalizeSkuCode(masterBarcode);

  if(!read || !master) return false;

  // 短すぎる品番は誤判定防止のため対象外
  if(master.length < 6) return false;

  // そのまま一致
  // 例：K123V1370
  if(read === master) return true;

  // 右1文字を除外して一致
  // 例：K123V1370A → K123V1370
  if(
    read.length === master.length + 1 &&
    read.startsWith(master)
  ){
    return true;
  }

  // 左1文字・右1文字を除外して一致
  // 例：PK123V1370Z → K123V1370
  if(
    read.length === master.length + 2 &&
    read.slice(1, -1) === master
  ){
    return true;
  }

  return false;
}

function isAllowedBarcodeForSku(sku, readBarcode){
  const read = normalizeBarcode(readBarcode);
  const skuCode = normalizeSkuCode(sku);
  const masters = allowedBarcodes(sku);

  return masters.some(master => {
    const masterNorm = normalizeBarcode(master);

    // 通常バーコードは今まで通り完全一致
    if(read === masterNorm) return true;

    // barcode_master に「ハイフンなし品番」が入っている場合だけ、
    // 純正品番バーコードとして判定する
    if(normalizeSkuCode(masterNorm) === skuCode){
      return isMazdaPartCodeMatch(readBarcode, masterNorm);
    }

    return false;
  });
}

function itemKey(r){return `${r.invoice_no}__${r.line_no}__${r.sku}`}
function getResult(r){return state.results.find(x=>x.key===itemKey(r))}
function setResult(r,d){
  const k=itemKey(r);
  const e=state.results.find(x=>x.key===k);

  if(e){
    Object.assign(e,d);
  }else{
    state.results.push({key:k,...d});
  }

  saveProgressToLocal();
}
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
  const startBtn = $("startInspectionBtn");

if(startBtn){
  if(pending === 0){
    startBtn.textContent = hold > 0 ? "保留内容を保存へ" : "検品完了へ";
  }else if(ok > 0 || hold > 0){
    startBtn.textContent = "検品再開";
  }else{
    startBtn.textContent = "検品開始";
  }
}
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
  document.querySelectorAll(".itemRow").forEach(el=>{
  el.addEventListener("pointerdown", ()=>{
    focusBarcodeInput();
  });

  el.onclick=()=>{
    state.currentIndex=Number(el.dataset.idx);
    renderItem();
  };
});
  show("orderView");

  // 商品一覧画面の時点で、商品バーコード入力欄を先に起こしておく
  // AsReaderのPlugged待ち時間を商品詳細画面に入る前に済ませるため
   setTimeout(() => {
  focusBarcodeInput();
}, 30);

setTimeout(() => {
  focusBarcodeInput();
}, 80);
}

function firstPendingIndex(){return state.currentItems.findIndex(r=>statusOf(r)==="未検品")}
function renderItem(){const r=state.currentItems[state.currentIndex];if(!r)return renderComplete();
$("itemInvoice").textContent=r.invoice_no||"";
$("itemOrderNo").textContent=r.order_no||"";
$("itemShipName").textContent=r.ship_name||"";
$("itemSku").textContent=r.sku;
$("itemQty").textContent=`数量：${r.quantity}`;
$("itemName").textContent=r.item_name||"";
state.lastReadBarcode="";
state.lastMismatchBarcode="";
state.lastMismatchMaster="";
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

function markManualAfterMismatch(r, read, master, qty){
  const safeRead = read || state.lastMismatchBarcode || state.lastReadBarcode || "";
  const safeMaster = master || state.lastMismatchMaster || state.barcodeMap.get(r.sku) || "";

  markOk(r, "manual_after_mismatch", safeRead, qty);

  const res = getResult(r);
  if(res){
    res.master_barcode = safeMaster;
    res.barcode_register_flag = "1";
    res.admin_review_required = "1";
    res.memo = "バーコード不一致後に手動確認・管理者確認待ち";
    saveProgressToLocal();
  }
}

function markAdminProductOkBarcodeWrong(r, read, master, adminCode, qty){
  markOk(r, "admin_product_ok_barcode_wrong", read, qty);

  const res = getResult(r);
  if(res){
    res.master_barcode = master || "";
    res.admin_staff_code = adminCode || "";
    res.barcode_register_flag = "0";
    res.admin_review_required = "0";
    res.memo = "商品は管理者確認済み。読取バーコードは登録しない";
    saveProgressToLocal();
  }
}

function markBarcodeReplaceAdmin(r, read, master, adminCode, qty){
  markOk(r, "barcode_replace_admin", read, qty);

  const res = getResult(r);
  if(res){
    res.master_barcode = master || "";
    res.admin_staff_code = adminCode || "";
    res.barcode_register_flag = "1";
    res.admin_review_required = "0";
    res.memo = "管理者現物確認済み。登録済みバーコードを変更";
    saveProgressToLocal();
  }
}

function completeAdminBarcodeDecision(r, read, master, adminCode, decision, qty){
  if(decision === "product_ok_no_register"){
    markAdminProductOkBarcodeWrong(r, read, master, adminCode, qty);
    showMsg("itemMsg", "管理者確認OK。バーコードは登録しません", true);
  }else if(decision === "replace_barcode"){
    markBarcodeReplaceAdmin(r, read, master, adminCode, qty);
    showMsg("itemMsg", "管理者確認OK。バーコード変更対象として記録しました", true);
  }

  setTimeout(goNextItem, 800);
}

function showAdminBarcodeDecisionQuantityModal(r, read, master, adminCode, decision){
  if(document.activeElement) document.activeElement.blur();

  const need = String(Number(r.quantity || 0));

  showModal("数量確認",
    `<div class="qtyModal">
      <div class="qtyModalSku">${r.sku}</div>
      <div class="qtyModalName">${r.item_name || ""}</div>
      <div class="qtyModalNeed">必要数量：${need}</div>
      <input id="modalQtyInput" class="input qtyInput" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="確認数量" readonly>
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
          completeAdminBarcodeDecision(r, read, master, adminCode, decision, checked);
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
          showBarcodeMismatch(r, read, master);
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
  const activeView = document.querySelector(".view.active");

  // 商品詳細画面以外では、商品バーコードとして処理しない
  if(!activeView || activeView.id !== "itemView"){
    if($("barcodeInput")) $("barcodeInput").value = "";
    return;
  }

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
    state.lastMismatchBarcode = "";
    state.lastMismatchMaster = "";
    return showNoBarcodeRegister(r, read);
  }

  // BARCODE行またはALIAS行があるが、読取値が一致しない
  // → 管理者確認が必要なバーコード不一致
  if(!isAllowedBarcodeForSku(r.sku, read)){
  state.lastMismatchBarcode = read;
  state.lastMismatchMaster = allowed[0] || "";
  return showBarcodeMismatch(r, read, allowed[0] || "");
}

  // 通常一致
  state.lastMismatchBarcode = "";
  state.lastMismatchMaster = "";
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

function showBarcodeMismatch(r,read,master){
  state.lastMismatchBarcode = read;
  state.lastMismatchMaster = master || "";

  showModal(
    "登録済みバーコードと違います",
    `<p><strong>品番</strong><br>${r.sku}</p>
     <p><strong>登録済みバーコード</strong><br>${master || "登録なし"}</p>
     <p><strong>今回読取</strong><br>${read}</p>
     <p class="msg">
       この商品には、すでに登録済みのバーコードがあります。<br>
       読み間違いの可能性がある場合は再スキャンしてください。<br>
       商品が正しいか判断が必要な場合は、管理者確認へ進んでください。
     </p>`,
    [
      {
        label:"再スキャン",
        onClick:()=>{
          state.lastReadBarcode = "";
          state.lastMismatchBarcode = "";
          state.lastMismatchMaster = "";
          closeModal();
          focusBarcodeInput();
        }
      },
      {
        label:"管理者確認",
        kind:"primary",
        onClick:()=>showAdminRegister(r,read,master)
      },
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

function showAdminRegister(r, read, master){
  showModal(
    "管理者社員番号",
    `<p>登録済みバーコードと違うため、管理者確認が必要です。</p>

     <input
       id="adminCodeInput"
       class="input big"
       inputmode="numeric"
       pattern="[0-9]*"
       autocomplete="off"
       readonly
     >

     <div class="keypad">
       <button type="button" data-admin-key="1">1</button>
       <button type="button" data-admin-key="2">2</button>
       <button type="button" data-admin-key="3">3</button>

       <button type="button" data-admin-key="4">4</button>
       <button type="button" data-admin-key="5">5</button>
       <button type="button" data-admin-key="6">6</button>

       <button type="button" data-admin-key="7">7</button>
       <button type="button" data-admin-key="8">8</button>
       <button type="button" data-admin-key="9">9</button>

       <button type="button" data-admin-key="clear">C</button>
       <button type="button" data-admin-key="0">0</button>
       <button type="button" data-admin-key="back">←</button>
     </div>

     <p id="adminMsg" class="msg"></p>`,
    [
      {
        label:"確認",
        kind:"primary",
        onClick:()=>{
          const code = $("adminCodeInput").value.trim();

          if(!code){
            $("adminMsg").textContent =
              "管理者社員番号を入力してください";
            return;
          }

          const admin = state.staffList.find(
            s =>
              s.staff_code === code &&
              s.active_flag === "1" &&
              s.is_admin === "1"
          );

          if(!admin){
            $("adminMsg").textContent =
              "管理者社員番号が確認できません";
            return;
          }

          showModal(
            "管理者確認",
            `<p><strong>品番</strong><br>${r.sku}</p>
             <p><strong>商品名</strong><br>${r.item_name || ""}</p>
             <p><strong>登録済みバーコード</strong><br>${master || "登録なし"}</p>
             <p><strong>今回読取</strong><br>${read}</p>
             <p class="msg">
               現物を確認して、処理を選んでください。<br>
               商品は正しいが今回読取バーコードを登録しない場合は
               「商品OK・バーコードは登録しない」を選んでください。<br>
               今回読取バーコードを今後の正しいバーコードにする場合だけ
               「バーコードを変更する」を選んでください。
             </p>`,
            [
              {
                label:"商品OK・バーコードは登録しない",
                kind:"primary",
                onClick:()=>{
                  closeModal();

                  if(Number(r.quantity || 1) >= 2){
                    showAdminBarcodeDecisionQuantityModal(
                      r,
                      read,
                      master,
                      admin.staff_code,
                      "product_ok_no_register"
                    );
                    return;
                  }

                  completeAdminBarcodeDecision(
                    r,
                    read,
                    master,
                    admin.staff_code,
                    "product_ok_no_register",
                    "1"
                  );
                }
              },
              {
                label:"バーコードを変更する",
                kind:"primary",
                onClick:()=>{
                  closeModal();

                  if(Number(r.quantity || 1) >= 2){
                    showAdminBarcodeDecisionQuantityModal(
                      r,
                      read,
                      master,
                      admin.staff_code,
                      "replace_barcode"
                    );
                    return;
                  }

                  completeAdminBarcodeDecision(
                    r,
                    read,
                    master,
                    admin.staff_code,
                    "replace_barcode",
                    "1"
                  );
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
                  showBarcodeMismatch(r, read, master);
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
          showBarcodeMismatch(r, read, master);
        }
      }
    ]
  );

  document
    .querySelectorAll("[data-admin-key]")
    .forEach(btn=>{
      btn.onclick = ()=>{
        const input = $("adminCodeInput");
        const key = btn.dataset.adminKey;

        if(key === "clear"){
          input.value = "";
        }else if(key === "back"){
          input.value = input.value.slice(0, -1);
        }else{
          input.value += key;
        }

        $("adminMsg").textContent = "";
      };
    });
}

function showNoBarcodeRegister(r, read){
  showModal(
    "初回バーコード登録確認",
    `<p><strong>品番</strong><br>${r.sku}</p>
     <p><strong>商品名</strong><br>${r.item_name || ""}</p>
     <p><strong>今回読取</strong><br>${read}</p>
     <p>この商品は、まだバーコードが登録されていません。<br>商品とバーコードが正しければ、このバーコードを初回バーコードとして登録します。</p>`,
    [
      {
        label:"このバーコードで登録してOK",
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
            res.memo = "初回バーコード登録・スマホ確認済み";
            saveProgressToLocal();
          }

          // 同じCSV内で同じSKUが再度出た場合、同じバーコードを許可扱いにする
          const arr = state.aliasMap.get(r.sku) || [];
          if(!arr.includes(read)) arr.push(read);
          state.aliasMap.set(r.sku, arr);

          showMsg("itemMsg", "初回バーコードとして記録しました", true);
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
  if(document.activeElement) document.activeElement.blur();

  const need = String(Number(r.quantity || 0));

  showModal("数量確認",
    `<div class="qtyModal">
      <div class="qtyModalSku">${r.sku}</div>
      <div class="qtyModalName">${r.item_name || ""}</div>
      <div class="qtyModalNeed">必要数量：${need}</div>
      <input id="modalQtyInput" class="input qtyInput" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="確認数量" readonly>
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
            res.memo = "初回バーコード登録・スマホ確認済み";
            saveProgressToLocal();
          }

          // 同じCSV内で同じSKUが再度出た場合、同じバーコードを許可扱いにする
          const arr = state.aliasMap.get(r.sku) || [];
          if(!arr.includes(read)) arr.push(read);
          state.aliasMap.set(r.sku, arr);

          showMsg("itemMsg", "初回バーコードとして記録しました", true);
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
} 

function showQuantityModal(r, mode="auto"){
  if(document.activeElement) document.activeElement.blur();

  const need = String(Number(r.quantity || 0));
  showModal("数量確認",
    `<div class="qtyModal">
      <div class="qtyModalSku">${r.sku}</div>
      <div class="qtyModalName">${r.item_name || ""}</div>
      <div class="qtyModalNeed">必要数量：${need}</div>
      <input id="modalQtyInput" class="input qtyInput" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="確認数量" readonly>
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

        if(mode === "manual_after_mismatch"){
          markManualAfterMismatch(r, state.lastMismatchBarcode || state.lastReadBarcode, state.lastMismatchMaster || "", checked);
        }else if(mode === "manual"){
          markOk(r, "manual", "", checked);
        }else{
          markOk(r, state.lastReadBarcode ? "barcode" : "manual", state.lastReadBarcode, checked);
        }

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
}

function showHoldModal(r){
  const reasons = [
    "数量不足",
    "商品バーコード不明",
    "商品なし",
    "送り状修正",
    "その他"
  ];

  showModal(
    "保留理由",
    `<p>保留にする理由を選んでください。</p>
     <div class="holdReasonList">
       ${reasons.map(reason =>
         `<button
            type="button"
            class="btn holdReason"
            data-r="${reason}"
          >${reason}</button>`
       ).join("")}
     </div>`,
    [
      {
        label:"キャンセル",
        onClick:()=>{
          closeModal();
          focusBarcodeInput();
        }
      }
    ]
  );

  document
    .querySelectorAll(".holdReason")
    .forEach(btn=>{
      btn.onclick = ()=>{
        markHold(r, btn.dataset.r, "");
        closeModal();
        renderOrder();
      };
    });
}

function renderComplete(){
  const items = state.currentItems;
  const resultRows = items.map(i => getResult(i)).filter(Boolean);
  const ok = items.filter(i => statusOf(i) === "OK").length;
  const hold = items.filter(i => statusOf(i) === "保留").length;
  const pending = items.length - ok - hold;

  if(pending > 0 || resultRows.length < items.length){
    showModal(
      "未検品があります",
      `<p>この送り状の商品がまだすべて検品されていません。</p>
       <p>
         商品数：${items.length}<br>
         OK：${ok}<br>
         保留：${hold}<br>
         未検品：${pending}
       </p>`,
      [
        {
          label:"検品に戻る",
          kind:"primary",
          onClick:()=>{
            closeModal();
            const i = firstPendingIndex();
            state.currentIndex = i >= 0 ? i : 0;
            renderItem();
          }
        }
      ]
    );
    return;
  }

    saveCurrentResultToLocal();
  updateLocalResultCount();

  const allDone = isAllBundleInvoicesCompletedOnThisDevice();

  if(allDone){
    $("completeTitle").textContent = "すべて完了";
  }else{
    $("completeTitle").textContent = hold ? "保留" : "検品完了";
  }

  $("completeSummary").textContent =
    (allDone ? "すべての送り状の検品が完了しました。\n\n" : "") +
    `送り状No：${state.currentInvoice}\n` +
    `注文番号：${items[0]?.order_no || ""}\n` +
    `商品数：${items.length}\n` +
    `OK：${ok}\n` +
    `保留：${hold}\n` +
    `未検品：${pending}`;

  const saveBtn = $("saveResultBtn");
  const hasUnexported = hasUnsavedLocalResults();

  if(saveBtn){
    saveBtn.classList.remove("hidden");

    if(hasUnexported){
      saveBtn.disabled = false;
      saveBtn.textContent = "検品結果CSVをまとめて保存";
      saveBtn.classList.add("primary");
      saveBtn.classList.remove("saved");
    }else{
      saveBtn.disabled = true;
      saveBtn.textContent = "保存済み";
      saveBtn.classList.remove("primary");
      saveBtn.classList.add("saved");
    }
  }

  updateNextInvoiceButton();

  $("saveMsg").textContent = "端末内に検品結果を保存しました。";

  show("completeView");
}



const LOCAL_RESULTS_KEY = "hyogo_parts_inspection_results_v1";
const LOCAL_EXPORTED_AT_KEY = "hyogo_parts_inspection_exported_at_v1";
const LOCAL_PROGRESS_KEY = "hyogo_parts_inspection_progress_v1";

const RESULT_HEADERS = [
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

function getLocalProgress(){
  try{
    return JSON.parse(localStorage.getItem(LOCAL_PROGRESS_KEY) || "[]");
  }catch(e){
    return [];
  }
}

function saveProgressToLocal(){
  localStorage.setItem(
    LOCAL_PROGRESS_KEY,
    JSON.stringify(state.results || [])
  );
}

function restoreResultsFromLocal(){
  const validKeys = new Set(
    (state.inspectionRows || []).map(r => itemKey(r))
  );

  const merged = new Map();

  getLocalResults().forEach(row => {
    const key = row.key || itemKey(row);
    if(validKeys.has(key)){
      merged.set(key, {...row, key});
    }
  });

  getLocalProgress().forEach(row => {
    const key = row.key || itemKey(row);
    if(validKeys.has(key)){
      merged.set(key, {...row, key});
    }
  });

  state.results = Array.from(merged.values());
  saveProgressToLocal();
}

function getLocalResults(){
  try{
    return JSON.parse(localStorage.getItem(LOCAL_RESULTS_KEY) || "[]");
  }catch(e){
    return [];
  }
}

function saveLocalResults(rows){
  localStorage.setItem(LOCAL_RESULTS_KEY, JSON.stringify(rows));
}

function getExportedAt(){
  return localStorage.getItem(LOCAL_EXPORTED_AT_KEY) || "";
}

function setExportedAt(value){
  localStorage.setItem(LOCAL_EXPORTED_AT_KEY, value || "");
}

function buildCurrentResultRows(){
  const completedAt = nowText();

  const invoiceStatus = state.currentItems.some(i => statusOf(i) === "保留") ? "HOLD" : "OK";

  return state.results
    .filter(r => r.invoice_no === state.currentInvoice)
    .map((r, i) => ({
      result_id: `${state.currentInvoice}_${r.line_no || i + 1}_${r.sku || ""}`,
      invoice_status: invoiceStatus,
      barcode_register_flag: r.barcode_register_flag || "0",
      admin_review_required: r.admin_review_required || "0",
      ...r,
      completed_at: completedAt
    }));
}

function saveCurrentResultToLocal(){
  const currentRows = buildCurrentResultRows();

  if(currentRows.length === 0){
    return;
  }

  const allRows = getLocalResults();

  currentRows.forEach(row => {
    const key = [
      row.result_id,
      row.invoice_no,
      row.order_no,
      row.line_no,
      row.sku
    ].join("|");

    const existingIndex = allRows.findIndex(x => {
      const xKey = [
        x.result_id,
        x.invoice_no,
        x.order_no,
        x.line_no,
        x.sku
      ].join("|");

      return xKey === key;
    });

    // 同じ送り状・同じ行を再検品した場合は、古い端末内結果を残さず上書きする。
    // これにより、バーコード不一致後の手動確認結果もCSVに反映される。
    if(existingIndex >= 0){
      allRows[existingIndex] = row;
    }else{
      allRows.push(row);
    }
  });

  saveLocalResults(allRows);
  updateLocalResultCount();
}

// 前回のCSV出力後に追加・更新された行だけを取得する
function getUnexportedResultRows(){
  const rows = getLocalResults();
  const exportedAt = getExportedAt();

  if(!exportedAt){
    return rows;
  }

  return rows.filter(row => {
    const completedAt = String(row.completed_at || "");
    return completedAt === "" || completedAt > exportedAt;
  });
}


// 指定された行だけでCSVを作る
function buildBatchResultCsv(rows){
  return [
    RESULT_HEADERS.join(","),
    ...rows.map(row =>
      RESULT_HEADERS.map(header => csvEscape(row[header])).join(",")
    )
  ].join("\r\n");
}


// CSV内に含まれる社員番号をファイル名用にまとめる
function buildResultStaffCodeText(rows){
  const staffCodes = [];

  rows.forEach(row => {
    const code = String(row.staff_code || "").trim();

    if(code && !staffCodes.includes(code)){
      staffCodes.push(code);
    }
  });

  if(staffCodes.length === 0){
    return "unknown";
  }

  return staffCodes.join("-");
}


function downloadBatchCsv(){
  // renderComplete()ですでに端末内保存されているため、
  // ここでは再保存してcompleted_atを変更しない
  const rows = getUnexportedResultRows();

  if(rows.length === 0){
    showMsg(
      "saveMsg",
      "CSVへ出力していない検品結果はありません。",
      false
    );
    updateLocalResultCount();
    return;
  }

  const csv = "\uFEFF" + buildBatchResultCsv(rows);

  const d = new Date();
  const p = n => String(n).padStart(2, "0");

  const name =
    `inspection_result_batch_` +
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.csv`;

  const blob = new Blob(
    [csv],
    {type: "text/csv;charset=utf-8"}
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = name;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);

  // 今回CSVに出力した時点を保存する
  setExportedAt(nowText());

  updateLocalResultCount();
  updateNextInvoiceButton();

  const saveBtn = $("saveResultBtn");

  if(saveBtn){
    saveBtn.disabled = true;
    saveBtn.textContent = "保存済み";
    saveBtn.classList.remove("primary");
    saveBtn.classList.add("saved");
  }

  showMsg(
    "saveMsg",
    `${rows.length}件の検品結果CSVをまとめて保存しました。`,
    true
  );
}


function updateLocalResultCount(){
  const rows = getLocalResults();
  const unsavedRows = getUnexportedResultRows();

  const localCountEl = $("localResultCount");
  const unsavedCountEl = $("unsavedResultCount");

  if(localCountEl){
    localCountEl.textContent = `${rows.length}件`;
  }

  if(unsavedCountEl){
    unsavedCountEl.textContent = `${unsavedRows.length}件`;
  }
}

function hasUnsavedLocalResults(){
  return getUnexportedResultRows().length > 0;
}

function updateNextInvoiceButton(){
  const nextBtn = $("nextInvoiceBtn");
  if(!nextBtn) return;

  const hasUnsaved = hasUnsavedLocalResults();
  const allDone = isAllBundleInvoicesCompletedOnThisDevice();

  if(!allDone){
    nextBtn.classList.remove("hidden");
    nextBtn.disabled = false;
    nextBtn.textContent = "次の送り状へ";
    nextBtn.classList.add("ready");
    nextBtn.classList.add("primary");
    return;
  }

  if(hasUnsaved){
    nextBtn.classList.add("hidden");
    nextBtn.disabled = true;
    nextBtn.classList.remove("ready");
    nextBtn.classList.remove("primary");
  }else{
    nextBtn.classList.remove("hidden");
    nextBtn.disabled = false;
    nextBtn.textContent = "作業終了";
    nextBtn.classList.add("ready");
    nextBtn.classList.add("primary");
  }
}

function getBundleInvoiceNos(){
  const set = new Set();

  (state.inspectionRows || []).forEach(r => {
    const inv = normalizeInvoiceNo(r.invoice_no);
    if(inv) set.add(inv);
  });

  return Array.from(set);
}

function isAllBundleInvoicesCompletedOnThisDevice(){
  const bundleInvoices = getBundleInvoiceNos();

  if(bundleInvoices.length === 0){
    return false;
  }

  const localRows = getLocalResults();

  const completedInvoices = new Set(
    localRows
      .map(r => normalizeInvoiceNo(r.invoice_no))
      .filter(Boolean)
  );

  return bundleInvoices.every(inv => completedInvoices.has(inv));
}

function removeInvoiceFromLocalStorage(inv){
  const normalizedInv = normalizeInvoiceNo(inv);

  saveLocalResults(
    getLocalResults().filter(
      row => normalizeInvoiceNo(row.invoice_no) !== normalizedInv
    )
  );

  localStorage.setItem(
    LOCAL_PROGRESS_KEY,
    JSON.stringify(
      getLocalProgress().filter(
        row => normalizeInvoiceNo(row.invoice_no) !== normalizedInv
      )
    )
  );
}

function clearLocalResultsAdmin(){
  if(!confirm("端末内の検品結果を削除します。\n\nPCへの取込が完了している場合だけ実行してください。\n\n削除してよろしいですか？")){
    return;
  }

  localStorage.removeItem(LOCAL_RESULTS_KEY);
  localStorage.removeItem(LOCAL_EXPORTED_AT_KEY);
  localStorage.removeItem(LOCAL_PROGRESS_KEY);
  state.results = [];
  updateLocalResultCount();

  showMsg("saveMsg", "端末内データをクリアしました。", true);
}


$("loginBtn").onclick=()=>{
const code=$("staffCodeInput").value.trim();
if(!code)return showMsg("loginMsg","社員番号を入力してください");
state.pendingStaffCode=code;
show("loadView")
};
document.querySelectorAll("[data-staffkey]").forEach(btn=>{
  btn.onclick=()=>{
    const k=btn.dataset.staffkey;
    const input=$("staffCodeInput");

    if(k==="clear"){
      input.value="";
    }else if(k==="back"){
      input.value=input.value.slice(0,-1);
    }else{
      input.value+=k;
    }
  };
});
$("staffCodeInput").addEventListener("keydown", e=>{
  if(e.key==="Enter"){
    e.preventDefault();
    $("loginBtn").click();
  }
});
$("bundleFile").addEventListener("change",renderLoadedCsvList);
$("loadCsvBtn").onclick=async()=>{try{const b=await readBundleCsv($("bundleFile"));state.staffList=b.staffRows;state.inspectionRows=b.itemRows;state.processedRows=b.processedRows||[];const staff=state.staffList.find(s=>s.staff_code===state.pendingStaffCode&&s.active_flag==="1");if(!staff){
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

    restoreResultsFromLocal();
    updateStaffLabels();
    updateLocalResultCount();

show("scanInvoiceView");
resetInvoiceScreen();
}catch(e){showMsg("loadMsg","CSV読込に失敗しました： "+e.message)}};

if($("changeStaffBtn")) $("changeStaffBtn").onclick=showChangeStaffModal;
if($("changeStaffBtnOrder")) $("changeStaffBtnOrder").onclick=showChangeStaffModal;
if($("changeStaffBtnItem")) $("changeStaffBtnItem").onclick=showChangeStaffModal;

function focusInvoiceInput(){
  const input = $("invoiceInput");
  if(!input) return;

  input.value = "";

  // すぐフォーカス
  input.focus();
  input.select();

  // 画面描画直後にもう一度フォーカス
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });

  // AsReader / iPhone Safari 用の保険
  setTimeout(() => {
    input.focus();
    input.select();
  }, 30);

  setTimeout(() => {
    input.focus();
    input.select();
  }, 80);
}

function clearInvoiceInput(){
  focusInvoiceInput();
}

function getProcessedInvoice(inv){
  return (state.processedRows || []).find(r => normalizeInvoiceNo(r.invoice_no) === inv);
}

function showProcessedInvoiceModal(inv, processed){
  const orderNo = processed.order_no || "";
  const status = processed.reason || "OK";
  const itemCount = processed.quantity || "";
  const staffCode = processed.registered_by || "";
  const completedAt = processed.registered_at || "";
  const sourceFile = processed.source || "";

  showModal(
    "PC取込済み送り状",
    `<p>この送り状は、すでにPCへ取込済みです。</p>
     <p><strong>送り状No</strong><br>${inv}</p>
     <p><strong>注文番号</strong><br>${orderNo}</p>
     <p><strong>状態</strong><br>${status}</p>
     <p><strong>商品行数</strong><br>${itemCount || "-"}</p>
     <p><strong>作業者</strong><br>${staffCode || "-"}</p>
     <p><strong>検品日時</strong><br>${completedAt || "-"}</p>
     <p><strong>取込ファイル</strong><br>${sourceFile || "-"}</p>
     <p class="msg">再検品する場合は、PC側で検品済み除外を解除して、スマホ検品CSVを作り直してください。</p>`,
    [
      {label:"この画面を閉じる",kind:"primary",onClick:()=>{
        closeModal();
        show("scanInvoiceView");
        resetInvoiceScreen();
      }}
    ]
  );
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
    const processed = getProcessedInvoice(inv);

    if(processed){
      showMsg("invoiceMsg","");
      showProcessedInvoiceModal(inv, processed);
      return;
    }

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
        {label:"最初からやり直す",kind:"danger",onClick:()=>{
          state.results=state.results.filter(r=>r.invoice_no!==inv);
          removeInvoiceFromLocalStorage(inv);
          saveProgressToLocal();
          state.startedAt=nowText();
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
  if(document.activeElement){
    document.activeElement.blur();
  }

  showModal(
    "管理者社員番号",
    `<input
  id="reinspectAdminCodeInput"
  class="input big"
  inputmode="none"
  autocomplete="off"
  readonly
>

     <div class="keypad">
  <button type="button" data-reinspect-admin-key="1">1</button>
  <button type="button" data-reinspect-admin-key="2">2</button>
  <button type="button" data-reinspect-admin-key="3">3</button>
  <button type="button" data-reinspect-admin-key="4">4</button>
  <button type="button" data-reinspect-admin-key="5">5</button>
  <button type="button" data-reinspect-admin-key="6">6</button>
  <button type="button" data-reinspect-admin-key="7">7</button>
  <button type="button" data-reinspect-admin-key="8">8</button>
  <button type="button" data-reinspect-admin-key="9">9</button>
  <button type="button" data-reinspect-admin-key="clear">C</button>
  <button type="button" data-reinspect-admin-key="0">0</button>
  <button type="button" data-reinspect-admin-key="back">←</button>
</div>

     <p id="reinspectAdminMsg" class="msg"></p>`,
    [
      {
        label:"確認",
        kind:"primary",
        onClick:()=>{
          const code = $("reinspectAdminCodeInput").value.trim();

          if(!code){
            $("reinspectAdminMsg").textContent =
              "管理者社員番号を入力してください";
            return;
          }

          const admin = state.staffList.find(
            s =>
              s.staff_code === code &&
              s.active_flag === "1" &&
              s.is_admin === "1"
          );

          if(!admin){
            $("reinspectAdminMsg").textContent =
              "管理者社員番号が確認できません";
            return;
          }

          showModal(
            "再検品開始",
            `<p>再検品を開始しますか？</p>
             <p>※既存の検品結果は削除されます。</p>
             <p>管理者：${admin.staff_name || admin.staff_code}</p>`,
            [
              {
                label:"再検品開始",
                kind:"danger",
                onClick:()=>{
                  state.results =
                    state.results.filter(r => r.invoice_no !== inv);

                  removeInvoiceFromLocalStorage(inv);
                  saveProgressToLocal();

                  state.startedAt = nowText();
                  state.currentIndex = 0;
                  state.lastReadBarcode = "";

                  closeModal();
                  renderOrder();
                }
              },
              {
                label:"キャンセル",
                onClick:()=>{
                  closeModal();
                  show("scanInvoiceView");
                  resetInvoiceScreen();
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
          show("scanInvoiceView");
          resetInvoiceScreen();
        }
      }
    ]
  );

  document
    .querySelectorAll("[data-reinspect-admin-key]")
    .forEach(btn=>{
      btn.onclick = ()=>{
        const input = $("reinspectAdminCodeInput");
        const key = btn.dataset.reinspectAdminKey;

        if(key === "clear"){
          input.value = "";
        }else if(key === "back"){
          input.value = input.value.slice(0, -1);
        }else{
          input.value += key;
        }

        $("reinspectAdminMsg").textContent = "";
      };
    });
}


$("startInspectionBtn").addEventListener("pointerdown", ()=>{
  focusBarcodeInput();
});

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

$("toOrderBtn").onclick = () => {
  if(
    state.currentItems.length > 0 &&
    state.currentItems.every(i => statusOf(i) !== "未検品")
  ){
    renderComplete();
  }else{
    renderOrder();
  }
};

$("holdBtn").onclick=()=>showHoldModal(state.currentItems[state.currentIndex]);

if($("scanEnableBtn")){
  $("scanEnableBtn").onclick = () => {
    focusBarcodeInput();
  };
}


$("manualBtn").onclick=()=>{
  const r=state.currentItems[state.currentIndex];
  const hasMismatch = !!state.lastMismatchBarcode;

  // バーコード不一致後は、スタッフ単独の手動OKは禁止。
  // 必ず管理者確認画面へ戻す。
  if(hasMismatch){
    showBarcodeMismatch(r, state.lastMismatchBarcode, state.lastMismatchMaster);
    return;
  }

  if(Number(r.quantity||1)>=2){
    $("readValue").textContent = "手動確認";
    showQuantityModal(r, "manual");
  }else{
    state.lastReadBarcode="";
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
$("barcodeInput").addEventListener("input", e=>{
  clearTimeout(barcodeInputTimer);

  barcodeInputTimer = setTimeout(()=>{
    const v = e.target.value;

    if(v){
      e.target.value = "";
      handleBarcode(v);
    }
  }, 150);
});

document.querySelectorAll("[data-key]").forEach(btn=>btn.onclick=()=>{
  const k=btn.dataset.key;
  const input=$("checkedQtyInput");

  if(k==="clear") input.value="";
  else if(k==="back") input.value=input.value.slice(0,-1);
  else input.value+=k;
});
$("confirmQtyBtn").onclick=()=>{const r=state.currentItems[state.currentIndex],need=String(Number(r.quantity||0)),checked=String(Number($("checkedQtyInput").value||0));
if(!$("checkedQtyInput").value)return showMsg("itemMsg","確認数量を入力してください");
if(need!==checked)return showMsg("itemMsg","数量が一致しません。保留処理を行ってください。");
markOk(r,state.lastReadBarcode?"barcode":"manual",state.lastReadBarcode,checked);
showMsg("itemMsg","✓ 数量一致",true);setTimeout(goNextItem,600)};
$("saveResultBtn").onclick = downloadBatchCsv;
if($("clearLocalResultsBtn")){
  $("clearLocalResultsBtn").onclick = clearLocalResultsAdmin;
}
$("nextInvoiceBtn").onclick = () => {
  const allDone = isAllBundleInvoicesCompletedOnThisDevice();

  if(!allDone){
    $("nextInvoiceBtn").classList.add("hidden");
    $("saveMsg").textContent = "";

    show("scanInvoiceView");
    resetInvoiceScreen();
    return;
  }

  showModal(
    "作業終了",
    `<p>作業を終了しますか？</p>
     <p class="msg">
       PCへの取込が完了している場合は、端末内データをクリアできます。
     </p>`,
    [
      {
        label:"送り状読取画面へ戻る",
        kind:"primary",
        onClick:()=>{
          closeModal();
          $("nextInvoiceBtn").classList.add("hidden");
          $("saveMsg").textContent = "";

          show("scanInvoiceView");
          resetInvoiceScreen();
        }
      },
      {
        label:"端末内データをクリア",
        kind:"danger",
        onClick:()=>{
          const ok = confirm(
            "PCへの取込が完了している場合だけ実行してください。\n\n" +
            "端末内の検品結果を削除しますか？"
          );

          if(!ok){
            return;
          }

          localStorage.removeItem(LOCAL_RESULTS_KEY);
          localStorage.removeItem(LOCAL_EXPORTED_AT_KEY);
          localStorage.removeItem(LOCAL_PROGRESS_KEY);

          closeModal();

          state.results = [];
          state.currentInvoice = null;
          state.currentItems = [];

          updateLocalResultCount();

          show("scanInvoiceView");
          resetInvoiceScreen();
        }
      },
      {
        label:"キャンセル",
        onClick:()=>{
          closeModal();
        }
      }
    ]
  );
};
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState === "visible"){
    const activeView = document.querySelector(".view.active");
    if(activeView && activeView.id === "itemView"){
      focusBarcodeInput();
    }
  }
});
$("reloadBtn").onclick = () => {
  const hasUnexported = hasUnsavedLocalResults();
  const progressCount = getLocalProgress().length;

  let message = "";

  if(hasUnexported){
    message +=
      "<p><strong>CSVへ出力していない完了済みの検品結果があります。</strong></p>" +
      "<p>追加送り状の発行やPC取込を行う場合は、先に検品結果CSVを保存してください。</p>";
  }

  if(progressCount > 0){
    message +=
      "<p>検品途中の状態は端末内に保存されています。新しいCSVを読み込んだ後も、同じ送り状・行番号・SKUの結果は復元されます。</p>";
  }

  if(!message){
    message = "<p>新しいinspection_bundle.csvを読み込みます。</p>";
  }

  const actions = [];

  if(hasUnexported){
    actions.push({
      label:"検品結果CSVを保存",
      kind:"primary",
      onClick:()=>{
        closeModal();
        downloadBatchCsv();
      }
    });
  }

  actions.push({
    label:"CSV再読込へ進む",
    onClick:()=>{
      closeModal();
      show("loadView");

      if($("bundleFile")){
        $("bundleFile").value = "";
      }

      renderLoadedCsvList();

      if($("loadMsg")){
        $("loadMsg").textContent = "";
      }

      if($("invoiceInput")){
        $("invoiceInput").value = "";
      }

      if($("invoiceMsg")){
        $("invoiceMsg").textContent = "";
      }
    }
  });

  actions.push({
    label:"キャンセル",
    onClick:closeModal
  });

  showModal(
    "CSV再読込",
    message,
    actions
  );
};

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
