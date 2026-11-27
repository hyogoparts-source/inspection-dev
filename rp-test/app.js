
const state={staff:null,staffList:[],inspectionRows:[],processedRows:[],barcodeMap:new Map(),aliasMap:new Map(),noBarcodeSet:new Set(),currentInvoice:null,currentItems:[],currentIndex:0,results:[],startedAt:null,lastReadBarcode:"",lastMismatchBarcode:"",lastMismatchMaster:"",ownerIndex:new Map(),ownerIndexAvailable:false,pendingAddApproval:null};
const $=id=>document.getElementById(id);
let barcodeInputTimer = null;
let barcodeComposing = false; // 2026-11-21：日本語の変換の途中
let barcodePendingEnter = false; let barcodePendingTimer = null; let barcodeComposeTimer = null; // fix2

function show(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  $(id).classList.add("active");
  if(id==="scanInvoiceView"){try{renderStatusBar();askDeviceNameIfEmpty();}catch(e){}}
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
          // 2026-11-27：CSV再読込のときも、この作業者で読み込む（前は最初にログインした社員番号に戻っていた）
          state.pendingStaffCode = staff.staff_code;
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
  barcodeComposing = false; // 2026-11-21
  barcodePendingEnter = false; clearTimeout(barcodePendingTimer); clearTimeout(barcodeComposeTimer); // fix2

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
const staffRows=[],itemRows=[],barcodeRows=[],aliasRows=[],noBarcodeRows=[],processedRows=[],ownerRows=[],ownerIndexRows=[],parcelRows=[],metaRows=[];
for(const r of rows){const t=String(r.record_type||"").trim().toUpperCase();
if(t==="STAFF")staffRows.push(r);
else if(t==="ITEM")itemRows.push(r);else if(t==="BARCODE")barcodeRows.push(r);
else if(t==="ALIAS")aliasRows.push(r);
else if(t==="NO_BARCODE")noBarcodeRows.push(r);
else if(t==="PROCESSED")processedRows.push(r);
else if(t==="BARCODE_OWNER")ownerRows.push(r);
else if(t==="BARCODE_OWNER_INDEX")ownerIndexRows.push(r)
else if(t==="PARCEL")parcelRows.push(r)/* 段階7：ヤマトの複数個口 */
else if(t==="META")metaRows.push(r)/* 2026-11-17：検品用CSVの作成日時 */}
if(!staffRows.length)throw new Error("STAFF行がありません");
if(!itemRows.length && !processedRows.length)throw new Error("ITEM行またはPROCESSED行がありません");
if(!barcodeRows.length && !noBarcodeRows.length)throw new Error("BARCODE行またはNO_BARCODE行がありません");
return{staffRows,itemRows,barcodeRows,aliasRows,noBarcodeRows,processedRows,ownerRows,ownerIndexRows,parcelRows,bundleCreatedAt:(metaRows[0]&&metaRows[0].updated_at)||""}}
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
  $("progressLabel").innerHTML = parcelInfoHtml() +
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

// 2026-11-21：送り状を読んだ後、検品対象が1明細なら「検品開始」を押さずに商品の画面を開く
// （未検品のときだけ。複数個口・再発行の案内が出る注文は、案内を見てもらうため一覧のまま）
function openSingleItemIfReady(){
  const items = state.currentItems || [];
  if(items.length !== 1) return;
  if(statusOf(items[0]) !== "未検品") return;
  if(parcelInfoHtml() !== "") return;
  state.currentIndex = 0;
  renderItem();
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
    memo:"",
    barcode_action:"",
    register_barcode:"",
    existing_owner_skus:"",
    owner_ref_status:"",
    same_item_confirmed:"",
    approved_at:""
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
  }else if(decision === "add_barcode"){
    const approval = state.pendingAddApproval;
    if(!approval || approval.key !== itemKey(r) || approval.read !== read){
      showMsg("itemMsg", "追加登録の確認情報が見つかりません。もう一度読み取ってください");
      state.pendingAddApproval = null;
      return;
    }
    markBarcodeAddAdmin(r, read, master, adminCode, qty, approval);
    state.pendingAddApproval = null;
    showMsg(
      "itemMsg",
      approval.owners.length
        ? "管理者確認OK。共通バーコード登録として記録しました"
        : "管理者確認OK。バーコード追加登録として記録しました",
      true
    );
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

          // 初回登録対象（登録済みバーコードなし）からの共通登録は、不一致画面ではなく読取待ちへ戻す
          if(decision === "add_barcode" && state.pendingAddApproval?.fromNoBarcode){
            state.pendingAddApproval = null;
            focusBarcodeInput();
            return;
          }

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

//==================================================
// 2026-10-13 管理者承認の「追加登録・共通登録」
//
// ・既存の有効バーコードは変更しない（PC側でも追加のみ）
// ・別SKUに登録済みのバーコードは、管理者が現物を見て
//   「同一の商品」と確認した場合だけ共通登録として記録する
// ・別SKUの登録状況を確認できない旧bundleでは受け付けない
// ・PCは取込時に承認者・対象注文・現在のマスターを照合して正式登録する
//==================================================
function ownerKeyOf(barcode){
  return normalizeBarcode(barcode).replace(/－/g, "").toUpperCase();
}

function addOwner(barcode, sku){
  const key = ownerKeyOf(barcode);
  const s = String(sku || "").trim();
  if(!key || !s) return;
  const set = state.ownerIndex.get(key) || new Set();
  set.add(s);
  state.ownerIndex.set(key, set);
}

function buildOwnerIndex(b){
  state.ownerIndex = new Map();
  state.ownerIndexAvailable = (b.ownerIndexRows || []).length > 0;

  (b.ownerRows || []).forEach(r => addOwner(r.barcode, r.sku));

  // 今回bundle内のBARCODE/ALIAS（商品マスターJAN由来を含む）も所有者として扱う
  (b.barcodeRows || []).forEach(r => addOwner(r.barcode, r.sku));
  (b.aliasRows || []).forEach(r => addOwner(r.barcode, r.sku));
}

// 読取値を登録している「今回SKU以外」のSKU一覧
function getOtherOwnerSkus(sku, read){
  const self = String(sku || "").trim().toUpperCase();
  const set = state.ownerIndex.get(ownerKeyOf(read)) || new Set();
  // 2026-11-21：この端末でOKにしてまだPCに取り込んでいない登録（初回・追加・共通）も所有者に数える
  const sessionOwners = sessionRegisteredOwners(read).filter(s => s.toUpperCase() !== self);
  // 2026-11-21：純正品番のラベル（品番＋チェック文字。例 N243691N7PR$）は、品番で登録された別の品番も所有者に数える
  const partCodeOwners = partCodeOwnersOf(read);
  // 2026-11-21：左右・前後に分けた部品で、もう片方の品番のラベルを読んだとき（どちらも未登録でも止める）
  const bundleOwners = bundlePartCodeOwnersOf(sku, read);
  const owners = Array.from(new Set([...Array.from(set), ...sessionOwners, ...partCodeOwners, ...bundleOwners]))
    .filter(s => s.toUpperCase() !== self)
    .sort();

  return {available: state.ownerIndexAvailable, owners, sessionOwners, bundleOwners};
}

// 2026-11-21：検品データ（ITEM行）にある別の品番のうち、読取値がその品番の純正品番ラベルに当たるもの。
// 読取値がこの行の品番のラベルにも当たるときは、この行のものとみなして何も返さない。
function bundlePartCodeOwnersOf(sku, read){
  const self = String(sku || "").trim();
  if(!read || !self) return [];
  if(isMazdaPartCodeMatch(read, self)) return [];
  const out = new Set();
  (state.inspectionRows || []).forEach(x => {
    const s = String((x && x.sku) || "").trim();
    if(s && s.toUpperCase() !== self.toUpperCase() && isMazdaPartCodeMatch(read, s)) out.add(s);
  });
  return Array.from(out);
}

// 2026-11-21：この端末の検品結果（検品中の行と、端末に保存した結果）のうち、OK で barcode_register_flag=1 の行のバーコードと品番。
// 同じ箱を、前後・左右など別の構成部品にも初回登録してしまうのを防ぐため（送り状が別でも、PCへ取り込む前なら同じ）
function sessionRegisteredOwners(read){
  const key = ownerKeyOf(read);
  const out = new Set();
  if(!key) return [];
  let saved = [];
  try{ saved = getLocalResults() || []; }catch(e){ saved = []; }
  (state.results || []).concat(saved).forEach(x => {
    if(!x || x.status !== "OK" || String(x.barcode_register_flag) !== "1") return;
    const s = String(x.sku || "").trim();
    if(!s) return;
    const rb = ownerKeyOf(x.register_barcode || x.read_barcode || "");
    // 同じ読取値、または、その品番の純正品番ラベルとして登録したもの（読取値もその品番に当てはまる）
    const same = rb && rb === key;
    const part = isMazdaPartCodeMatch(x.read_barcode || "", s) && isMazdaPartCodeMatch(read, s);
    if(same || part) out.add(s);
  });
  return Array.from(out);
}

// 2026-11-21：検品データの所有者のうち、バーコードが「その品番そのもの」（純正品番で登録）で、読取値がその品番のラベルに当てはまるもの
function partCodeOwnersOf(read){
  const out = new Set();
  if(!read) return [];
  state.ownerIndex.forEach((skus, bc) => {
    skus.forEach(s => {
      if(normalizeSkuCode(bc) === normalizeSkuCode(s) && isMazdaPartCodeMatch(read, bc)) out.add(s);
    });
  });
  return Array.from(out);
}

// 管理者確認画面用：登録済みバーコードをすべて表示し、「変更」で無効になる1本を示す。
// 1本だけの場合は従来どおりの表示。
function registeredBarcodesForDecisionText(sku, master){
  const list = Array.from(new Set(allowedBarcodes(sku)));
  if(list.length <= 1){
    return escapeHtmlText(master || list[0] || "登録なし");
  }
  const target = normalizeBarcode(master || list[0]);
  return list.map(b =>
    escapeHtmlText(b) + (b === target ? "（「変更する」でこの1本だけ無効になります）" : "（変更しても有効のまま）")
  ).join("<br>");
}

function allowedBarcodesText(sku){
  const list = Array.from(new Set(allowedBarcodes(sku)));
  return list.length ? list.map(escapeHtmlText).join("<br>") : "登録なし";
}

// 初回登録対象の商品で、読取値が別SKUに登録済みだった場合
function showNoBarcodeCrossSkuNotice(r, read, owners){
  showModal(
    "別の品番に登録済みのバーコードです",
    `<p><strong>品番</strong><br>${escapeHtmlText(r.sku)}</p>
     <p><strong>商品名</strong><br>${escapeHtmlText(r.item_name || "")}</p>
     <p><strong>今回読取</strong><br>${escapeHtmlText(read)}</p>
     <p><strong>このバーコードが登録されている品番</strong><br>${owners.map(escapeHtmlText).join("<br>")}</p>
     <p class="msg">
       このバーコードは別の品番に登録されています。<br>
       商品を取り違えていないか確認してください。<br>
       同じ商品として登録する場合は、管理者確認が必要です。
     </p>`,
    [
      {
        label:"再スキャン",
        onClick:()=>{
          closeModal();
          focusBarcodeInput();
        }
      },
      {
        label:"管理者確認",
        kind:"primary",
        onClick:()=>{
          closeModal();
          showAdminCodeForAdd(r, read);
        }
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

function showAdminCodeForAdd(r, read){
  showModal(
    "管理者社員番号",
    `<p>別の品番に登録済みのバーコードのため、管理者確認が必要です。</p>
     <input id="addAdminCodeInput" class="input big" inputmode="numeric" pattern="[0-9]*" autocomplete="off" readonly>
     <div class="keypad">
       <button type="button" data-add-admin-key="1">1</button>
       <button type="button" data-add-admin-key="2">2</button>
       <button type="button" data-add-admin-key="3">3</button>
       <button type="button" data-add-admin-key="4">4</button>
       <button type="button" data-add-admin-key="5">5</button>
       <button type="button" data-add-admin-key="6">6</button>
       <button type="button" data-add-admin-key="7">7</button>
       <button type="button" data-add-admin-key="8">8</button>
       <button type="button" data-add-admin-key="9">9</button>
       <button type="button" data-add-admin-key="clear">C</button>
       <button type="button" data-add-admin-key="0">0</button>
       <button type="button" data-add-admin-key="back">←</button>
     </div>
     <p id="addAdminMsg" class="msg"></p>`,
    [
      {
        label:"確認",
        kind:"primary",
        onClick:()=>{
          const code = $("addAdminCodeInput").value.trim();

          if(!code){
            $("addAdminMsg").textContent = "管理者社員番号を入力してください";
            return;
          }

          const admin = state.staffList.find(
            s =>
              s.staff_code === code &&
              s.active_flag === "1" &&
              s.is_admin === "1"
          );

          if(!admin){
            $("addAdminMsg").textContent = "管理者社員番号が確認できません";
            return;
          }

          closeModal();
          showAdminBarcodeAddConfirm(r, read, "", admin, true);
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

  document.querySelectorAll("[data-add-admin-key]").forEach(btn=>{
    btn.onclick = ()=>{
      const input = $("addAdminCodeInput");
      const key = btn.dataset.addAdminKey;

      if(key === "clear") input.value = "";
      else if(key === "back") input.value = input.value.slice(0, -1);
      else input.value += key;

      $("addAdminMsg").textContent = "";
    };
  });
}

// 管理者による追加登録・共通登録の最終確認
function showAdminBarcodeAddConfirm(r, read, master, admin, fromNoBarcode){
  const backToPrevious = ()=>{
    state.pendingAddApproval = null;
    if(fromNoBarcode){
      focusBarcodeInput();
    }else{
      showBarcodeMismatch(r, read, master);
    }
  };

  const ownerInfo = getOtherOwnerSkus(r.sku, read);

  // 別SKUの登録状況を確認できない場合は、未登録と推測して承認しない
  if(!ownerInfo.available){
    showModal(
      "追加登録できません",
      `<p>このスマホ検品データには、他の品番のバーコード登録状況が含まれていません。</p>
       <p>別の品番に登録済みかどうか確認できないため、追加登録・共通登録はできません。</p>
       <p class="msg">PCで「スマホ検品CSV作成」をやり直したデータを読み込むか、保留にしてください。</p>`,
      [
        {label:"戻る", kind:"primary", onClick:()=>{ closeModal(); backToPrevious(); }},
        {label:"保留", kind:"danger", onClick:()=>{ closeModal(); state.pendingAddApproval = null; showHoldModal(r); }}
      ]
    );
    return;
  }

  const isCommon = ownerInfo.owners.length > 0;
  const title = isCommon ? "共通バーコード登録の確認" : "バーコード追加登録の確認";
  const checkText = isCommon
    ? "現物を確認し、上の品番と同じ商品であることを確認しました"
    : "現物の品番と今回読取バーコードが正しいことを確認しました";

  showModal(
    title,
    `<p><strong>品番</strong><br>${escapeHtmlText(r.sku)}</p>
     <p><strong>商品名</strong><br>${escapeHtmlText(r.item_name || "")}</p>
     <p><strong>今回読取</strong><br>${escapeHtmlText(read)}</p>
     <p><strong>この品番の登録済みバーコード（そのまま有効）</strong><br>${allowedBarcodesText(r.sku)}</p>
     ${isCommon
       ? `<p><strong>このバーコードが登録されている別の品番</strong><br>${ownerInfo.owners.map(escapeHtmlText).join("<br>")}</p>
          <p class="msg">別の品番と同じバーコードを共通で使います。<br>
          違う商品の場合は登録せず「保留」にしてください。</p>`
       : `<p class="msg">今の登録バーコードは消さずに、今回読取バーコードを追加します。</p>`}
     <label class="label"><input type="checkbox" id="addSameItemCheck"> ${checkText}</label>
     <p id="addConfirmMsg" class="msg"></p>`,
    [
      {
        label: isCommon ? "共通登録する" : "追加登録する",
        kind:"primary",
        onClick:()=>{
          if(!$("addSameItemCheck").checked){
            $("addConfirmMsg").textContent = "現物を確認してチェックを入れてください";
            return;
          }

          state.pendingAddApproval = {
            key: itemKey(r),
            read,
            owners: ownerInfo.owners,
            ownerRefStatus: "available",
            fromNoBarcode: !!fromNoBarcode
          };

          closeModal();

          if(Number(r.quantity || 1) >= 2){
            showAdminBarcodeDecisionQuantityModal(r, read, master, admin.staff_code, "add_barcode");
            return;
          }

          completeAdminBarcodeDecision(r, read, master, admin.staff_code, "add_barcode", "1");
        }
      },
      {
        label:"保留",
        kind:"danger",
        onClick:()=>{
          closeModal();
          state.pendingAddApproval = null;
          showHoldModal(r);
        }
      },
      {
        label:"キャンセル",
        onClick:()=>{
          closeModal();
          backToPrevious();
        }
      }
    ]
  );
}

function markBarcodeAddAdmin(r, read, master, adminCode, qty, approval){
  const isCommon = approval.owners.length > 0;

  markOk(r, isCommon ? "barcode_common_add_admin" : "barcode_add_admin", read, qty);

  const res = getResult(r);
  if(res){
    res.master_barcode = master || state.barcodeMap.get(r.sku) || "";
    res.admin_staff_code = adminCode || "";
    res.barcode_register_flag = "1";
    res.admin_review_required = "0";
    res.barcode_action = isCommon ? "add_common_sku" : "add_same_sku";
    res.register_barcode = normalizeBarcode(read).replace(/－/g, "");
    res.existing_owner_skus = approval.owners.join("|");
    res.owner_ref_status = approval.ownerRefStatus;
    res.same_item_confirmed = "1";
    res.approved_at = nowText();
    res.memo = isCommon
      ? `管理者現物確認済み。別品番(${approval.owners.join("|")})と同一商品として共通登録`
      : "管理者現物確認済み。登録済みバーコードを残して追加登録";
    saveProgressToLocal();
  }

  // 同じCSV内で同じSKUが再度出た場合、追加したバーコードを許可扱いにする
  const arr = state.aliasMap.get(r.sku) || [];
  if(!arr.includes(read)) arr.push(read);
  state.aliasMap.set(r.sku, arr);

  // 以後の共通登録確認で、このSKUも登録済みとして表示する
  addOwner(read, r.sku);
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
    memo:memo,
    barcode_action:"",
    register_barcode:"",
    existing_owner_skus:"",
    owner_ref_status:"",
    same_item_confirmed:"",
    approved_at:""
  });
}

// 2026-11-21：日本語の変換の途中の文字・ひらがな・全角の文字は、照合・登録に渡さない
function hasNonAsciiScan(v){return /[^\x21-\x7E]/.test(String(v||"").replace(/[\s-]/g,""))}
function rejectNonAsciiBarcode(raw){
  if($("barcodeInput")) $("barcodeInput").value = "";
  state.lastReadBarcode = "";
  if($("readValue")) $("readValue").textContent = "スキャン待機中";
  showMsg("itemMsg", "日本語の文字が入りました（照合・登録はしていません）。キーボードが日本語になっています。スキャナーの電源を切る → 欄を押す → 地球のマークで「ABC」→ スキャナーの電源を入れる、のあとで読み直してください。");
}
function handleBarcode(raw){
  const activeView = document.querySelector(".view.active");

  // 商品詳細画面以外では、商品バーコードとして処理しない
  if(!activeView || activeView.id !== "itemView"){
    if($("barcodeInput")) $("barcodeInput").value = "";
    return;
  }

  // 2026-11-21：英数字以外（変換の途中の文字・ひらがな・全角）が入っていたら照合・登録をしない
  if(hasNonAsciiScan(raw)) return rejectNonAsciiBarcode(raw);

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

    // 2026-10-13 読取値が別SKUに登録済みと確認できた場合だけ、
    // スタッフ単独の初回登録にせず管理者の共通登録確認へ進める。
    // 別SKU登録が無い場合・確認できない旧bundleの場合は従来の初回登録のまま。
    const ownerInfo = getOtherOwnerSkus(r.sku, read);
    // 2026-11-21：索引の無い古いデータでも、この端末で別の品番に登録したバーコードなら止める
    if(ownerInfo.owners.length && (ownerInfo.available || ownerInfo.sessionOwners.length || ownerInfo.bundleOwners.length)){
      return showNoBarcodeCrossSkuNotice(r, read, ownerInfo.owners);
    }

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
    showMsg("itemMsg", `✓ 一致　読取値：${read}`, true);
setTimeout(goNextItem, 1000);
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
             <p><strong>登録済みバーコード</strong><br>${registeredBarcodesForDecisionText(r.sku, master)}</p>
             <p><strong>今回読取</strong><br>${read}</p>
             <p class="msg">
               現物を確認して、処理を選んでください。<br>
               商品は正しいが今回読取バーコードを登録しない場合は
               「商品OK・バーコードは登録しない」を選んでください。<br>
               今回読取バーコードを今後の正しいバーコードにする場合だけ
               「バーコードを変更する」を選んでください。<br>
               登録済みバーコードも有効のまま、今回読取バーコードも使えるようにする場合は
               「バーコードを追加登録する」を選んでください。
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
                label:"バーコードを追加登録する（今の登録も残す）",
                kind:"primary",
                onClick:()=>{
                  closeModal();
                  showAdminBarcodeAddConfirm(r, read, master, admin, false);
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

  if(saveBtn){
    saveBtn.classList.remove("hidden");
  }

  updateSaveResultButton();

  updateNextInvoiceButton();

  $("saveMsg").textContent = "端末内に検品結果を保存しました。";

  show("completeView");
  focusCompleteScanInput(); // 2026-11-24
}



const LOCAL_RESULTS_KEY = "hyogo_parts_inspection_rptest_results_v1";
const LOCAL_EXPORTED_AT_KEY = "hyogo_parts_inspection_rptest_exported_at_v1";
const LOCAL_PROGRESS_KEY = "hyogo_parts_inspection_rptest_progress_v1";
// 直前に生成した検品結果CSVの完全なスナップショット（保存確認・再保存用）
const LAST_EXPORT_KEY = "hyogo_parts_inspection_rptest_last_export_v1";


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
  "memo",
  // 2026-10-13 追加登録・共通登録の承認記録（末尾追加・既存列は不変）
  "barcode_action",
  "register_barcode",
  "existing_owner_skus",
  "owner_ref_status",
  "same_item_confirmed",
  "approved_at",
  // 段階7：実際に読んだ送り状番号（監査用。invoice_no は代表の番号）
  "scanned_invoice_no"
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

// P9修正：PC の取込が拒否する結果か（無効にした番号を、無効にした時刻以降に読んで完了したもの）。
// 判定は PC の取込（PL_CheckResultFiles）と同じ。完了していない途中の記録（completed_at が空）は対象外
function isVoidRejectedResult(row){
  const doneAt = String(row.completed_at || "").trim();
  if(!doneAt) return false;
  const sc = normalizeInvoiceNo(row.scanned_invoice_no || "");
  const voidAt = sc && state.voidAt ? (state.voidAt.get(sc) || "") : "";
  return voidAt !== "" && doneAt >= voidAt;
}

function restoreResultsFromLocal(){
  const validKeys = new Set(
    (state.inspectionRows || []).map(r => itemKey(r))
  );

  const merged = new Map();
  const rejected = new Map();

  getLocalResults().forEach(row => {
    const key = row.key || itemKey(row);
    if(validKeys.has(key)){
      if(isVoidRejectedResult(row)){
        rejected.set(key, row);
        return;
      }
      merged.set(key, {...row, key});
    }
  });

  getLocalProgress().forEach(row => {
    const key = row.key || itemKey(row);
    if(validKeys.has(key)){
      const rej = rejected.get(key);
      // 拒否される完了と同じ検品の途中記録（その完了より前に読んだもの）も引き継がない。後で検品し直した記録は残す
      if(isVoidRejectedResult(row) || (rej && String(row.checked_at || "") <= String(rej.completed_at || ""))){
        if(!rej) rejected.set(key, row);
        merged.delete(key);
        return;
      }
      merged.set(key, {...row, key});
    }
  });

  state.results = Array.from(merged.values());
  state.voidRejected = Array.from(rejected.values());

  if(rejected.size > 0){
    saveLocalResults(getLocalResults().filter(row => !isVoidRejectedResult(row)));
  }

  saveProgressToLocal();
}

// P9修正：引き継がなかった結果を知らせる（新しいラベルで検品し直す）
function showVoidRejectedNotice(){
  const list = state.voidRejected || [];

  if(!list.length){
    return;
  }

  const lines = list.map(r =>
    `注文 ${escapeHtmlText(r.order_no || "")}　${escapeHtmlText(r.sku || "")}（読んだ送り状：${escapeHtmlText(r.scanned_invoice_no || r.invoice_no || "")}）`
  ).join("<br>");

  showModal(
    "再検品が必要です",
    `<p>再発行の前の送り状番号（無効にした番号）を、無効にした後に読んで完了した検品結果は、PCで取り込めないため、引き継いでいません。</p>
     <p>${lines}</p>
     <p>新しいラベルを読んで、検品し直してください。</p>`,
    [{label:"確認した",kind:"primary",onClick:closeModal}]
  );
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

// ---- CSV保存確認方式 ----
// ブラウザからはOS側のファイル保存成功を確認できないため、
// 作業者が「ファイルを確認できた」を押すまで exportedAt を進めない。

function getLastExport(){
  try{
    const v = JSON.parse(localStorage.getItem(LAST_EXPORT_KEY) || "null");
    return v && v.file_name && typeof v.csv_text === "string" ? v : null;
  }catch(e){
    return null;
  }
}

function setLastExport(snapshot){
  localStorage.setItem(LAST_EXPORT_KEY, JSON.stringify(snapshot));
}

function isLastExportPending(){
  const last = getLastExport();
  return !!(last && !last.confirmed);
}

function triggerCsvDownload(fileName, csvText){
  const blob = new Blob(
    [csvText],
    {type: "text/csv;charset=utf-8"}
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = fileName;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

// 直前のCSVを同じファイル名・同じ内容で再ダウンロードする。
// completed_at・export_at・検品結果は変更しない。
function redownloadLastExport(){
  const last = getLastExport();

  if(!last){
    showMsg("saveMsg", "再保存できるCSVがありません。", false);
    return null;
  }

  triggerCsvDownload(last.file_name, last.csv_text);
  return last;
}

// 作業者がファイルの存在を確認した時だけ、出力済みとして確定する
function confirmLastExport(){
  const last = getLastExport();

  if(!last){
    return;
  }

  const current = getExportedAt();

  if(!current || String(last.export_at) > current){
    setExportedAt(last.export_at);
  }

  last.confirmed = true;
  last.confirmed_at = nowText();
  setLastExport(last);

  updateLocalResultCount();
  updateNextInvoiceButton();
  updateSaveResultButton();

  showMsg(
    "saveMsg",
    `CSVファイル（${last.file_name}）の保存を確認しました。`,
    true
  );
}

function showSaveConfirmModal(snapshot){
  const last = snapshot || getLastExport();

  if(!last){
    return;
  }

  showModal(
    "CSV保存の確認",
    `<p>CSV保存処理を開始しました。</p>
     <p>ファイルアプリ / iCloud Drive に<br><strong>${escapeHtmlText(last.file_name)}</strong><br>があることを確認してください。</p>
     <p>ファイルが見つからない場合は「CSVを再保存」を押してください。<br>端末内の検品結果は削除していません。</p>`,
    [
      {
        label:"ファイルを確認できた",
        kind:"primary",
        onClick:()=>{
          closeModal();
          confirmLastExport();
        }
      },
      {
        label:"CSVを再保存",
        onClick:()=>{
          redownloadLastExport();
          showSaveConfirmModal();
        }
      },
      {
        label:"あとで確認",
        onClick:()=>{
          closeModal();
          updateSaveResultButton();
          updateNextInvoiceButton();
        }
      }
    ]
  );
}

function escapeHtmlText(v){
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 保存ボタンを恒久的に押せなくしない
//   未出力行あり（新しい内容）→ 検品結果CSVを保存
//   保存確認前                → CSVを再保存
//   未出力行0＋直前CSVあり     → 直前のCSVを再保存
//   結果なし                  → disabled
function updateSaveResultButton(){
  const saveBtn = $("saveResultBtn");

  if(!saveBtn){
    return;
  }

  const rows = getUnexportedResultRows();
  const last = getLastExport();

  saveBtn.disabled = false;
  saveBtn.classList.remove("saved");

  if(rows.length > 0){
    const csvText = "\uFEFF" + buildBatchResultCsv(rows);

    if(last && !last.confirmed && last.csv_text === csvText){
      saveBtn.textContent = "CSVを再保存";
    }else{
      saveBtn.textContent = "検品結果CSVを保存";
    }

    saveBtn.classList.add("primary");
    return;
  }

  if(last){
    saveBtn.textContent = last.confirmed ? "直前のCSVを再保存" : "CSVを再保存";

    if(last.confirmed){
      saveBtn.classList.remove("primary");
    }else{
      saveBtn.classList.add("primary");
    }
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "検品結果CSVを保存";
  saveBtn.classList.remove("primary");
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
      scanned_invoice_no: state.scannedInvoice || state.currentInvoice,
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
    // 直前のCSVがあれば、同じ内容で再保存できるようにする
    const lastExport = getLastExport();

    if(lastExport){
      redownloadLastExport();
      updateSaveResultButton();
      showSaveConfirmModal(lastExport);
      return;
    }

    showMsg(
      "saveMsg",
      "CSVへ出力していない検品結果はありません。",
      false
    );
    updateLocalResultCount();
    return;
  }

  const csv = "\uFEFF" + buildBatchResultCsv(rows);

  // 保存確認前の直前CSVと同じ内容なら、同じファイル名・同じ内容で再保存する
  const last = getLastExport();

  if(last && !last.confirmed && last.csv_text === csv){
    redownloadLastExport();
    updateSaveResultButton();
    showSaveConfirmModal(last);
    return;
  }

  const d = new Date();
  const p = n => String(n).padStart(2, "0");

  const name =
    `inspection_result_batch_` +
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.csv`;

  // 生成したCSVをそのまま保持する（保存確認前は exportedAt を進めない）
  const snapshot = {
    file_name: name,
    csv_text: csv,
    row_count: rows.length,
    export_at: nowText(),
    confirmed: false
  };

  setLastExport(snapshot);

  triggerCsvDownload(name, csv);

  updateLocalResultCount();
  updateNextInvoiceButton();
  updateSaveResultButton();

  showMsg(
    "saveMsg",
    `${rows.length}件の検品結果CSVの保存処理を開始しました。ファイルがあることを確認してください。`,
    true
  );

  showSaveConfirmModal(snapshot);
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
  try{renderStatusBar();}catch(e){}
}

function hasUnsavedLocalResults(){
  return getUnexportedResultRows().length > 0 || isLastExportPending();
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
  localStorage.removeItem(LAST_EXPORT_KEY);
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
$("loadCsvBtn").onclick=async()=>{try{const b=await readBundleCsv($("bundleFile"));saveBundleMeta(b.bundleCreatedAt,($("bundleFile").files[0]||{}).name||"");state.staffList=b.staffRows;state.inspectionRows=b.itemRows;state.processedRows=b.processedRows||[];buildParcelMap(b.parcelRows||[]);const staff=state.staffList.find(s=>s.staff_code===state.pendingStaffCode&&s.active_flag==="1");if(!staff){
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
    buildOwnerIndex(b);

    restoreResultsFromLocal();
    updateStaffLabels();
    updateLocalResultCount();

show("scanInvoiceView");
resetInvoiceScreen();
showVoidRejectedNotice();
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

// 段階7：ヤマトの複数個口。どの個口の番号を読んでも、代表の番号で検品する（進捗・結果は代表で一元化）
function buildParcelMap(rows){
  state.parcelRepOf = new Map();
  state.parcelListOf = new Map();
  // 段階7e：再発行の前の番号（reason=VOID）は読ませない
  state.voidInvoices = new Set();
  // P9修正：無効にした時刻（PC の registered_at）。取込の判定と同じ時刻で、引き継がない結果を決める
  state.voidAt = new Map();
  (rows || []).forEach(r => {
    const inv = normalizeInvoiceNo(r.invoice_no);
    const rep = normalizeInvoiceNo(r.source);
    if(String(r.reason || "").trim().toUpperCase() === "VOID"){
      if(inv) state.voidInvoices.add(inv);
      const voidAt = String(r.registered_at || "").trim();
      if(inv && voidAt) state.voidAt.set(inv, voidAt);
      return;
    }
    if(!inv || !rep) return;
    state.parcelRepOf.set(inv, rep);
    if(!state.parcelListOf.has(rep)) state.parcelListOf.set(rep, []);
    const list = state.parcelListOf.get(rep);
    if(!list.includes(inv)) list.push(inv);
  });
}
function parcelRepOf(inv){
  return (state.parcelRepOf && state.parcelRepOf.get(inv)) || "";
}
function parcelInfoHtml(){
  const list = (state.parcelListOf && state.parcelListOf.get(state.currentInvoice)) || [];
  const scanned = state.scannedInvoice || state.currentInvoice;
  // 段階7e：再発行で1枚目の番号が変わった注文（鍵の番号は有効な送り状ではない）
  if(list.length >= 1 && !list.includes(state.currentInvoice)){
    return `<div class="msg parcelInfo">この注文の有効な送り状は ${list.join("・")}（${list.length}個口）です。再発行の前の番号 ${state.currentInvoice} は使えません。読んだ送り状：${scanned}</div>`;
  }
  if(list.length < 2) return "";
  return `<div class="msg parcelInfo">この注文は${list.length}個口です（代表：${state.currentInvoice}／ほか：${list.filter(x=>x!==state.currentInvoice).join("・")}）。どの送り状でも同じ検品画面です。読んだ送り状：${scanned}</div>`;
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
  // 2026-11-21：日本語の文字が入ったときは、該当なしにせず読み直しの案内
  if(hasNonAsciiScan(normalizeInvoiceNo($("invoiceInput").value))){
    showMsg("invoiceMsg","日本語の文字が入りました。キーボードが日本語になっています。スキャナーの電源を切る → 欄を押す → 地球のマークで「ABC」→ スキャナーの電源を入れる、のあとで読み直してください。");
    clearInvoiceInput();
    return;
  }
  const scannedInv=normalizeInvoiceNo($("invoiceInput").value);
  // 段階7e：再発行の前の番号（無効にした番号）は、検品を開かない
  if(scannedInv && state.voidInvoices && state.voidInvoices.has(scannedInv)){
    showMsg("invoiceMsg","この送り状（"+scannedInv+"）は再発行の前の番号です（使えません）。箱に貼ってある新しいラベルを読んでください。");
    clearInvoiceInput();
    return;
  }
  // 段階7：個口の番号なら代表の番号に読み替える（読んだ番号は scanned_invoice_no として残す）
  const inv=parcelRepOf(scannedInv)||scannedInv;
  state.scannedInvoice=scannedInv;

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

    showMsg("invoiceMsg",`該当なし：${inv}`);
    clearInvoiceInput();
    showNotFoundModal(inv);
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
          openSingleItemIfReady();
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
  openSingleItemIfReady();
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
                  openSingleItemIfReady();
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

// 2026-11-21 fix2：日本語のキーボードでも、改行が来たら必ず処理する（無反応・つながりを防ぐ）
function processBarcodeInputNow(){
  clearTimeout(barcodeInputTimer); clearTimeout(barcodePendingTimer); clearTimeout(barcodeComposeTimer);
  barcodePendingEnter = false;
  const el = $("barcodeInput");
  if(!el) return;
  const wasComposing = barcodeComposing;
  barcodeComposing = false;
  const v = el.value;
  el.value = "";
  if(wasComposing){ try{ el.blur(); }catch(e){} el.value = ""; }
  if(String(v||"").trim()){
    if(!hasNonAsciiScan(v) && $("itemMsg")) showMsg("itemMsg", ""); // 前の赤い案内を消す
    handleBarcode(v);
  }
  if(wasComposing){
    const av = document.querySelector(".view.active");
    const md = $("modal");
    if(av && av.id === "itemView" && (!md || md.classList.contains("hidden"))){ try{ el.focus(); }catch(e){} }
  }
}
$("barcodeInput").addEventListener("compositionstart",()=>{barcodeComposing=true;clearTimeout(barcodeInputTimer)});
$("barcodeInput").addEventListener("compositionend",e=>{barcodeComposing=false;clearTimeout(barcodeInputTimer);clearTimeout(barcodeComposeTimer);
// fix3：iPhone の日本語のキーボードでは、スキャナーの改行は「変換の確定」に使われ、改行（keydown）は来ない。
// 変換が決まったら、その時点で処理する（英数字は照合、それ以外は照合・登録せずに案内）。
clearTimeout(barcodePendingTimer);barcodePendingTimer=setTimeout(processBarcodeInputNow,30);});
$("barcodeInput").addEventListener("blur",()=>{barcodeComposing=false});
$("barcodeInput").addEventListener("keydown",e=>{if(e.key!=="Enter")return;
clearTimeout(barcodeInputTimer);
if(e.isComposing){ // 変換の途中の改行：確定を待ってから処理（来なければ 300ms 後に処理）
barcodePendingEnter=true;clearTimeout(barcodePendingTimer);barcodePendingTimer=setTimeout(processBarcodeInputNow,300);return}
e.preventDefault();processBarcodeInputNow()});
$("barcodeInput").addEventListener("change",e=>{const v=e.target.value;
if(v){e.target.value="";handleBarcode(v)}});
$("barcodeInput").addEventListener("input", e=>{
  clearTimeout(barcodeInputTimer);
  if(e.isComposing || barcodeComposing){ // 変換の途中は待つ（改行が来ないまま止まったら 800ms 後に処理）
    clearTimeout(barcodeComposeTimer);
    barcodeComposeTimer = setTimeout(()=>{ if(barcodeComposing && $("barcodeInput").value) processBarcodeInputNow(); }, 800);
    return;
  }

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
     </p>
     <p class="msg">
       CSVがファイルアプリ / iCloud Drive に存在することを確認してから作業を終了してください。<br>
       見つからない場合は「CSVを再保存」してください。
     </p>`,
    [
      ...(getLastExport() ? [{
        label:"CSVを再保存",
        onClick:()=>{
          redownloadLastExport();
        }
      }] : []),
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
          localStorage.removeItem(LAST_EXPORT_KEY);

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
  const pendingExport = isLastExportPending() ? getLastExport() : null;

  let message = "";

  if(pendingExport){
    message +=
      "<p><strong>保存確認前の検品結果CSVがあります。</strong></p>" +
      `<p>ファイルアプリ / iCloud Drive に<br><strong>${escapeHtmlText(pendingExport.file_name)}</strong><br>があるか確認してください。</p>` +
      "<p>見つからない場合は「CSVを再保存」を押してください。端末内の検品結果は削除していません。</p>";
  }else if(hasUnexported){
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

  if(pendingExport){
    actions.push({
      label:"CSVを再保存",
      kind:"primary",
      onClick:()=>{
        closeModal();
        downloadBatchCsv();
      }
    });

    actions.push({
      label:"ファイルを確認できた",
      onClick:()=>{
        closeModal();
        confirmLastExport();
      }
    });
  }else if(hasUnexported){
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
      if(pendingExport){
        const ok = confirm(
          "検品結果CSVの保存確認がまだ済んでいません。\n\n" +
          "ファイルアプリ / iCloud Drive にCSVが無い場合、PCへ検品結果を取り込めません。\n" +
          "（端末内の検品結果は削除しません）\n\n" +
          "このままCSV再読込へ進みますか？"
        );

        if(!ok){
          return;
        }
      }

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


/* ==================================================
   2026-11-17：再発防止
   ③ 送り状読込の画面に、端末名・検品用CSVの作成日時・この端末でまだCSVにしていない件数を、いつも出す
   ② 「該当なし」を大きく知らせる（何も記録しない。検品済みにもしない）
   データは消さない。今あるキーは変えず、新しいキーを2つ足すだけ
   ================================================== */
const DEVICE_NAME_KEY = "hyogo_parts_inspection_rptest_device_name_v1";
const BUNDLE_META_KEY = "hyogo_parts_inspection_rptest_bundle_meta_v1";

function getDeviceName(){
  try{ return (localStorage.getItem(DEVICE_NAME_KEY) || "").trim(); }catch(e){ return ""; }
}

function setDeviceName(v){
  const s = String(v || "").trim().slice(0, 12);
  if(!s) return false;
  localStorage.setItem(DEVICE_NAME_KEY, s);
  return true;
}

let deviceNameAsked = false;
function askDeviceNameIfEmpty(){
  if(getDeviceName() || deviceNameAsked) return;
  deviceNameAsked = true;
  openDeviceNameModal();
}

function openDeviceNameModal(){
  const cur = getDeviceName();
  showModal("この端末の名前",
    "<p>この iPhone の名前を入れてください（例：水色、ピンク）。<br>画面の上に出ます。端末ごとに別の名前にしてください。</p>" +
    "<p><strong>名前を入れたら、キーボードを「ABC」（英語）に戻してください。</strong><br>日本語のままだと、スキャンした送り状Noがひらがなになります。<br>スキャナーをつないでいるとキーボードが出ません。スキャナーの電源を切る → 送り状Noの欄を押す → 地球のマークで「ABC」→ スキャナーの電源を入れる。</p>" +
    `<input id="deviceNameInput" class="input big" maxlength="12" value="${escapeHtmlText(cur)}" autocomplete="off">` +
    '<p id="deviceNameMsg" class="msg"></p>',
    [{label:"決定", kind:"primary", onClick:()=>{
        const v = ($("deviceNameInput") || {}).value || "";
        if(!setDeviceName(v)){ showMsg("deviceNameMsg", "名前を入れてください"); return; }
        closeModal(); renderStatusBar();
      }},
     {label:"あとで", onClick:()=>{ closeModal(); renderStatusBar(); }}]);
  setTimeout(()=>{ const el=$("deviceNameInput"); if(el) el.focus(); }, 100);
}

function saveBundleMeta(createdAt, fileName){
  try{
    localStorage.setItem(BUNDLE_META_KEY, JSON.stringify({created_at:createdAt||"", file_name:fileName||"", loaded_at:nowText()}));
  }catch(e){}
}

function getBundleMeta(){
  try{ return JSON.parse(localStorage.getItem(BUNDLE_META_KEY) || "null"); }catch(e){ return null; }
}

function rpShortTime(s){
  const m = String(s || "").match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})[ T](\d{1,2}):(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])} ${m[4].padStart(2,"0")}:${m[5]}` : String(s || "");
}

function rpInvoiceSet(rows){
  const s = new Set();
  (rows || []).forEach(r => { const v = normalizeInvoiceNo(r.invoice_no); if(v) s.add(v); });
  return s;
}

// この端末で、まだCSVにしていない完了（送り状の数）と、保存確認前のCSVの中身
function rpExportStatus(){
  const unexported = rpInvoiceSet(getUnexportedResultRows());
  const last = isLastExportPending() ? getLastExport() : null;
  let inPending = new Set();
  if(last){
    try{ inPending = rpInvoiceSet(parseCsv(last.csv_text)); }catch(e){}
  }
  let after = 0;
  unexported.forEach(v => { if(!inPending.has(v)) after++; });
  return { unexported: unexported.size, pending: last, pendingCount: inPending.size, afterPending: after };
}

function renderStatusBar(){
  const el = $("statusBar");
  if(!el) return;
  const name = getDeviceName();
  const meta = getBundleMeta();
  const st = rpExportStatus();
  let bundleText;
  if(!meta){
    bundleText = "検品用CSV：まだ読み込んでいません";
  }else if(meta.created_at){
    bundleText = `検品用CSV：${rpShortTime(meta.created_at)} 作成（読み込み ${rpShortTime(meta.loaded_at)}）`;
  }else{
    bundleText = `検品用CSV：作成日時が分からない（古い形式）・読み込み ${rpShortTime(meta.loaded_at)}`;
  }
  let exportText;
  if(st.pending){
    exportText = `<div class="sbWarn">保存確認前のCSVがあります：${escapeHtmlText(st.pending.file_name)}（${st.pendingCount}件）<br>「CSV再読込」から「ファイルを確認できた」か「CSVを再保存」をしてください。</div>` +
                 (st.afterPending > 0 ? `<div class="sbWarn">そのあとに完了して、まだCSVにしていない：${st.afterPending}件</div>` : "");
  }else if(st.unexported > 0){
    exportText = `<div class="sbWarn">この端末で、まだCSVにしていない完了：${st.unexported}件</div>`;
  }else{
    exportText = `<div>この端末で、まだCSVにしていない完了：0件</div>`;
  }
  el.innerHTML =
    `<div class="sbDevice">端末：${name ? escapeHtmlText(name) : "（名前なし）"} <button type="button" class="sbBtn" id="deviceNameBtn">名前</button></div>` +
    `<div>${escapeHtmlText(bundleText)}</div>` +
    exportText +
    '<div class="sbNote">※CSVにしただけでは、パソコンには入っていません。0件でも、パソコンの「検品結果取込」が済んだとは限りません。</div>';
  const b = $("deviceNameBtn");
  if(b) b.onclick = openDeviceNameModal;
}

function showNotFoundModal(inv){
  const meta = getBundleMeta();
  const created = meta && meta.created_at ? rpShortTime(meta.created_at) + " 作成" : "作成日時が分からない";
  showModal("この送り状は、今の検品用CSVにありません",
    `<div class="bigAlert"><p>送り状：<strong>${escapeHtmlText(inv)}</strong></p>` +
    `<p>今の検品用CSV：${escapeHtmlText(created)}</p></div>` +
    "<p>1. 「CSV再読込」を押して、最新の検品用CSVを読み込んでください。</p>" +
    "<p>2. それでも出るときは、次を確かめてください。<br>・送り状番号を読み間違えていないか<br>・パソコンで、この注文の「スマホ検品CSV作成」（ヤマトは発行済データ取込・個口の確定）が済んでいるか</p>" +
    "<p><strong>この送り状は、検品済みにはなっていません。</strong></p>",
    [{label:"CSV再読込", kind:"primary", onClick:()=>{ closeModal(); $("reloadBtn").click(); }},
     {label:"閉じる", onClick:()=>{ closeModal(); setTimeout(()=>{ const i=$("invoiceInput"); if(i) i.focus(); }, 100); }}]);
}

// 2026-11-24：「検品完了」の画面のまま送り状を読んだら、その送り状の検品に進む
// （「次の送り状へ」を押し忘れて読んだ送り状が、何も出ずに捨てられて抜けるのを防ぐ。画面のボタンは今までどおり押せる）
let completeScanComposing = false, completeScanTimer = null;
function completeScanReady(){
  const av = document.querySelector(".view.active");
  const md = $("modal");
  return !!(av && av.id === "completeView" && (!md || md.classList.contains("hidden")));
}
function focusCompleteScanInput(keepValue){
  const el = $("completeScanInput");
  if(!el) return;
  if(!keepValue){ el.value = ""; completeScanComposing = false; }
  const f = () => { if(completeScanReady() && document.activeElement !== el){ try{ el.focus(); }catch(e){} } };
  f(); requestAnimationFrame(f); setTimeout(f, 50);
}
function processCompleteScanNow(){
  clearTimeout(completeScanTimer);
  const el = $("completeScanInput");
  if(!el) return;
  const v = String(el.value || "").trim();
  el.value = "";
  completeScanComposing = false;
  if(!completeScanReady() || !v) return;
  if(hasNonAsciiScan(v)){
    showMsg("saveMsg", "日本語の文字が入りました（送り状は開いていません）。キーボードが日本語になっています。スキャナーの電源を切る →「次の送り状へ」を押す → 送り状の欄を押す → 地球のマークで「ABC」→ スキャナーの電源を入れる、のあとで読み直してください。");
    focusCompleteScanInput();
    return;
  }
  if(isAllBundleInvoicesCompletedOnThisDevice()){
    showMsg("saveMsg", "すべての送り状の検品が終わっています（読んだ送り状 " + v + " は開いていません）。");
    focusCompleteScanInput();
    return;
  }
  // 「次の送り状へ」を押したのと同じ → 送り状の欄に入れて「表示」
  $("nextInvoiceBtn").classList.add("hidden");
  $("saveMsg").textContent = "";
  show("scanInvoiceView");
  resetInvoiceScreen();
  $("invoiceInput").value = v;
  $("invoiceSearchBtn").click();
}
(function(){
  const el = $("completeScanInput");
  if(!el) return;
  el.addEventListener("compositionstart", () => { completeScanComposing = true; clearTimeout(completeScanTimer); });
  el.addEventListener("compositionend", () => { completeScanComposing = false; clearTimeout(completeScanTimer); completeScanTimer = setTimeout(processCompleteScanNow, 30); });
  el.addEventListener("keydown", e => {
    if(e.key !== "Enter") return;
    clearTimeout(completeScanTimer);
    if(e.isComposing){ completeScanTimer = setTimeout(processCompleteScanNow, 300); return; }
    e.preventDefault();
    processCompleteScanNow();
  });
  el.addEventListener("input", e => {
    clearTimeout(completeScanTimer);
    completeScanTimer = setTimeout(processCompleteScanNow, (e.isComposing || completeScanComposing) ? 800 : 150);
  });
  // 完了の画面でボタン（途中保存・確認の画面など）を押したあとも、また読めるようにする
  document.addEventListener("click", () => setTimeout(() => focusCompleteScanInput(true), 300));
})();
