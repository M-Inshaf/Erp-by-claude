// ============================================================
// HUMMINGBIRD CLOTHING ERP v3.0 — MASTER SCRIPT
// FujiSan Lanka Pvt Ltd
// ============================================================

const DB_KEY = 'hummingbird_erp_v3';
let db = {
  agents: [{ id: 1, name: 'Default Agent', note: '' }],
  cutting: [], finishing: [], sgLedger: [],
  customers: [], custInvoices: [], custPayments: [], custReturns: [],
  suppliers: [], supPurchases: [], supPayments: [],
  inventory: { fabric: [], accessories: [], finished: [], returned: [] },
  production: [], expenses: [], cheques: [], staff: [], salaries: [],
  settings: {
    theme: 'light', company: 'Fuji San Lanka Pvt Ltd', brand: 'Hummingbird Clothing',
    phone: '', address: '', lastBackup: null,
    expCategories: ['Transportation','Electricity','Printing','Embroidery','Rent','Water','Telephone','Miscellaneous']
  }
};

let currentAgentId = 1;
let currentCustomerId = null;
let currentSupplierId = null;
let pendingDelete = null;

// ===================== PERSISTENCE =====================
function saveDB() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    const el = document.getElementById('saveStatus');
    if (el) el.textContent = '● Saved ' + new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  } catch(e) { console.warn('Save failed:', e); }
}

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      db = Object.assign({}, db, parsed);
      if (!db.settings) db.settings = {};
      if (!db.settings.expCategories) db.settings.expCategories = ['Transportation','Electricity','Printing','Embroidery','Rent','Water','Telephone','Miscellaneous'];
      if (!db.inventory) db.inventory = { fabric:[], accessories:[], finished:[], returned:[] };
      ['production','expenses','cheques','staff','salaries','custReturns','supPurchases','supPayments',
       'cutting','finishing','sgLedger','customers','custInvoices','custPayments','suppliers'].forEach(k => {
        if (!db[k]) db[k] = [];
      });
    }
    if (!db.agents || !db.agents.length) db.agents = [{ id: 1, name: 'Default Agent', note: '' }];
    currentAgentId = db.agents[0].id;
  } catch(e) { console.warn('Load failed:', e); }
}

setInterval(saveDB, 8000);
window.addEventListener('beforeunload', saveDB);

// IndexedDB shadow backup
try {
  const idbReq = indexedDB.open('HummingbirdERPv3', 2);
  idbReq.onupgradeneeded = e => { const d=e.target.result; if(!d.objectStoreNames.contains('snapshots')) d.createObjectStore('snapshots'); };
  idbReq.onsuccess = e => {
    const idb = e.target.result;
    setInterval(() => { try { const tx=idb.transaction(['snapshots'],'readwrite'); tx.objectStore('snapshots').put(JSON.stringify(db),'latest'); } catch(e){} }, 12000);
  };
} catch(e){}

// ===================== HELPERS =====================
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); } catch(e){ return d; }
}
function fmtLKR(n) { return 'LKR ' + (parseFloat(n)||0).toLocaleString('en-LK',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function uid() { return Date.now() + Math.floor(Math.random()*9999); }
function today() { return new Date().toISOString().split('T')[0]; }
function numVal(id) { const el=document.getElementById(id); return el ? (parseFloat(el.value)||0) : 0; }
function strVal(id) { const el=document.getElementById(id); return el ? el.value.trim() : ''; }
function setVal(id, v) { const el=document.getElementById(id); if(el) el.value=v; }
function setText(id, v) { const el=document.getElementById(id); if(el) el.textContent=v; }

function showToast(msg, type='success') {
  const t = document.getElementById('toastEl');
  if (!t) return;
  const icons={success:'✅',error:'❌',info:'ℹ️'};
  t.innerHTML = `<span>${icons[type]||'✅'}</span> ${msg}`;
  t.className='toast '+type;
  setTimeout(()=>t.classList.add('show'),10);
  setTimeout(()=>t.classList.remove('show'),3800);
}
function openModal(id) { const el=document.getElementById(id); if(el) el.classList.add('open'); }
function closeModal(id) { const el=document.getElementById(id); if(el) el.classList.remove('open'); }

function nextInvoiceNo() { return 'INV-'+String((db.custInvoices.length||0)+1).padStart(4,'0'); }
function nextBatchId() { return 'BATCH-'+new Date().getFullYear()+'-'+String((db.production.length||0)+1).padStart(4,'0'); }

// ===================== NAVIGATION =====================
function navTo(page, el) {
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  if (el) el.classList.add('active');
  const pg = document.getElementById('page-'+page);
  if (pg) pg.classList.add('active');
  const titles={dashboard:'Dashboard',subgarments:'Sub Garments',production:'Production',
    inventory:'Inventory',customers:'Customers',suppliers:'Suppliers',staff:'Staff',
    expenses:'Expenses',cheques:'Cheque Tracker',reports:'Reports',settings:'Settings'};
  setText('topTitle', titles[page]||page);
  const agentPanel = document.getElementById('agentSwitcherPanel');
  if (page==='subgarments') {
    if(agentPanel) agentPanel.style.display='block';
    renderAgentTabs(); sgRefresh();
  } else {
    if(agentPanel) agentPanel.style.display='none';
  }
  const pageActions={dashboard:refreshDashboard,customers:renderCustomerTable,suppliers:renderSupplierTables,
    inventory:renderInventory,production:renderProduction,expenses:renderExpenses,
    cheques:renderCheques,staff:renderStaff,reports:generateReport,settings:renderSettings};
  if (pageActions[page]) pageActions[page]();
  closeSidebar();
}
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('open');document.getElementById('sidebarOverlay').classList.toggle('open');}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebarOverlay').classList.remove('open');}

// ===================== TABS =====================
function switchTabs(prefix,name,el){
  document.querySelectorAll(`[id^="${prefix}"]`).forEach(p=>p.classList.remove('active'));
  el.closest('.tab-bar').querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  const target=document.getElementById(prefix+name); if(target) target.classList.add('active');
  el.classList.add('active');
}
function sgTab(n,el){switchTabs('sgtab-',n,el);if(n==='finishing')populateCutDropdown();if(n==='statement')buildInvoice();if(n==='ledger')renderSGLedger();}
function custTab(n,el){switchTabs('custtab-',n,el);renderCustomerDetail();}
function supTab(n,el){switchTabs('suptab-',n,el);}
function invTab(n,el){switchTabs('invtab-',n,el);}
function chqTab(n,el){switchTabs('chqtab-',n,el);}
function rptTab(n,el){switchTabs('rpttab-',n,el);generateReport();}

// ===================== THEME =====================
function toggleTheme(){setTheme(document.body.classList.contains('dark-mode')?'light':'dark');}
function setTheme(t){
  const isDark=t==='dark';
  document.body.classList.toggle('dark-mode',isDark);
  const btn=document.getElementById('themeBtn');
  if(btn) btn.textContent=isDark?'☀️ Light':'🌙 Dark';
  if(!db.settings) db.settings={};
  db.settings.theme=t; saveDB();
}
function setAccent(color,rgba){
  document.documentElement.style.setProperty('--accent',color);
  document.documentElement.style.setProperty('--accent-light',rgba+'0.12)');
  showToast('Accent color updated ✨');
}

// ===================== DASHBOARD =====================
function refreshDashboard(){
  const totalSales=db.custInvoices.reduce((s,i)=>s+(i.total||0),0);
  const totalCollected=db.custPayments.reduce((s,p)=>s+(p.amount||0),0);
  const returnVal=db.custReturns.reduce((s,r)=>s+(r.value||0),0);
  const totalReceivable=Math.max(0,totalSales-totalCollected-returnVal);
  const totalExpenses=db.expenses.reduce((s,e)=>s+(e.amount||0),0);
  const totalProdCost=db.production.reduce((s,b)=>s+(b.totalCost||0),0);
  const grossProfit=totalSales-totalProdCost;
  const netProfit=grossProfit-totalExpenses;
  const totalPurchases=db.supPurchases.reduce((s,p)=>s+(p.total||0),0);
  const totalSupPaid=db.supPayments.reduce((s,p)=>s+(p.amount||0),0);
  const totalPayable=Math.max(0,totalPurchases-totalSupPaid);
  const fabricVal=db.inventory.fabric.reduce((s,i)=>s+(i.qty*(i.costPerUnit||0)),0);
  const accVal=db.inventory.accessories.reduce((s,i)=>s+(i.qty*(i.costPerUnit||0)),0);
  const finishedVal=db.inventory.finished.reduce((s,i)=>s+(i.qty*(i.costPerUnit||0)),0);
  const invTotal=fabricVal+accVal+finishedVal;
  const pendingCheques=db.cheques.filter(c=>c.status==='Pending').length;
  const now=new Date(); const tm=now.getMonth()+1; const ty=now.getFullYear();
  const paidTM=db.salaries.filter(s=>s.month==tm&&s.year==ty).reduce((t,s)=>t+(s.amount||0),0);
  const salaryDue=Math.max(0,db.staff.reduce((t,s)=>t+(s.salary||0),0)-paidTM);
  const kpis={'dk-sales':fmtLKR(totalSales),'dk-gp':fmtLKR(grossProfit),'dk-exp':fmtLKR(totalExpenses),
    'dk-np':fmtLKR(netProfit),'dk-recv':fmtLKR(totalReceivable),'dk-pay':fmtLKR(totalPayable),
    'dk-purchases':fmtLKR(totalPurchases),'dk-inv-val':fmtLKR(invTotal),
    'dk-cheques-pending':pendingCheques,'dk-staff-due':fmtLKR(salaryDue)};
  Object.entries(kpis).forEach(([id,v])=>setText(id,v));
  const rsTb=document.querySelector('#dash-recent-sales tbody');
  if(rsTb){const ri=[...db.custInvoices].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8);rsTb.innerHTML=ri.length?ri.map(inv=>{const c=db.customers.find(c=>c.id===inv.customerId);return`<tr><td>${c?c.name:'—'}</td><td style="font-weight:700;color:var(--accent)">${inv.invoiceNo}</td><td style="font-weight:700">${fmtLKR(inv.total)}</td><td>${fmtDate(inv.date)}</td></tr>`}).join(''):'<tr class="empty-row"><td colspan="4">No sales yet</td></tr>';}
  const asTb=document.querySelector('#dash-agent-summary tbody');
  if(asTb){asTb.innerHTML=db.agents.length?db.agents.map(a=>{const bills=db.finishing.filter(f=>f.agentId===a.id).reduce((s,f)=>s+(f.grossBill||0),0);const paid=db.sgLedger.filter(l=>l.agentId===a.id&&l.debit>0).reduce((s,l)=>s+(l.debit||0),0);const bal=bills-paid;return`<tr><td style="font-weight:600">${a.name}</td><td>${fmtLKR(bills)}</td><td style="color:var(--accent2)">${fmtLKR(paid)}</td><td style="color:${bal>0?'var(--accent4)':'var(--accent2)'};font-weight:700">${fmtLKR(bal)}</td></tr>`}).join(''):'<tr class="empty-row"><td colspan="4">No agents yet</td></tr>';}
}

// ===================== SUB GARMENTS =====================
function renderAgentTabs(){
  const c=document.getElementById('agentTabs'); if(!c) return;
  c.innerHTML=db.agents.map(a=>`<div class="agent-tab ${a.id===currentAgentId?'active':''}" onclick="switchAgent(${a.id})"><span>${a.name}</span><div style="display:flex;gap:4px;align-items:center"><span class="adot"></span><button class="btn btn-danger btn-xs" onclick="event.stopPropagation();removeAgent(${a.id})" style="padding:2px 6px;font-size:9px;line-height:1">✕</button></div></div>`).join('');
}
function switchAgent(id){currentAgentId=id;renderAgentTabs();sgRefresh();}
function sgRefresh(){
  const agent=db.agents.find(a=>a.id===currentAgentId)||db.agents[0]; if(!agent) return;
  currentAgentId=agent.id;
  setText('sgCurrentAgentName',agent.name); setText('sgCurrentAgentNote',agent.note||'');
  const bills=db.finishing.filter(f=>f.agentId===currentAgentId).reduce((s,f)=>s+(f.grossBill||0),0);
  const paid=db.sgLedger.filter(l=>l.agentId===currentAgentId&&l.debit>0).reduce((s,l)=>s+(l.debit||0),0);
  setText('sg-total-bills',fmtLKR(bills)); setText('sg-total-paid',fmtLKR(paid)); setText('sg-balance',fmtLKR(bills-paid));
  renderCutTable(); renderFinTable(); renderSGLedger();
}
function addAgent(){
  const name=strVal('newAgentName'); if(!name){showToast('Agent name required','error');return;}
  const a={id:uid(),name,note:strVal('newAgentNote')};
  db.agents.push(a); currentAgentId=a.id;
  renderAgentTabs(); sgRefresh(); closeModal('addAgentModal'); saveDB();
  showToast('Agent "'+name+'" added');
}
function removeAgent(id){
  if(db.agents.length<=1){showToast('Cannot remove last agent','error');return;}
  if(!confirm('Remove this agent and all their data?')) return;
  ['cutting','finishing','sgLedger'].forEach(k=>db[k]=db[k].filter(e=>e.agentId!==id));
  db.agents=db.agents.filter(a=>a.id!==id); currentAgentId=db.agents[0].id;
  renderAgentTabs(); sgRefresh(); saveDB(); showToast('Agent removed');
}

// -- Cutting --
function calcCut(){
  const l=numVal('cLayers'),s=numVal('cSizes'),r=numVal('cRate');
  setText('cExpQty',(l*s).toFixed(0)); setText('cProjVal',(l*s*r).toFixed(2));
}
function addCutting(){
  const inv=strVal('cInvoice'),date=strVal('cDate');
  const layers=numVal('cLayers'),sizes=numVal('cSizes'),rate=numVal('cRate'),status=strVal('cStatus');
  if(!inv){showToast('Invoice no. required','error');return;}
  if(!date){showToast('Date required','error');return;}
  if(!layers||layers<=0){showToast('Cuts must be > 0','error');return;}
  if(!sizes||sizes<=0){showToast('Layers must be > 0','error');return;}
  if(!rate||rate<=0){showToast('Rate must be > 0','error');return;}
  if(!status){showToast('Select a status','error');return;}
  if(db.cutting.some(e=>e.agentId===currentAgentId&&e.invoiceNo===inv)){showToast('Invoice already exists for this agent','error');return;}
  db.cutting.push({id:uid(),agentId:currentAgentId,invoiceNo:inv,date,layers,sizes,
    itemName:strVal('cItemName'),description:strVal('cDescription'),sizesLabel:strVal('cSizesLabel'),
    expectedQty:layers*sizes,unitRate:rate,projectedValue:layers*sizes*rate,status});
  clearCuttingForm(); renderCutTable(); saveDB(); showToast('Dispatch entry added');
}
function renderCutTable(){
  const tb=document.querySelector('#cutTable tbody'); if(!tb) return; tb.innerHTML='';
  const rows=db.cutting.filter(e=>e.agentId===currentAgentId);
  if(!rows.length){tb.innerHTML='<tr class="empty-row"><td colspan="12">No entries yet</td></tr>';return;}
  rows.forEach(e=>{
    const tr=tb.insertRow();
    const sc=e.status==='Completed'?'badge-completed':e.status==='In Progress'?'badge-inprogress':'badge-pending';
    tr.innerHTML=`<td style="font-weight:700;color:var(--accent)">${e.invoiceNo}</td><td>${fmtDate(e.date)}</td><td>${e.itemName||'—'}</td><td>${e.description||'—'}</td><td>${e.layers}</td><td>${e.sizes}</td><td>${e.sizesLabel||'—'}</td><td><strong>${e.expectedQty}</strong></td><td>LKR ${(e.unitRate||0).toFixed(2)}</td><td style="font-weight:700;color:var(--accent2)">LKR ${(e.projectedValue||0).toFixed(2)}</td><td><span class="badge ${sc}">${e.status}</span></td><td><div class="action-cell"><button class="btn btn-danger btn-xs" onclick="deleteRecord('cutting',${e.id})">🗑️</button></div></td>`;
  });
}
function clearCuttingForm(){['cInvoice','cDate','cLayers','cSizes','cRate','cStatus','cItemName','cDescription','cSizesLabel'].forEach(id=>setVal(id,''));calcCut();}

// -- Finishing --
function populateCutDropdown(){
  const sel=document.getElementById('fCutInv'); if(!sel) return;
  sel.innerHTML='<option value="">— Select Cut Invoice —</option>';
  db.cutting.filter(e=>e.agentId===currentAgentId).forEach(e=>{
    const used=db.finishing.some(f=>f.agentId===currentAgentId&&f.cutInvoice===e.invoiceNo);
    if(!used) sel.innerHTML+=`<option value="${e.invoiceNo}">${e.invoiceNo} — ${e.itemName||'Item'} (Exp: ${e.expectedQty} @ LKR${e.unitRate})</option>`;
  });
}
function onCutSelect(){
  const v=strVal('fCutInv');
  const cut=db.cutting.find(e=>e.agentId===currentAgentId&&e.invoiceNo===v);
  setVal('fExpQty',cut?cut.expectedQty:''); calcFin();
}
function calcFin(){
  const gradeA=numVal('fGradeA'),dmg=numVal('fDmgComp'),waste=numVal('fWaste');
  const cut=db.cutting.find(e=>e.agentId===currentAgentId&&e.invoiceNo===strVal('fCutInv'));
  const rate=cut?cut.unitRate:0,expQty=cut?cut.expectedQty:0;
  const totalAcc=gradeA+dmg,shortage=expQty-totalAcc-waste,gross=totalAcc*rate;
  setText('fTotAcc',totalAcc); setText('fShort',shortage);
  setText('fURate',rate.toFixed(2)); setText('fGross',gross.toFixed(2));
}
function addFinishing(){
  const subInv=strVal('fSubInv'),cutInv=strVal('fCutInv'),date=strVal('fDate');
  const gradeA=numVal('fGradeA'),dmg=numVal('fDmgComp'),waste=numVal('fWaste');
  if(!subInv){showToast('Sub invoice no. required','error');return;}
  if(!cutInv){showToast('Select a cut invoice','error');return;}
  if(!date){showToast('Date required','error');return;}
  const cut=db.cutting.find(e=>e.agentId===currentAgentId&&e.invoiceNo===cutInv);
  const rate=cut?cut.unitRate:0,expQty=cut?cut.expectedQty:0;
  const totalAcc=gradeA+dmg,shortage=expQty-totalAcc-waste,gross=totalAcc*rate;
  db.finishing.push({id:uid(),agentId:currentAgentId,subInvoice:subInv,cutInvoice:cutInv,date,
    gradeA,damagedComplete:dmg,waste,totalAccepted:totalAcc,shortage,unitRate:rate,grossBill:gross});
  db.sgLedger.push({id:uid(),agentId:currentAgentId,date,type:'Invoice Accrual',
    reference:subInv,debit:0,credit:gross,paymentMethod:'',txRef:''});
  clearFinForm(); renderFinTable(); sgRefresh(); saveDB(); showToast('Finishing receipt recorded');
}
function renderFinTable(){
  const tb=document.querySelector('#finTable tbody'); if(!tb) return; tb.innerHTML='';
  const rows=db.finishing.filter(e=>e.agentId===currentAgentId);
  if(!rows.length){tb.innerHTML='<tr class="empty-row"><td colspan="11">No receipts yet</td></tr>';return;}
  rows.forEach(e=>{
    const tr=tb.insertRow();
    tr.innerHTML=`<td style="font-weight:700;color:var(--accent)">${e.subInvoice}</td><td>${e.cutInvoice}</td><td>${fmtDate(e.date)}</td><td style="color:var(--accent2);font-weight:600">${e.gradeA}</td><td style="color:var(--accent4)">${e.damagedComplete}</td><td>${e.waste}</td><td><strong>${e.totalAccepted}</strong></td><td style="color:${e.shortage>0?'var(--accent4)':'var(--accent2)'};font-weight:600">${e.shortage}</td><td>LKR ${(e.unitRate||0).toFixed(2)}</td><td style="font-weight:700;color:var(--accent2)">LKR ${(e.grossBill||0).toFixed(2)}</td><td><div class="action-cell"><button class="btn btn-danger btn-xs" onclick="deleteRecord('finishing',${e.id})">🗑️</button></div></td>`;
  });
}
function clearFinForm(){['fSubInv','fCutInv','fDate','fExpQty','fGradeA','fDmgComp','fWaste'].forEach(id=>setVal(id,''));calcFin();}

// -- SG Ledger --
function onLedgerType(){
  const t=strVal('lType');const show=t==='Disbursed Payment';
  ['lPayMtdGrp','lTxRefGrp'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display=show?'block':'none';});
}
function selectPayPill(el,val){
  document.querySelectorAll('#payPills .pay-pill').forEach(p=>p.classList.remove('active'));
  el.classList.add('active'); setVal('lPayMtd',val);
}
function updateLedgerPreview(){
  const bills=db.finishing.filter(f=>f.agentId===currentAgentId).reduce((s,f)=>s+(f.grossBill||0),0);
  const paid=db.sgLedger.filter(l=>l.agentId===currentAgentId&&l.debit>0).reduce((s,l)=>s+(l.debit||0),0);
  const curBal=bills-paid,type=strVal('lType'),amt=numVal('lAmt');
  const newBal=type==='Disbursed Payment'?curBal-amt:curBal+amt;
  setText('lCurBal',curBal.toFixed(2)); setText('lNewBal',newBal.toFixed(2));
}
function addLedger(){
  const date=strVal('lDate'),type=strVal('lType'),ref=strVal('lRef'),amt=numVal('lAmt');
  const payMtd=strVal('lPayMtd'),txRef=strVal('lTxRef');
  if(!date||!type||!amt){showToast('Date, type and amount required','error');return;}
  if(type==='Disbursed Payment'&&!payMtd){showToast('Select payment method','error');return;}
  db.sgLedger.push({id:uid(),agentId:currentAgentId,date,type,reference:ref,
    debit:type==='Disbursed Payment'?amt:0,credit:type==='Invoice Accrual'?amt:0,paymentMethod:payMtd,txRef});
  clearLedgerForm(); renderSGLedger(); sgRefresh(); saveDB(); showToast('Transaction recorded');
}
function renderSGLedger(){
  const tb=document.querySelector('#ledTable tbody'); if(!tb) return; tb.innerHTML='';
  const rows=db.sgLedger.filter(e=>e.agentId===currentAgentId).sort((a,b)=>new Date(a.date)-new Date(b.date));
  if(!rows.length){tb.innerHTML='<tr class="empty-row"><td colspan="8">No transactions yet</td></tr>';return;}
  let bal=0;
  rows.forEach(e=>{
    bal+=(e.credit||0)-(e.debit||0);
    const tr=tb.insertRow();
    const tc=e.type==='Invoice Accrual'?'badge-credit':'badge-debit';
    tr.innerHTML=`<td>${fmtDate(e.date)}</td><td><span class="badge ${tc}">${e.type}</span></td><td style="font-weight:500">${e.reference||'—'}</td><td>${e.paymentMethod||'—'}</td><td style="color:var(--accent4);font-weight:600">${e.debit?'LKR '+e.debit.toFixed(2):'—'}</td><td style="color:var(--accent2);font-weight:600">${e.credit?'LKR '+e.credit.toFixed(2):'—'}</td><td style="font-weight:700;color:${bal>0?'var(--accent4)':'var(--accent2)'}">${fmtLKR(bal)}</td><td><div class="action-cell"><button class="btn btn-danger btn-xs" onclick="deleteRecord('sgLedger',${e.id})">🗑️</button></div></td>`;
  });
  updateLedgerPreview();
}
function clearLedgerForm(){
  ['lDate','lType','lRef','lAmt','lTxRef','lPayMtd'].forEach(id=>setVal(id,''));
  document.querySelectorAll('#payPills .pay-pill').forEach(p=>p.classList.remove('active'));
  ['lPayMtdGrp','lTxRefGrp'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
}

// -- SG Statement --
function buildInvoice(){
  const agent=db.agents.find(a=>a.id===currentAgentId); if(!agent) return;
  const cuts=db.cutting.filter(e=>e.agentId===currentAgentId);
  const fins=db.finishing.filter(e=>e.agentId===currentAgentId);
  const leds=db.sgLedger.filter(e=>e.agentId===currentAgentId);
  const totalBills=fins.reduce((s,e)=>s+(e.grossBill||0),0);
  const totalPaid=leds.filter(e=>e.debit>0).reduce((s,e)=>s+(e.debit||0),0);
  const outstanding=totalBills-totalPaid;
  setText('invStatementNo','STMT-'+String(agent.id).padStart(4,'0'));
  setText('invCreatedDate','Generated: '+fmtDate(today()));
  setText('invAgent',agent.name+(agent.note?'\n'+agent.note:''));
  setText('invTotalPayable',fmtLKR(totalBills));
  setText('invTotalPaidSummary',fmtLKR(totalPaid));
  setText('invOutstanding',fmtLKR(outstanding));
  setText('invTotalWork',fmtLKR(totalBills));
  setText('invTotalPaid',fmtLKR(totalPaid));
  setText('invBalance',fmtLKR(outstanding));
  setText('invFooterDate','Generated: '+fmtDate(today()));
  const cr=document.getElementById('invCutRows');
  if(cr) cr.innerHTML=cuts.length?cuts.map(e=>`<tr><td style="font-weight:600">${e.invoiceNo}</td><td>${e.itemName||'—'}</td><td>${e.expectedQty}</td><td>LKR ${(e.unitRate||0).toFixed(2)}</td><td>LKR ${(e.projectedValue||0).toFixed(2)}</td></tr>`).join(''):'<tr><td colspan="5" style="text-align:center;color:#9ba8bc;padding:14px">No dispatch entries</td></tr>';
  const fr=document.getElementById('invFinRows');
  if(fr) fr.innerHTML=fins.length?fins.map(e=>`<tr><td style="font-weight:600">${e.subInvoice}</td><td>${fmtDate(e.date)}</td><td>${e.totalAccepted}</td><td>LKR ${(e.unitRate||0).toFixed(2)}</td><td style="font-weight:700">LKR ${(e.grossBill||0).toFixed(2)}</td></tr>`).join(''):'<tr><td colspan="5" style="text-align:center;color:#9ba8bc;padding:14px">No receipts</td></tr>';
  const lr=document.getElementById('invLedRows');
  const payRows=leds.filter(e=>e.debit>0);
  if(lr) lr.innerHTML=payRows.length?payRows.map(e=>`<tr><td>${fmtDate(e.date)}</td><td>${e.reference||'—'}</td><td>${e.type}</td><td>${e.paymentMethod||'—'}</td><td>${e.txRef||'—'}</td><td style="font-weight:700;color:var(--accent2)">LKR ${(e.debit||0).toFixed(2)}</td></tr>`).join(''):'<tr><td colspan="6" style="text-align:center;color:#9ba8bc;padding:14px">No payments recorded</td></tr>';
}
function printInvoice(){window.print();}

// -- SG Exports --
function sgExportPDF(){
  showToast('Generating PDF…');
  setTimeout(()=>{
    const agent=db.agents.find(a=>a.id===currentAgentId);
    const {jsPDF}=window.jspdf; const doc=new jsPDF();
    doc.setFontSize(16);doc.setTextColor(37,99,235);doc.text('Fuji San Lanka Pvt Ltd — Sub Garment Statement',14,18);
    doc.setFontSize(10);doc.setTextColor(90);
    doc.text('Agent: '+(agent?agent.name:'Unknown'),14,26);
    doc.text('Generated: '+new Date().toLocaleString(),14,32);
    const fins=db.finishing.filter(f=>f.agentId===currentAgentId);
    const totalBills=fins.reduce((s,f)=>s+(f.grossBill||0),0);
    const totalPaid=db.sgLedger.filter(l=>l.agentId===currentAgentId&&l.debit>0).reduce((s,l)=>s+(l.debit||0),0);
    doc.autoTable({startY:40,head:[['Sub Invoice','Cut Invoice','Date','Total Accepted','Unit Rate','Gross Bill']],
      body:fins.length?fins.map(f=>[f.subInvoice,f.cutInvoice,fmtDate(f.date),f.totalAccepted,'LKR '+f.unitRate.toFixed(2),'LKR '+f.grossBill.toFixed(2)]):[['No receipts','','','','','']],
      foot:[['','','','Total Payable:','','LKR '+totalBills.toFixed(2)],['','','','Total Paid:','','LKR '+totalPaid.toFixed(2)],['','','','Balance:','','LKR '+(totalBills-totalPaid).toFixed(2)]],
      headStyles:{fillColor:[30,58,138]},footStyles:{fontStyle:'bold',fillColor:[240,245,255],textColor:[20,40,100]}});
    doc.save('SubGarment_'+(agent?agent.name:'Agent')+'_'+today()+'.pdf');
    showToast('PDF downloaded');
  },100);
}
function sgExportAllAgentsPDF(){
  showToast('Generating all-agents PDF…');
  setTimeout(()=>{
    const {jsPDF}=window.jspdf; const doc=new jsPDF();
    doc.setFontSize(16);doc.setTextColor(37,99,235);doc.text('Hummingbird Clothing — All Sub-Agents Summary',14,18);
    doc.setFontSize(9);doc.setTextColor(90);doc.text('Fuji San Lanka Pvt Ltd | '+new Date().toLocaleString(),14,26);
    let y=34;
    db.agents.forEach((a,i)=>{
      const bills=db.finishing.filter(f=>f.agentId===a.id).reduce((s,f)=>s+(f.grossBill||0),0);
      const paid=db.sgLedger.filter(l=>l.agentId===a.id&&l.debit>0).reduce((s,l)=>s+(l.debit||0),0);
      doc.setFontSize(11);doc.setTextColor(20,40,100);doc.text('Agent: '+a.name,14,y);y+=5;
      doc.autoTable({startY:y,
        head:[['Sub Invoice','Date','Total Accepted','Unit Rate','Gross Bill']],
        body:db.finishing.filter(f=>f.agentId===a.id).map(f=>[f.subInvoice,fmtDate(f.date),f.totalAccepted,'LKR '+f.unitRate.toFixed(2),'LKR '+f.grossBill.toFixed(2)]),
        foot:[['','Total Payable:','','','LKR '+bills.toFixed(2)],['','Total Paid:','','','LKR '+paid.toFixed(2)],['','Balance:','','','LKR '+(bills-paid).toFixed(2)]],
        headStyles:{fillColor:[30,58,138]},footStyles:{fontStyle:'bold'},margin:{left:14,right:14}});
      y=doc.lastAutoTable.finalY+12;
      if(y>260&&i<db.agents.length-1){doc.addPage();y=20;}
    });
    doc.save('HummingbirdERP_AllAgents_'+today()+'.pdf'); showToast('All-agents PDF downloaded');
  },100);
}
function sgExportExcel(){
  const wb=XLSX.utils.book_new();
  const agent=db.agents.find(a=>a.id===currentAgentId);
  const data=[['Sub Invoice','Cut Invoice','Date','Grade A','Dmg Complete','Waste','Total Accepted','Shortage','Unit Rate','Gross Bill'],
    ...db.finishing.filter(f=>f.agentId===currentAgentId).map(f=>[f.subInvoice,f.cutInvoice,f.date,f.gradeA,f.damagedComplete,f.waste,f.totalAccepted,f.shortage,f.unitRate,f.grossBill])];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(data),agent?agent.name.substring(0,31):'Agent');
  XLSX.writeFile(wb,'SubGarment_'+(agent?agent.name:'Agent')+'_'+today()+'.xlsx');
  showToast('Excel exported');
}

// ===================== CUSTOMERS =====================
function addCustomer(){
  const name=strVal('newCustName'); if(!name){showToast('Customer name required','error');return;}
  db.customers.push({id:uid(),name,contact:strVal('newCustContact'),ref:strVal('newCustRef'),createdAt:today()});
  ['newCustName','newCustContact','newCustRef'].forEach(id=>setVal(id,''));
  closeModal('addCustomerModal'); renderCustomerTable(); saveDB(); showToast('Customer "'+name+'" added');
}
function getCustomerBalance(cid){
  const sales=db.custInvoices.filter(i=>i.customerId===cid).reduce((s,i)=>s+(i.total||0),0);
  const paid=db.custPayments.filter(p=>p.customerId===cid).reduce((s,p)=>s+(p.amount||0),0);
  const returned=db.custReturns.filter(r=>r.customerId===cid).reduce((s,r)=>s+(r.value||0),0);
  return{sales,paid,balance:Math.max(0,sales-paid-returned)};
}
function updateCustomerKPIs(){
  const ts=db.custInvoices.reduce((s,i)=>s+(i.total||0),0);
  const tc=db.custPayments.reduce((s,p)=>s+(p.amount||0),0);
  const tr=db.custReturns.reduce((s,r)=>s+(r.value||0),0);
  setText('cust-total-sales',fmtLKR(ts)); setText('cust-total-recv',fmtLKR(Math.max(0,ts-tc-tr)));
  setText('cust-total-collected',fmtLKR(tc)); setText('cust-count',db.customers.length);
}
function renderCustomerTable(){
  updateCustomerKPIs();
  document.getElementById('customerListView').style.display='block';
  document.getElementById('customerDetailView').style.display='none';
  const tb=document.querySelector('#customerTable tbody'); if(!tb) return; tb.innerHTML='';
  if(!db.customers.length){tb.innerHTML='<tr class="empty-row"><td colspan="7">No customers yet — add one above</td></tr>';return;}
  db.customers.forEach((c,i)=>{
    const b=getCustomerBalance(c.id); const tr=tb.insertRow();
    tr.innerHTML=`<td>${i+1}</td><td style="font-weight:700;color:var(--accent);cursor:pointer" onclick="openCustomerDetail(${c.id})">${c.name}</td><td>${c.contact||'—'}</td><td>${fmtLKR(b.sales)}</td><td style="color:var(--accent2);font-weight:600">${fmtLKR(b.paid)}</td><td style="color:${b.balance>0?'var(--accent4)':'var(--accent2)'};font-weight:700">${fmtLKR(b.balance)}</td><td><div class="action-cell"><button class="btn btn-primary btn-xs" onclick="openCustomerDetail(${c.id})">👁️</button><button class="btn btn-danger btn-xs" onclick="deleteRecord('customers',${c.id})">🗑️</button></div></td>`;
  });
}
function openCustomerDetail(id){
  currentCustomerId=id;
  document.getElementById('customerListView').style.display='none';
  document.getElementById('customerDetailView').style.display='block';
  const cust=db.customers.find(c=>c.id===id);
  setText('custDetailName',cust.name);
  setText('custDetailContact',(cust.contact||'')+(cust.ref?' · '+cust.ref:''));
  // Reset tabs
  document.querySelectorAll('[id^="custtab-"]').forEach(p=>p.classList.remove('active'));
  document.getElementById('custtab-invoices').classList.add('active');
  document.querySelectorAll('#customerDetailView .tab-btn').forEach((b,i)=>{b.classList.toggle('active',i===0);});
  renderCustomerDetail();
}
function showCustomerList(){currentCustomerId=null;renderCustomerTable();}
function renderCustomerDetail(){
  if(!currentCustomerId) return;
  const b=getCustomerBalance(currentCustomerId);
  setText('custd-total-billed',fmtLKR(b.sales)); setText('custd-total-paid',fmtLKR(b.paid)); setText('custd-balance',fmtLKR(b.balance));
  // Invoices
  const invTb=document.querySelector('#custInvTable tbody');
  if(invTb){const invs=db.custInvoices.filter(i=>i.customerId===currentCustomerId).sort((a,b)=>new Date(b.date)-new Date(a.date));invTb.innerHTML=invs.length?invs.map(i=>`<tr><td style="font-weight:700;color:var(--accent)">${i.invoiceNo}</td><td>${fmtDate(i.date)}</td><td>${i.product}</td><td>${i.qty}</td><td>LKR ${(i.rate||0).toFixed(2)}</td><td style="font-weight:700">${fmtLKR(i.total)}</td><td><div class="action-cell"><button class="btn btn-pdf btn-xs" onclick="printSingleInvoice(${i.id})">🖨️</button><button class="btn btn-danger btn-xs" onclick="deleteRecord('custInvoices',${i.id})">🗑️</button></div></td></tr>`).join(''):'<tr class="empty-row"><td colspan="7">No invoices</td></tr>';}
  // Payments
  const payTb=document.querySelector('#custPayTable tbody');
  if(payTb){const pays=db.custPayments.filter(p=>p.customerId===currentCustomerId).sort((a,b)=>new Date(b.date)-new Date(a.date));payTb.innerHTML=pays.length?pays.map(p=>`<tr><td>${fmtDate(p.date)}</td><td style="font-weight:700;color:var(--accent2)">${fmtLKR(p.amount)}</td><td>${p.method||'—'}</td><td>${p.ref||'—'}</td><td>${p.note||'—'}</td><td><button class="btn btn-danger btn-xs" onclick="deleteRecord('custPayments',${p.id})">🗑️</button></td></tr>`).join(''):'<tr class="empty-row"><td colspan="6">No payments</td></tr>';}
  // Returns
  const retTb=document.querySelector('#custRetTable tbody');
  if(retTb){const rets=db.custReturns.filter(r=>r.customerId===currentCustomerId);retTb.innerHTML=rets.length?rets.map(r=>`<tr><td>${fmtDate(r.date)}</td><td>${r.invRef||'—'}</td><td>${r.qty}</td><td><span class="badge ${r.type==='Damaged'?'badge-debit':'badge-pending'}">${r.type}</span></td><td>${fmtLKR(r.value)}</td><td>${r.note||'—'}</td><td><button class="btn btn-danger btn-xs" onclick="deleteRecord('custReturns',${r.id})">🗑️</button></td></tr>`).join(''):'<tr class="empty-row"><td colspan="7">No returns</td></tr>';}
  // Ledger
  const ledTb=document.querySelector('#custLedgerTable tbody');
  if(ledTb){let rb=0;const txns=[...db.custInvoices.filter(i=>i.customerId===currentCustomerId).map(i=>({date:i.date,type:'Invoice',ref:i.invoiceNo,debit:i.total,credit:0})),...db.custPayments.filter(p=>p.customerId===currentCustomerId).map(p=>({date:p.date,type:'Payment',ref:p.ref||'—',debit:0,credit:p.amount})),...db.custReturns.filter(r=>r.customerId===currentCustomerId).map(r=>({date:r.date,type:'Return',ref:r.invRef||'—',debit:0,credit:r.value}))].sort((a,b)=>new Date(a.date)-new Date(b.date));ledTb.innerHTML=txns.length?txns.map(t=>{rb+=t.debit-t.credit;return`<tr><td>${fmtDate(t.date)}</td><td>${t.type}</td><td>${t.ref}</td><td style="color:var(--accent4)">${t.debit?fmtLKR(t.debit):'—'}</td><td style="color:var(--accent2)">${t.credit?fmtLKR(t.credit):'—'}</td><td style="font-weight:700;color:${rb>0?'var(--accent4)':'var(--accent2)'}">${fmtLKR(rb)}</td></tr>`}).join(''):'<tr class="empty-row"><td colspan="6">No transactions</td></tr>';}
}
function openAddInvoiceModal(){setVal('invNo',nextInvoiceNo());setVal('invDate',today());['invProduct','invQty','invRate','invTotal','invNotes'].forEach(id=>setVal(id,''));openModal('addInvoiceModal');}
function calcInvoice(){const q=numVal('invQty'),r=numVal('invRate');setVal('invTotal','LKR '+(q*r).toFixed(2));}
function saveInvoice(){
  const no=strVal('invNo'),date=strVal('invDate'),product=strVal('invProduct');
  const qty=numVal('invQty'),rate=numVal('invRate');
  if(!date||!product||!qty||!rate){showToast('Fill all required fields','error');return;}
  db.custInvoices.push({id:uid(),customerId:currentCustomerId,invoiceNo:no,date,product,qty,rate,total:qty*rate,notes:strVal('invNotes')});
  closeModal('addInvoiceModal'); renderCustomerDetail(); updateCustomerKPIs(); saveDB(); showToast('Invoice '+no+' saved');
}
function openAddPaymentModal(){setVal('custPayDate',today());['custPayAmt','custPayRef','custPayNote','custPayMethod'].forEach(id=>setVal(id,''));document.querySelectorAll('#custPayPills .pay-pill').forEach(p=>p.classList.remove('active'));openModal('addPaymentModal');}
function selectCustPayPill(el,val){document.querySelectorAll('#custPayPills .pay-pill').forEach(p=>p.classList.remove('active'));el.classList.add('active');setVal('custPayMethod',val);}
function saveCustomerPayment(){
  const date=strVal('custPayDate'),amt=numVal('custPayAmt');
  if(!date||!amt){showToast('Date and amount required','error');return;}
  db.custPayments.push({id:uid(),customerId:currentCustomerId,date,amount:amt,method:strVal('custPayMethod'),ref:strVal('custPayRef'),note:strVal('custPayNote')});
  closeModal('addPaymentModal'); renderCustomerDetail(); updateCustomerKPIs(); saveDB(); showToast('Payment recorded');
}
function openAddReturnModal(){setVal('retDate',today());['retInvRef','retQty','retValue','retNote'].forEach(id=>setVal(id,''));setVal('retType','');openModal('addReturnModal');}
function saveReturn(){
  const date=strVal('retDate'),qty=numVal('retQty'),unitVal=numVal('retValue'),type=strVal('retType');
  if(!date||!qty||!unitVal||!type){showToast('Fill all required fields','error');return;}
  const totalVal=qty*unitVal;
  db.custReturns.push({id:uid(),customerId:currentCustomerId,date,invRef:strVal('retInvRef'),qty,type,value:totalVal,note:strVal('retNote')});
  if(type==='Saleable') db.inventory.returned.push({id:uid(),product:'Returned Goods',customerId:currentCustomerId,date,qty,value:totalVal,status:'In Stock'});
  if(type==='Damaged') db.expenses.push({id:uid(),date,category:'Miscellaneous',type:'Operational',amount:totalVal,description:'Damaged return from customer',batchId:''});
  closeModal('addReturnModal'); renderCustomerDetail(); updateCustomerKPIs(); saveDB(); showToast('Return recorded');
}
function printCustomerStatement(){
  const cust=db.customers.find(c=>c.id===currentCustomerId); if(!cust) return;
  showToast('Generating customer statement…');
  setTimeout(()=>{
    const {jsPDF}=window.jspdf;const doc=new jsPDF();
    const b=getCustomerBalance(currentCustomerId);
    doc.setFontSize(16);doc.setTextColor(37,99,235);doc.text('Fuji San Lanka Pvt Ltd — Customer Statement',14,18);
    doc.setFontSize(10);doc.setTextColor(90);doc.text('Customer: '+cust.name,14,26);doc.text('Contact: '+(cust.contact||'—'),14,32);doc.text('Generated: '+new Date().toLocaleString(),14,38);
    const invs=db.custInvoices.filter(i=>i.customerId===currentCustomerId);
    doc.autoTable({startY:46,head:[['Invoice No.','Date','Product','Qty','Rate','Total']],body:invs.map(i=>[i.invoiceNo,fmtDate(i.date),i.product,i.qty,'LKR '+i.rate.toFixed(2),'LKR '+i.total.toFixed(2)]),headStyles:{fillColor:[30,58,138]}});
    let y=doc.lastAutoTable.finalY+8;
    const pays=db.custPayments.filter(p=>p.customerId===currentCustomerId);
    doc.autoTable({startY:y,head:[['Date','Amount','Method','Reference','Note']],body:pays.map(p=>[fmtDate(p.date),'LKR '+p.amount.toFixed(2),p.method||'—',p.ref||'—',p.note||'—']),headStyles:{fillColor:[5,90,70]}});
    y=doc.lastAutoTable.finalY+10;
    doc.setFontSize(11);doc.setTextColor(20,40,100);
    doc.text('Total Sales: LKR '+b.sales.toFixed(2)+' | Collected: LKR '+b.paid.toFixed(2)+' | Balance: LKR '+b.balance.toFixed(2),14,y);
    doc.save('Customer_'+cust.name+'_Statement_'+today()+'.pdf'); showToast('Customer statement downloaded');
  },100);
}
function printSingleInvoice(id){
  const inv=db.custInvoices.find(i=>i.id===id);const cust=db.customers.find(c=>c.id===inv?.customerId);
  if(!inv||!cust) return;
  showToast('Generating invoice PDF…');
  setTimeout(()=>{
    const {jsPDF}=window.jspdf;const doc=new jsPDF();
    doc.setFontSize(20);doc.setTextColor(37,99,235);doc.text('SALES INVOICE',14,20);
    doc.setFontSize(10);doc.setTextColor(90);
    doc.text('Fuji San Lanka Pvt Ltd — Hummingbird Clothing',14,30);
    doc.text('Invoice No: '+inv.invoiceNo,14,38);doc.text('Date: '+fmtDate(inv.date),14,44);
    doc.text('Customer: '+cust.name,14,50);doc.text('Contact: '+(cust.contact||'—'),14,56);
    doc.autoTable({startY:64,head:[['Description','Qty','Unit Rate','Total Amount']],
      body:[[inv.product,inv.qty,'LKR '+inv.rate.toFixed(2),'LKR '+inv.total.toFixed(2)]],
      foot:[['','','TOTAL:','LKR '+inv.total.toFixed(2)]],
      headStyles:{fillColor:[30,58,138]},footStyles:{fontStyle:'bold',fillColor:[240,245,255]}});
    if(inv.notes){const fy=doc.lastAutoTable.finalY+10;doc.setFontSize(9);doc.setTextColor(100);doc.text('Notes: '+inv.notes,14,fy);}
    doc.save('Invoice_'+inv.invoiceNo+'.pdf'); showToast('Invoice PDF downloaded');
  },100);
}
function exportCustomersPDF(){
  showToast('Generating customers PDF…');
  setTimeout(()=>{
    const {jsPDF}=window.jspdf;const doc=new jsPDF();
    doc.setFontSize(16);doc.setTextColor(37,99,235);doc.text('Customers Report',14,18);
    doc.setFontSize(9);doc.setTextColor(90);doc.text('Fuji San Lanka Pvt Ltd | '+new Date().toLocaleString(),14,26);
    doc.autoTable({startY:32,head:[['#','Name','Contact','Total Sales','Collected','Receivable']],
      body:db.customers.map((c,i)=>{const b=getCustomerBalance(c.id);return[i+1,c.name,c.contact||'—','LKR '+b.sales.toFixed(2),'LKR '+b.paid.toFixed(2),'LKR '+b.balance.toFixed(2)];}),
      headStyles:{fillColor:[30,58,138]},alternateRowStyles:{fillColor:[245,248,255]}});
    doc.save('Customers_Report_'+today()+'.pdf'); showToast('Customers PDF downloaded');
  },100);
}
function exportCustomersExcel(){
  const wb=XLSX.utils.book_new();
  const data=[['Name','Contact','Total Sales','Collected','Receivable'],...db.customers.map(c=>{const b=getCustomerBalance(c.id);return[c.name,c.contact||'',b.sales,b.paid,b.balance];})];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(data),'Customers');
  XLSX.writeFile(wb,'Customers_Report_'+today()+'.xlsx'); showToast('Excel exported');
}

// ===================== SUPPLIERS =====================
function addSupplier(){
  const name=strVal('newSupName'),type=strVal('newSupType');
  if(!name||!type){showToast('Name and type required','error');return;}
  db.suppliers.push({id:uid(),name,type,contact:strVal('newSupContact'),items:strVal('newSupItems'),createdAt:today()});
  ['newSupName','newSupType','newSupContact','newSupItems'].forEach(id=>setVal(id,''));
  closeModal('addSupplierModal'); renderSupplierTables(); saveDB(); showToast('Supplier "'+name+'" added');
}
function getSupplierBalance(sid){
  const purchases=db.supPurchases.filter(p=>p.supplierId===sid).reduce((s,p)=>s+(p.total||0),0);
  const paid=db.supPayments.filter(p=>p.supplierId===sid).reduce((s,p)=>s+(p.amount||0),0);
  return{purchases,paid,balance:Math.max(0,purchases-paid)};
}
function updateSupplierKPIs(){
  const tp=db.supPurchases.reduce((s,p)=>s+(p.total||0),0);
  const paid=db.supPayments.reduce((s,p)=>s+(p.amount||0),0);
  setText('sup-total-purchases',fmtLKR(tp)); setText('sup-total-payable',fmtLKR(Math.max(0,tp-paid)));
  setText('sup-total-paid',fmtLKR(paid)); setText('sup-count',db.suppliers.length);
}
function renderSupplierTables(){
  updateSupplierKPIs();
  if(currentSupplierId){renderSupplierDetail();return;}
  const makeRow=(s,i)=>{const b=getSupplierBalance(s.id);return`<tr><td>${i+1}</td><td style="font-weight:700;cursor:pointer;color:var(--accent)" onclick="openSupplierDetail(${s.id})">${s.name}</td><td>${s.contact||'—'}</td><td>${s.items||'—'}</td><td>${fmtLKR(b.purchases)}</td><td style="color:${b.balance>0?'var(--accent4)':'var(--accent2)'};font-weight:700">${fmtLKR(b.balance)}</td><td><div class="action-cell"><button class="btn btn-primary btn-xs" onclick="openSupplierDetail(${s.id})">👁️</button><button class="btn btn-danger btn-xs" onclick="deleteRecord('suppliers',${s.id})">🗑️</button></div></td></tr>`;};
  const fabTb=document.querySelector('#supFabricTable tbody');
  const fabSups=db.suppliers.filter(s=>s.type==='Fabric');
  if(fabTb) fabTb.innerHTML=fabSups.length?fabSups.map(makeRow).join(''):'<tr class="empty-row"><td colspan="7">No fabric suppliers</td></tr>';
  const accTb=document.querySelector('#supAccTable tbody');
  const accSups=db.suppliers.filter(s=>s.type==='Accessories');
  if(accTb) accTb.innerHTML=accSups.length?accSups.map(makeRow).join(''):'<tr class="empty-row"><td colspan="7">No accessories suppliers</td></tr>';
  const dv=document.getElementById('supplierDetailView'); if(dv) dv.style.display='none';
}
function openSupplierDetail(id){
  currentSupplierId=id;
  const sup=db.suppliers.find(s=>s.id===id);
  setText('supDetailName',sup.name);
  setText('supDetailType',sup.type+' Supplier'+(sup.contact?' · '+sup.contact:''));
  const dv=document.getElementById('supplierDetailView'); if(dv) dv.style.display='block';
  renderSupplierDetail();
}
function showSupplierList(){currentSupplierId=null;renderSupplierTables();}
function renderSupplierDetail(){
  if(!currentSupplierId) return;
  const b=getSupplierBalance(currentSupplierId);
  setText('supd-purchases',fmtLKR(b.purchases)); setText('supd-paid',fmtLKR(b.paid)); setText('supd-balance',fmtLKR(b.balance));
  const purTb=document.querySelector('#supPurchaseTable tbody');
  if(purTb){const purs=db.supPurchases.filter(p=>p.supplierId===currentSupplierId).sort((a,b)=>new Date(b.date)-new Date(a.date));purTb.innerHTML=purs.length?purs.map(p=>`<tr><td>${fmtDate(p.date)}</td><td>${p.invoiceNo||'—'}</td><td style="font-weight:600">${p.item}</td><td>${p.qty}</td><td>${p.unit||'Unit'}</td><td>LKR ${(p.rate||0).toFixed(2)}</td><td style="font-weight:700">${fmtLKR(p.total)}</td><td><button class="btn btn-danger btn-xs" onclick="deleteRecord('supPurchases',${p.id})">🗑️</button></td></tr>`).join(''):'<tr class="empty-row"><td colspan="8">No purchases</td></tr>';}
  const payTb=document.querySelector('#supPayTable tbody');
  if(payTb){const pays=db.supPayments.filter(p=>p.supplierId===currentSupplierId).sort((a,b)=>new Date(b.date)-new Date(a.date));payTb.innerHTML=pays.length?pays.map(p=>`<tr><td>${fmtDate(p.date)}</td><td style="font-weight:700;color:var(--accent2)">${fmtLKR(p.amount)}</td><td>${p.method||'—'}</td><td>${p.ref||'—'}</td><td><button class="btn btn-danger btn-xs" onclick="deleteRecord('supPayments',${p.id})">🗑️</button></td></tr>`).join(''):'<tr class="empty-row"><td colspan="5">No payments</td></tr>';}
}
function openAddPurchaseModal(){setVal('purDate',today());['purInvoice','purItem','purQty','purUnit','purRate','purTotal'].forEach(id=>setVal(id,''));openModal('addPurchaseModal');}
function calcPurchase(){setVal('purTotal','LKR '+(numVal('purQty')*numVal('purRate')).toFixed(2));}
function savePurchase(){
  const date=strVal('purDate'),item=strVal('purItem'),qty=numVal('purQty'),rate=numVal('purRate'),unit=strVal('purUnit')||'Unit';
  if(!date||!item||!qty||!rate){showToast('Fill all required fields','error');return;}
  const sup=db.suppliers.find(s=>s.id===currentSupplierId);
  db.supPurchases.push({id:uid(),supplierId:currentSupplierId,date,invoiceNo:strVal('purInvoice'),item,qty,unit,rate,total:qty*rate});
  if(sup&&sup.type==='Fabric'){const ex=db.inventory.fabric.find(f=>f.type===item);if(ex){ex.qty+=qty;ex.costPerUnit=rate;ex.lastUpdated=date;}else db.inventory.fabric.push({id:uid(),type:item,supplierId:currentSupplierId,qty,costPerUnit:rate,lastUpdated:date});}
  else if(sup&&sup.type==='Accessories'){const ex=db.inventory.accessories.find(a=>a.item===item);if(ex){ex.qty+=qty;ex.costPerUnit=rate;}else db.inventory.accessories.push({id:uid(),item,type:sup.items||'Accessory',supplierId:currentSupplierId,qty,unit,costPerUnit:rate});}
  closeModal('addPurchaseModal'); renderSupplierDetail(); updateSupplierKPIs(); renderInventory(); saveDB(); showToast('Purchase saved & inventory updated');
}
function openSupPaymentModal(){setVal('supPayDate',today());['supPayAmt','supPayRef','supPayMethod'].forEach(id=>setVal(id,''));document.querySelectorAll('#supPayPills .pay-pill').forEach(p=>p.classList.remove('active'));openModal('supPaymentModal');}
function selectSupPayPill(el,val){document.querySelectorAll('#supPayPills .pay-pill').forEach(p=>p.classList.remove('active'));el.classList.add('active');setVal('supPayMethod',val);}
function saveSupplierPayment(){
  const date=strVal('supPayDate'),amt=numVal('supPayAmt');
  if(!date||!amt){showToast('Date and amount required','error');return;}
  db.supPayments.push({id:uid(),supplierId:currentSupplierId,date,amount:amt,method:strVal('supPayMethod'),ref:strVal('supPayRef')});
  closeModal('supPaymentModal'); renderSupplierDetail(); updateSupplierKPIs(); saveDB(); showToast('Payment recorded');
}
function printSupplierStatement(){
  const sup=db.suppliers.find(s=>s.id===currentSupplierId); if(!sup) return;
  showToast('Generating supplier statement…');
  setTimeout(()=>{
    const {jsPDF}=window.jspdf;const doc=new jsPDF();const b=getSupplierBalance(currentSupplierId);
    doc.setFontSize(16);doc.setTextColor(37,99,235);doc.text('Supplier Statement',14,18);
    doc.setFontSize(10);doc.setTextColor(90);doc.text('Supplier: '+sup.name+' | Type: '+sup.type,14,26);doc.text('Generated: '+new Date().toLocaleString(),14,32);
    const purs=db.supPurchases.filter(p=>p.supplierId===currentSupplierId);
    doc.autoTable({startY:40,head:[['Date','Invoice','Item','Qty','Rate','Total']],
      body:purs.map(p=>[fmtDate(p.date),p.invoiceNo||'—',p.item,p.qty,'LKR '+p.rate.toFixed(2),'LKR '+p.total.toFixed(2)]),
      foot:[['','','Total Purchases:','','','LKR '+b.purchases.toFixed(2)],['','','Total Paid:','','','LKR '+b.paid.toFixed(2)],['','','Balance:','','','LKR '+b.balance.toFixed(2)]],
      headStyles:{fillColor:[30,58,138]},footStyles:{fontStyle:'bold',fillColor:[240,245,255]}});
    doc.save('Supplier_'+sup.name+'_Statement_'+today()+'.pdf'); showToast('Statement downloaded');
  },100);
}
function exportSuppliersPDF(){showToast('Generating PDF…');setTimeout(()=>{const{jsPDF}=window.jspdf;const doc=new jsPDF();doc.setFontSize(16);doc.setTextColor(37,99,235);doc.text('Suppliers Report',14,18);doc.setFontSize(9);doc.setTextColor(90);doc.text('Fuji San Lanka Pvt Ltd | '+new Date().toLocaleString(),14,26);doc.autoTable({startY:32,head:[['#','Name','Type','Items','Purchases','Paid','Payable']],body:db.suppliers.map((s,i)=>{const b=getSupplierBalance(s.id);return[i+1,s.name,s.type,s.items||'—','LKR '+b.purchases.toFixed(2),'LKR '+b.paid.toFixed(2),'LKR '+b.balance.toFixed(2)];}),headStyles:{fillColor:[30,58,138]}});doc.save('Suppliers_Report_'+today()+'.pdf');showToast('Suppliers PDF downloaded');},100);}
function exportSuppliersExcel(){const wb=XLSX.utils.book_new();const data=[['Name','Type','Items','Total Purchases','Paid','Payable'],...db.suppliers.map(s=>{const b=getSupplierBalance(s.id);return[s.name,s.type,s.items||'',b.purchases,b.paid,b.balance];})];XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(data),'Suppliers');XLSX.writeFile(wb,'Suppliers_Report_'+today()+'.xlsx');showToast('Excel exported');}

// ===================== INVENTORY =====================
function renderInventory(){
  const fv=db.inventory.fabric.reduce((s,i)=>s+(i.qty*(i.costPerUnit||0)),0);
  const av=db.inventory.accessories.reduce((s,i)=>s+(i.qty*(i.costPerUnit||0)),0);
  const fnv=db.inventory.finished.reduce((s,i)=>s+(i.qty*(i.costPerUnit||0)),0);
  const rv=db.inventory.returned.reduce((s,i)=>s+(i.value||0),0);
  setText('inv-fabric-val',fmtLKR(fv)); setText('inv-acc-val',fmtLKR(av));
  setText('inv-finished-val',fmtLKR(fnv)); setText('inv-returned-val',fmtLKR(rv));
  const fabTb=document.querySelector('#invFabricTable tbody');
  if(fabTb) fabTb.innerHTML=db.inventory.fabric.length?db.inventory.fabric.map(i=>{const sup=db.suppliers.find(s=>s.id===i.supplierId);return`<tr><td style="font-weight:700">${i.type}</td><td>${sup?sup.name:'—'}</td><td style="font-weight:700;color:var(--accent)">${(i.qty||0).toFixed(2)} KG</td><td>LKR ${(i.costPerUnit||0).toFixed(2)}</td><td style="font-weight:700">${fmtLKR(i.qty*(i.costPerUnit||0))}</td><td>${fmtDate(i.lastUpdated)}</td></tr>`}).join(''):'<tr class="empty-row"><td colspan="6">No fabric — add purchases via Suppliers</td></tr>';
  const accTb=document.querySelector('#invAccTable tbody');
  if(accTb) accTb.innerHTML=db.inventory.accessories.length?db.inventory.accessories.map(i=>{const sup=db.suppliers.find(s=>s.id===i.supplierId);return`<tr><td style="font-weight:700">${i.item}</td><td>${i.type}</td><td>${sup?sup.name:'—'}</td><td style="font-weight:700;color:var(--accent)">${i.qty}</td><td>${i.unit||'Unit'}</td><td>LKR ${(i.costPerUnit||0).toFixed(2)}</td><td style="font-weight:700">${fmtLKR(i.qty*(i.costPerUnit||0))}</td></tr>`}).join(''):'<tr class="empty-row"><td colspan="7">No accessories</td></tr>';
  const finTb=document.querySelector('#invFinishedTable tbody');
  if(finTb) finTb.innerHTML=db.inventory.finished.length?db.inventory.finished.map(i=>`<tr><td style="font-weight:700">${i.product}</td><td style="color:var(--accent);font-weight:600">${i.batchId}</td><td style="font-weight:700">${i.qty}</td><td>LKR ${(i.costPerUnit||0).toFixed(2)}</td><td style="font-weight:700">${fmtLKR(i.qty*(i.costPerUnit||0))}</td><td>${fmtDate(i.date)}</td></tr>`).join(''):'<tr class="empty-row"><td colspan="6">No finished goods</td></tr>';
  const retTb=document.querySelector('#invReturnedTable tbody');
  if(retTb) retTb.innerHTML=db.inventory.returned.length?db.inventory.returned.map(i=>{const cust=db.customers.find(c=>c.id===i.customerId);return`<tr><td>${i.product}</td><td>${cust?cust.name:'—'}</td><td>${fmtDate(i.date)}</td><td>${i.qty}</td><td>Returned</td><td>${fmtLKR(i.value)}</td><td><span class="badge ${i.status==='Resold'?'badge-completed':'badge-pending'}">${i.status||'In Stock'}</span></td><td>${i.status!=='Resold'?`<button class="btn btn-success btn-xs" onclick="resellItem(${i.id})">↩️ Resell</button>`:''}</td></tr>`}).join(''):'<tr class="empty-row"><td colspan="8">No returned goods</td></tr>';
}
function resellItem(id){const item=db.inventory.returned.find(i=>i.id===id);if(item){item.status='Resold';renderInventory();saveDB();showToast('Item marked as resold');}}

// ===================== PRODUCTION =====================
function calcBatch(){
  const costs=['batchFabric','batchAcc','batchSG','batchPrint','batchEmbr','batchTransport','batchOther'].reduce((s,id)=>s+numVal(id),0);
  const qty=numVal('batchQty');
  setText('batchTotalCost',costs.toFixed(2));
  setText('batchCostPerUnit',qty>0?(costs/qty).toFixed(2):'0.00');
  setText('batchCostPerDozen',qty>0?((costs/qty)*12).toFixed(2):'0.00');
}
function openAddBatchModal(){
  setVal('batchId',nextBatchId()); setVal('batchDate',today()); setVal('batchStatus','In Progress');
  ['batchProduct','batchQty','batchFabric','batchAcc','batchSG','batchPrint','batchEmbr','batchTransport','batchOther'].forEach(id=>setVal(id,''));
  calcBatch(); openModal('addBatchModal');
}
function saveBatch(){
  const date=strVal('batchDate'),product=strVal('batchProduct'),qty=numVal('batchQty');
  if(!date||!product||!qty){showToast('Fill required fields','error');return;}
  const f=numVal('batchFabric'),a=numVal('batchAcc'),sg=numVal('batchSG'),p=numVal('batchPrint'),e=numVal('batchEmbr'),t=numVal('batchTransport'),o=numVal('batchOther');
  const totalCost=f+a+sg+p+e+t+o;
  const batchId=strVal('batchId')||nextBatchId();
  const batch={id:uid(),batchId,date,product,qty,fabricCost:f,accCost:a,sgCost:sg,printCost:p,embrCost:e,transportCost:t,otherCost:o,totalCost,costPerUnit:qty>0?totalCost/qty:0,status:strVal('batchStatus')};
  db.production.push(batch);
  db.inventory.finished.push({id:uid(),product,batchId,qty,costPerUnit:batch.costPerUnit,date});
  closeModal('addBatchModal'); renderProduction(); renderInventory(); saveDB(); showToast('Batch '+batchId+' created');
}
function renderProduction(){
  const tc=db.production.reduce((s,b)=>s+(b.totalCost||0),0);
  const tq=db.production.reduce((s,b)=>s+(b.qty||0),0);
  const tr=db.custInvoices.reduce((s,i)=>s+(i.total||0),0);
  setText('prod-total-cost',fmtLKR(tc)); setText('prod-total-revenue',fmtLKR(tr));
  setText('prod-cost-per-unit',tq>0?fmtLKR(tc/tq):'LKR 0');
  setText('prod-batches',db.production.length); setText('prod-total-qty',tq);
  const tb=document.querySelector('#productionTable tbody'); if(!tb) return; tb.innerHTML='';
  if(!db.production.length){tb.innerHTML='<tr class="empty-row"><td colspan="14">No batches — create one above</td></tr>';return;}
  [...db.production].sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(b=>{
    const tr2=tb.insertRow();
    const sc=b.status==='Completed'?'badge-completed':'badge-inprogress';
    tr2.innerHTML=`<td style="font-weight:700;color:var(--accent)">${b.batchId}</td><td style="font-weight:600">${b.product}</td><td>${fmtDate(b.date)}</td><td><strong>${b.qty}</strong></td><td>${fmtLKR(b.fabricCost)}</td><td>${fmtLKR(b.accCost)}</td><td>${fmtLKR(b.sgCost)}</td><td>${fmtLKR((b.printCost||0)+(b.embrCost||0))}</td><td>${fmtLKR(b.transportCost)}</td><td>${fmtLKR(b.otherCost)}</td><td style="font-weight:700">${fmtLKR(b.totalCost)}</td><td style="font-weight:700;color:var(--accent2)">${fmtLKR(b.costPerUnit)}</td><td><span class="badge ${sc}">${b.status}</span></td><td><div class="action-cell"><button class="btn btn-pdf btn-xs" onclick="printBatchPDF(${b.id})">🖨️</button><button class="btn btn-danger btn-xs" onclick="deleteRecord('production',${b.id})">🗑️</button></div></td>`;
  });
}
function printBatchPDF(id){
  const b=db.production.find(x=>x.id===id); if(!b) return;
  showToast('Generating batch PDF…');
  setTimeout(()=>{
    const {jsPDF}=window.jspdf;const doc=new jsPDF();
    doc.setFontSize(16);doc.setTextColor(37,99,235);doc.text('Production Batch Report',14,18);
    doc.setFontSize(10);doc.setTextColor(90);doc.text('Batch ID: '+b.batchId+' | Product: '+b.product,14,26);doc.text('Date: '+fmtDate(b.date)+' | Status: '+b.status,14,32);
    doc.autoTable({startY:40,head:[['Cost Component','Amount']],
      body:[['Fabric Cost','LKR '+b.fabricCost.toFixed(2)],['Accessories Cost','LKR '+b.accCost.toFixed(2)],['Sub-Garment Cost','LKR '+b.sgCost.toFixed(2)],['Print/Embroidery','LKR '+((b.printCost||0)+(b.embrCost||0)).toFixed(2)],['Transport','LKR '+b.transportCost.toFixed(2)],['Other','LKR '+b.otherCost.toFixed(2)]],
      foot:[['TOTAL COST','LKR '+b.totalCost.toFixed(2)],['QTY PRODUCED',b.qty+' units'],['COST PER UNIT','LKR '+b.costPerUnit.toFixed(2)],['COST PER DOZEN','LKR '+(b.costPerUnit*12).toFixed(2)]],
      headStyles:{fillColor:[30,58,138]},footStyles:{fontStyle:'bold',fillColor:[240,245,255]}});
    doc.save('Batch_'+b.batchId+'_Report.pdf'); showToast('Batch PDF downloaded');
  },100);
}
function exportProductionPDF(){showToast('Generating…');setTimeout(()=>{const{jsPDF}=window.jspdf;const doc=new jsPDF('l');doc.setFontSize(14);doc.setTextColor(37,99,235);doc.text('Production Report',14,18);doc.setFontSize(9);doc.setTextColor(90);doc.text('Fuji San Lanka Pvt Ltd | '+new Date().toLocaleString(),14,25);doc.autoTable({startY:32,head:[['Batch ID','Product','Date','Qty','Fabric','Acc','SG','Print/Emb','Transport','Other','Total','Cost/Unit','Status']],body:db.production.map(b=>[b.batchId,b.product,fmtDate(b.date),b.qty,'LKR '+b.fabricCost.toFixed(2),'LKR '+b.accCost.toFixed(2),'LKR '+b.sgCost.toFixed(2),'LKR '+((b.printCost||0)+(b.embrCost||0)).toFixed(2),'LKR '+b.transportCost.toFixed(2),'LKR '+b.otherCost.toFixed(2),'LKR '+b.totalCost.toFixed(2),'LKR '+b.costPerUnit.toFixed(2),b.status]),headStyles:{fillColor:[30,58,138],fontSize:8},bodyStyles:{fontSize:8}});doc.save('Production_Report_'+today()+'.pdf');showToast('Production PDF downloaded');},100);}
function exportProductionExcel(){const wb=XLSX.utils.book_new();const data=[['Batch ID','Product','Date','Qty','Fabric','Acc','SG','Print/Emb','Transport','Other','Total Cost','Cost/Unit','Status'],...db.production.map(b=>[b.batchId,b.product,b.date,b.qty,b.fabricCost,b.accCost,b.sgCost,(b.printCost||0)+(b.embrCost||0),b.transportCost,b.otherCost,b.totalCost,b.costPerUnit,b.status])];XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(data),'Production');XLSX.writeFile(wb,'Production_Report_'+today()+'.xlsx');showToast('Excel exported');}

// ===================== EXPENSES =====================
function renderExpCatOptions(){
  const sel=document.getElementById('expCat'); if(!sel) return;
  const cur=sel.value;
  sel.innerHTML='<option value="">— Select —</option>'+(db.settings.expCategories||[]).map(c=>`<option value="${c}">${c}</option>`).join('');
  if(cur) sel.value=cur;
}
function openAddExpenseModal_Fn(){
  setVal('expDate',today());['expAmount','expDesc','expBatchId'].forEach(id=>setVal(id,''));
  setVal('expCat','');setVal('expType','');renderExpCatOptions();openModal('addExpenseModal');
}
function saveExpense(){
  const date=strVal('expDate'),cat=strVal('expCat'),type=strVal('expType'),amt=numVal('expAmount');
  if(!date||!cat||!type||!amt){showToast('Fill all required fields','error');return;}
  db.expenses.push({id:uid(),date,category:cat,type,amount:amt,description:strVal('expDesc'),batchId:strVal('expBatchId')});
  closeModal('addExpenseModal'); renderExpenses(); saveDB(); showToast('Expense recorded');
}
function renderExpenses(){
  const total=db.expenses.reduce((s,e)=>s+(e.amount||0),0);
  const byc={};(db.settings.expCategories||[]).forEach(c=>byc[c]=0);
  db.expenses.forEach(e=>{byc[e.category]=(byc[e.category]||0)+e.amount;});
  setText('exp-total',fmtLKR(total)); setText('exp-transport',fmtLKR(byc['Transportation']||0));
  setText('exp-electricity',fmtLKR(byc['Electricity']||0));
  setText('exp-other',fmtLKR(Math.max(0,total-(byc['Transportation']||0)-(byc['Electricity']||0))));
  const tb=document.querySelector('#expensesTable tbody'); if(!tb) return; tb.innerHTML='';
  if(!db.expenses.length){tb.innerHTML='<tr class="empty-row"><td colspan="7">No expenses yet</td></tr>';return;}
  [...db.expenses].sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(e=>{
    const tr=tb.insertRow();
    tr.innerHTML=`<td>${fmtDate(e.date)}</td><td><span class="badge badge-inprogress">${e.category}</span></td><td><span class="badge ${e.type==='Operational'?'badge-pending':'badge-completed'}">${e.type}</span></td><td style="font-weight:700;color:var(--accent4)">${fmtLKR(e.amount)}</td><td>${e.description||'—'}</td><td style="color:var(--accent);font-weight:600">${e.batchId||'—'}</td><td><button class="btn btn-danger btn-xs" onclick="deleteRecord('expenses',${e.id})">🗑️</button></td>`;
  });
}
function exportExpensesPDF(){showToast('Generating PDF…');setTimeout(()=>{const{jsPDF}=window.jspdf;const doc=new jsPDF();doc.setFontSize(16);doc.setTextColor(37,99,235);doc.text('Expenses Report',14,18);doc.setFontSize(9);doc.setTextColor(90);doc.text('Fuji San Lanka Pvt Ltd | '+new Date().toLocaleString(),14,26);const total=db.expenses.reduce((s,e)=>s+(e.amount||0),0);doc.autoTable({startY:32,head:[['Date','Category','Type','Amount','Description','Batch ID']],body:[...db.expenses].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(e=>[fmtDate(e.date),e.category,e.type,'LKR '+e.amount.toFixed(2),e.description||'—',e.batchId||'—']),foot:[['','','TOTAL:','LKR '+total.toFixed(2),'','']],headStyles:{fillColor:[30,58,138]},footStyles:{fontStyle:'bold',fillColor:[240,245,255]}});doc.save('Expenses_Report_'+today()+'.pdf');showToast('Expenses PDF downloaded');},100);}
function exportExpensesExcel(){const wb=XLSX.utils.book_new();const data=[['Date','Category','Type','Amount','Description','Production ID'],...db.expenses.map(e=>[e.date,e.category,e.type,e.amount,e.description||'',e.batchId||''])];XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(data),'Expenses');XLSX.writeFile(wb,'Expenses_Report_'+today()+'.xlsx');showToast('Excel exported');}

// ===================== CHEQUES =====================
function saveCheque(){
  const type=strVal('chqType'),no=strVal('chqNo'),party=strVal('chqParty'),bank=strVal('chqBank');
  const amt=numVal('chqAmount'),issueDate=strVal('chqIssueDate'),dueDate=strVal('chqDueDate');
  if(!type||!no||!party||!amt||!issueDate||!dueDate){showToast('Fill all required fields','error');return;}
  db.cheques.push({id:uid(),type,chequeNo:no,party,bank,amount:amt,issueDate,dueDate,status:'Pending'});
  ['chqType','chqNo','chqParty','chqBank','chqAmount','chqIssueDate','chqDueDate'].forEach(id=>setVal(id,''));
  closeModal('addChequeModal'); renderCheques(); saveDB(); showToast('Cheque recorded');
}
function updateChequeStatus(id,status){const c=db.cheques.find(x=>x.id===id);if(c){c.status=status;renderCheques();saveDB();showToast('Cheque marked as '+status);}}
function renderCheques(){
  const received=db.cheques.filter(c=>c.type==='Received');
  const issued=db.cheques.filter(c=>c.type==='Issued');
  setText('chq-received-total',fmtLKR(received.reduce((s,c)=>s+(c.amount||0),0)));
  setText('chq-issued-total',fmtLKR(issued.reduce((s,c)=>s+(c.amount||0),0)));
  setText('chq-pending',db.cheques.filter(c=>c.status==='Pending').length);
  setText('chq-bounced',db.cheques.filter(c=>c.status==='Bounced').length);
  const now=new Date();
  const makeRow=c=>{
    const overdue=c.status==='Pending'&&new Date(c.dueDate)<now;
    const sc=c.status==='Cleared'?'badge-cleared':c.status==='Bounced'?'badge-bounced':'badge-pending';
    return`<tr><td style="font-weight:700">${c.chequeNo}</td><td>${c.party}</td><td>${c.bank||'—'}</td><td style="font-weight:700">${fmtLKR(c.amount)}</td><td>${fmtDate(c.issueDate)}</td><td style="color:${overdue?'var(--accent4)':'inherit'};font-weight:${overdue?'700':'400'}">${fmtDate(c.dueDate)}${overdue?' ⚠️':''}</td><td><span class="badge ${sc}">${c.status}</span></td><td><div class="action-cell">${c.status==='Pending'?`<button class="btn btn-success btn-xs" onclick="updateChequeStatus(${c.id},'Cleared')">✓ Clear</button><button class="btn btn-danger btn-xs" onclick="updateChequeStatus(${c.id},'Bounced')">✗ Bounce</button>`:''}<button class="btn btn-danger btn-xs" onclick="deleteRecord('cheques',${c.id})">🗑️</button></div></td></tr>`;
  };
  const rTb=document.querySelector('#chqReceivedTable tbody');
  if(rTb) rTb.innerHTML=received.length?[...received].sort((a,b)=>new Date(b.dueDate)-new Date(a.dueDate)).map(makeRow).join(''):'<tr class="empty-row"><td colspan="8">No received cheques</td></tr>';
  const iTb=document.querySelector('#chqIssuedTable tbody');
  if(iTb) iTb.innerHTML=issued.length?[...issued].sort((a,b)=>new Date(b.dueDate)-new Date(a.dueDate)).map(makeRow).join(''):'<tr class="empty-row"><td colspan="8">No issued cheques</td></tr>';
}
function exportChequesPDF(){showToast('Generating PDF…');setTimeout(()=>{const{jsPDF}=window.jspdf;const doc=new jsPDF();doc.setFontSize(16);doc.setTextColor(37,99,235);doc.text('Cheque Tracker Report',14,18);doc.setFontSize(9);doc.setTextColor(90);doc.text('Fuji San Lanka Pvt Ltd | '+new Date().toLocaleString(),14,26);doc.autoTable({startY:32,head:[['Type','Cheque No.','Party','Bank','Amount','Issue Date','Due Date','Status']],body:db.cheques.map(c=>[c.type,c.chequeNo,c.party,c.bank||'—','LKR '+c.amount.toFixed(2),fmtDate(c.issueDate),fmtDate(c.dueDate),c.status]),headStyles:{fillColor:[30,58,138]}});doc.save('Cheques_Report_'+today()+'.pdf');showToast('Cheques PDF downloaded');},100);}
function exportChequesExcel(){const wb=XLSX.utils.book_new();const data=[['Type','Cheque No.','Party','Bank','Amount','Issue Date','Due Date','Status'],...db.cheques.map(c=>[c.type,c.chequeNo,c.party,c.bank||'',c.amount,c.issueDate,c.dueDate,c.status])];XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(data),'Cheques');XLSX.writeFile(wb,'Cheques_Report_'+today()+'.xlsx');showToast('Excel exported');}

// ===================== STAFF =====================
function saveStaff(){
  const name=strVal('staffName'),desig=strVal('staffDesig'),salary=numVal('staffSalary');
  if(!name||!desig||!salary){showToast('Name, designation & salary required','error');return;}
  db.staff.push({id:uid(),name,designation:desig,salary,contact:strVal('staffContact'),joinDate:strVal('staffJoinDate'),active:true});
  ['staffName','staffDesig','staffSalary','staffContact','staffJoinDate'].forEach(id=>setVal(id,''));
  closeModal('addStaffModal'); renderStaff(); saveDB(); showToast('Staff member "'+name+'" added');
}
function openPaySalaryModal(id){
  const s=db.staff.find(x=>x.id===id); if(!s) return;
  setVal('paySalaryStaffId',id); setVal('paySalaryStaffName',s.name);
  setVal('paySalaryAmt',s.salary); setVal('paySalaryDate',today());
  const now=new Date(); setVal('paySalaryMonth',now.getMonth()+1); setVal('paySalaryYear',now.getFullYear());
  openModal('paySalaryModal');
}
function saveSalaryPayment(){
  const staffId=parseInt(strVal('paySalaryStaffId')),month=parseInt(strVal('paySalaryMonth'));
  const year=parseInt(strVal('paySalaryYear')),amt=numVal('paySalaryAmt'),date=strVal('paySalaryDate'),method=strVal('paySalaryMethod');
  if(!month||!year||!amt||!date){showToast('Fill all fields','error');return;}
  db.salaries.push({id:uid(),staffId,month,year,amount:amt,date,method});
  closeModal('paySalaryModal'); renderStaff(); saveDB(); showToast('Salary payment recorded');
}
function saveSalaryAndPrint(){
  const staffId=parseInt(strVal('paySalaryStaffId')),month=parseInt(strVal('paySalaryMonth'));
  const year=parseInt(strVal('paySalaryYear')),amt=numVal('paySalaryAmt'),date=strVal('paySalaryDate'),method=strVal('paySalaryMethod');
  if(!month||!year||!amt||!date){showToast('Fill all fields','error');return;}
  db.salaries.push({id:uid(),staffId,month,year,amount:amt,date,method});
  closeModal('paySalaryModal'); renderStaff(); saveDB();
  printSalarySlipPDF(staffId,month,year,amt,date,method);
}
function printSalarySlipPDF(staffId,month,year,amt,date,method){
  const s=db.staff.find(m=>m.id===staffId);
  const months=['','January','February','March','April','May','June','July','August','September','October','November','December'];
  if(!s) return;
  showToast('Generating salary slip…');
  setTimeout(()=>{
    const {jsPDF}=window.jspdf;const doc=new jsPDF();
    doc.setFontSize(20);doc.setTextColor(37,99,235);doc.text('SALARY SLIP',14,20);
    doc.setFontSize(10);doc.setTextColor(90);
    doc.text('Fuji San Lanka Pvt Ltd — Hummingbird Clothing',14,30);
    doc.text('Employee: '+s.name,14,40);doc.text('Designation: '+s.designation,14,48);doc.text('Month: '+months[month]+' '+year,14,56);
    doc.autoTable({startY:64,head:[['Description','Amount']],
      body:[['Basic Salary','LKR '+amt.toFixed(2)],['Payment Method',method||'Cash'],['Payment Date',fmtDate(date)]],
      foot:[['NET SALARY PAID','LKR '+amt.toFixed(2)]],
      headStyles:{fillColor:[30,58,138]},footStyles:{fontStyle:'bold',fillColor:[240,245,255]}});
    const fy=doc.lastAutoTable.finalY+30;
    doc.text('Signature: ________________',14,fy); doc.text('Date: ________________',120,fy);
    doc.save('SalarySlip_'+s.name+'_'+months[month]+'_'+year+'.pdf'); showToast('Salary slip downloaded');
  },100);
}
function renderStaff(){
  const ts=db.staff.reduce((s,m)=>s+(m.salary||0),0);
  const now=new Date();const tm=now.getMonth()+1;const ty=now.getFullYear();
  const paidTM=db.salaries.filter(s=>s.month===tm&&s.year===ty).reduce((t,s)=>t+(s.amount||0),0);
  setText('staff-count',db.staff.length); setText('staff-total-salary',fmtLKR(ts));
  setText('staff-due',fmtLKR(Math.max(0,ts-paidTM))); setText('staff-paid-month',fmtLKR(paidTM));
  const tb=document.querySelector('#staffTable tbody');
  if(tb){tb.innerHTML='';if(!db.staff.length){tb.innerHTML='<tr class="empty-row"><td colspan="7">No staff added yet</td></tr>';}else db.staff.forEach((s,i)=>{const lp=db.salaries.filter(p=>p.staffId===s.id).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];const tr=tb.insertRow();tr.innerHTML=`<td>${i+1}</td><td style="font-weight:700">${s.name}</td><td>${s.designation}</td><td style="font-weight:700">${fmtLKR(s.salary)}</td><td>${lp?fmtDate(lp.date):'Never paid'}</td><td><span class="badge badge-completed">Active</span></td><td><div class="action-cell"><button class="btn btn-success btn-xs" onclick="openPaySalaryModal(${s.id})">💵 Pay</button><button class="btn btn-danger btn-xs" onclick="deleteRecord('staff',${s.id})">🗑️</button></div></td>`;});}
  const salTb=document.querySelector('#salaryTable tbody');
  if(salTb){salTb.innerHTML='';const months=['','January','February','March','April','May','June','July','August','September','October','November','December'];const sorted=[...db.salaries].sort((a,b)=>new Date(b.date)-new Date(a.date));if(!sorted.length){salTb.innerHTML='<tr class="empty-row"><td colspan="7">No salary records yet</td></tr>';}else sorted.forEach(s=>{const stf=db.staff.find(m=>m.id===s.staffId);const tr=salTb.insertRow();tr.innerHTML=`<td style="font-weight:700">${stf?stf.name:'—'}</td><td>${months[s.month]||s.month}</td><td>${s.year}</td><td style="font-weight:700;color:var(--accent2)">${fmtLKR(s.amount)}</td><td>${fmtDate(s.date)}</td><td>${s.method||'—'}</td><td><div class="action-cell"><button class="btn btn-pdf btn-xs" onclick="printSalarySlipPDF(${s.staffId},${s.month},${s.year},${s.amount},'${s.date}','${s.method||'Cash'}')">🖨️</button><button class="btn btn-danger btn-xs" onclick="deleteRecord('salaries',${s.id})">🗑️</button></div></td>`;});}
}
function exportStaffPDF(){showToast('Generating PDF…');setTimeout(()=>{const{jsPDF}=window.jspdf;const doc=new jsPDF();doc.setFontSize(16);doc.setTextColor(37,99,235);doc.text('Staff Report',14,18);doc.setFontSize(9);doc.setTextColor(90);doc.text('Fuji San Lanka Pvt Ltd | '+new Date().toLocaleString(),14,26);doc.autoTable({startY:32,head:[['#','Name','Designation','Monthly Salary','Contact','Join Date']],body:db.staff.map((s,i)=>[i+1,s.name,s.designation,'LKR '+s.salary.toFixed(2),s.contact||'—',fmtDate(s.joinDate)]),headStyles:{fillColor:[30,58,138]}});doc.save('Staff_Report_'+today()+'.pdf');showToast('Staff PDF downloaded');},100);}
function exportStaffExcel(){const wb=XLSX.utils.book_new();const data=[['Name','Designation','Monthly Salary','Contact','Join Date','Status'],...db.staff.map(s=>[s.name,s.designation,s.salary,s.contact||'',s.joinDate||'','Active'])];XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(data),'Staff');XLSX.writeFile(wb,'Staff_Report_'+today()+'.xlsx');showToast('Excel exported');}

// ===================== REPORTS =====================
function setReportRange(val){
  const now=new Date(); let from='',to=today();
  if(val==='today'){from=to;}
  else if(val==='week'){const d=new Date(now);d.setDate(d.getDate()-d.getDay());from=d.toISOString().split('T')[0];}
  else if(val==='month'){from=new Date(now.getFullYear(),now.getMonth(),1).toISOString().split('T')[0];}
  else if(val==='year'){from=new Date(now.getFullYear(),0,1).toISOString().split('T')[0];}
  else if(val==='all'){from='2000-01-01';}
  setVal('rptFrom',from); setVal('rptTo',to); generateReport();
}
function filterByDate(arr,field,from,to){
  return arr.filter(e=>{const d=new Date(e[field]);if(from&&d<new Date(from))return false;if(to&&d>new Date(to+'T23:59:59'))return false;return true;});
}
function generateReport(){
  const from=strVal('rptFrom'),to=strVal('rptTo');
  const invs=filterByDate(db.custInvoices,'date',from,to);
  const exps=filterByDate(db.expenses,'date',from,to);
  const prods=filterByDate(db.production,'date',from,to);
  const ts=invs.reduce((s,i)=>s+(i.total||0),0);
  const tpc=prods.reduce((s,b)=>s+(b.totalCost||0),0);
  const te=exps.reduce((s,e)=>s+(e.amount||0),0);
  const gp=ts-tpc,np=gp-te;
  setText('rpt-sales',fmtLKR(ts)); setText('rpt-gp',fmtLKR(gp));
  setText('rpt-exp',fmtLKR(te)); setText('rpt-np',fmtLKR(np));
  const npEl=document.getElementById('rpt-np'); if(npEl) npEl.style.color=np>=0?'var(--accent2)':'var(--accent4)';
  const expBycat={};exps.forEach(e=>{expBycat[e.category]=(expBycat[e.category]||0)+e.amount;});
  const expTb=document.querySelector('#rptExpTable tbody');
  if(expTb) expTb.innerHTML=Object.keys(expBycat).length?Object.entries(expBycat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td style="font-weight:600">${k}</td><td>${exps.filter(e=>e.category===k).length}</td><td style="font-weight:700;color:var(--accent4)">${fmtLKR(v)}</td></tr>`).join(''):'<tr class="empty-row"><td colspan="3">No expenses in range</td></tr>';
  const agentTb=document.querySelector('#rptAgentTable tbody');
  if(agentTb) agentTb.innerHTML=db.agents.map(a=>{const bills=db.finishing.filter(f=>f.agentId===a.id).reduce((s,f)=>s+(f.grossBill||0),0);const paid=db.sgLedger.filter(l=>l.agentId===a.id&&l.debit>0).reduce((s,l)=>s+(l.debit||0),0);const td=db.cutting.filter(c=>c.agentId===a.id).reduce((s,c)=>s+(c.expectedQty||0),0);return`<tr><td style="font-weight:700">${a.name}</td><td>${td}</td><td>${fmtLKR(bills)}</td><td style="color:var(--accent2)">${fmtLKR(paid)}</td><td style="color:${bills-paid>0?'var(--accent4)':'var(--accent2)'};font-weight:700">${fmtLKR(bills-paid)}</td></tr>`;}).join('')||'<tr class="empty-row"><td colspan="5">No agents</td></tr>';
  const prodTb=document.querySelector('#rptProdTable tbody');
  if(prodTb) prodTb.innerHTML=prods.length?prods.map(b=>`<tr><td style="color:var(--accent);font-weight:700">${b.batchId}</td><td>${b.product}</td><td>${b.qty}</td><td>${fmtLKR(b.totalCost)}</td><td style="font-weight:700">${fmtLKR(b.costPerUnit)}</td><td><span class="badge ${b.status==='Completed'?'badge-completed':'badge-inprogress'}">${b.status}</span></td></tr>`).join(''):'<tr class="empty-row"><td colspan="6">No production in range</td></tr>';
  const custTb=document.querySelector('#rptCustTable tbody');
  if(custTb) custTb.innerHTML=db.customers.length?[...db.customers].sort((a,b)=>getCustomerBalance(b.id).sales-getCustomerBalance(a.id).sales).map(c=>{const b=getCustomerBalance(c.id);return`<tr><td style="font-weight:700">${c.name}</td><td>${fmtLKR(b.sales)}</td><td style="color:var(--accent2)">${fmtLKR(b.paid)}</td><td style="color:${b.balance>0?'var(--accent4)':'var(--accent2)'};font-weight:700">${fmtLKR(b.balance)}</td></tr>`;}).join(''):'<tr class="empty-row"><td colspan="4">No customers</td></tr>';
  const supTb=document.querySelector('#rptSupTable tbody');
  if(supTb) supTb.innerHTML=db.suppliers.length?db.suppliers.map(s=>{const b=getSupplierBalance(s.id);return`<tr><td style="font-weight:700">${s.name}</td><td>${s.type}</td><td>${fmtLKR(b.purchases)}</td><td style="color:var(--accent2)">${fmtLKR(b.paid)}</td><td style="color:${b.balance>0?'var(--accent4)':'var(--accent2)'};font-weight:700">${fmtLKR(b.balance)}</td></tr>`;}).join(''):'<tr class="empty-row"><td colspan="5">No suppliers</td></tr>';
  const staffTb=document.querySelector('#rptStaffTable tbody');
  if(staffTb) staffTb.innerHTML=db.staff.length?db.staff.map(s=>{const paid=db.salaries.filter(sal=>sal.staffId===s.id).reduce((t,sal)=>t+(sal.amount||0),0);return`<tr><td style="font-weight:700">${s.name}</td><td>${s.designation}</td><td>${fmtLKR(s.salary)}</td><td style="color:var(--accent2);font-weight:700">${fmtLKR(paid)}</td></tr>`;}).join(''):'<tr class="empty-row"><td colspan="4">No staff</td></tr>';
}
function exportFullReportPDF(){
  showToast('Generating full report…');
  setTimeout(()=>{
    const from=strVal('rptFrom'),to=strVal('rptTo');
    const {jsPDF}=window.jspdf;const doc=new jsPDF();
    doc.setFontSize(18);doc.setTextColor(37,99,235);doc.text('HUMMINGBIRD ERP — FULL REPORT',14,18);
    doc.setFontSize(10);doc.setTextColor(90);doc.text('Fuji San Lanka Pvt Ltd | '+new Date().toLocaleString(),14,27);
    if(from||to) doc.text('Period: '+(from||'All time')+' to '+(to||'Now'),14,33);
    const ts=filterByDate(db.custInvoices,'date',from,to).reduce((s,i)=>s+(i.total||0),0);
    const tpc=filterByDate(db.production,'date',from,to).reduce((s,b)=>s+(b.totalCost||0),0);
    const te=filterByDate(db.expenses,'date',from,to).reduce((s,e)=>s+(e.amount||0),0);
    doc.autoTable({startY:40,head:[['Metric','Value']],body:[['Total Sales','LKR '+ts.toFixed(2)],['Total Production Cost','LKR '+tpc.toFixed(2)],['Gross Profit','LKR '+(ts-tpc).toFixed(2)],['Total Expenses','LKR '+te.toFixed(2)],['Net Profit','LKR '+(ts-tpc-te).toFixed(2)],['Total Customers',db.customers.length],['Total Suppliers',db.suppliers.length],['Total Staff',db.staff.length]],headStyles:{fillColor:[30,58,138]},alternateRowStyles:{fillColor:[245,248,255]}});
    let y=doc.lastAutoTable.finalY+10;
    doc.setFontSize(12);doc.setTextColor(37,99,235);doc.text('Customer Summary',14,y);y+=5;
    doc.autoTable({startY:y,head:[['Customer','Sales','Collected','Receivable']],body:db.customers.map(c=>{const b=getCustomerBalance(c.id);return[c.name,'LKR '+b.sales.toFixed(2),'LKR '+b.paid.toFixed(2),'LKR '+b.balance.toFixed(2)];}),headStyles:{fillColor:[5,80,50]},margin:{left:14,right:14}});
    y=doc.lastAutoTable.finalY+10;
    doc.setFontSize(12);doc.setTextColor(37,99,235);doc.text('Production Summary',14,y);y+=5;
    doc.autoTable({startY:y,head:[['Batch ID','Product','Qty','Total Cost','Cost/Unit','Status']],body:db.production.map(b=>[b.batchId,b.product,b.qty,'LKR '+b.totalCost.toFixed(2),'LKR '+b.costPerUnit.toFixed(2),b.status]),headStyles:{fillColor:[80,20,100]},margin:{left:14,right:14}});
    doc.save('HummingbirdERP_FullReport_'+today()+'.pdf'); showToast('Full report PDF downloaded');
  },100);
}
function exportReportExcel(){
  const from=strVal('rptFrom'),to=strVal('rptTo');
  const wb=XLSX.utils.book_new();
  const ts=filterByDate(db.custInvoices,'date',from,to).reduce((s,i)=>s+(i.total||0),0);
  const tpc=filterByDate(db.production,'date',from,to).reduce((s,b)=>s+(b.totalCost||0),0);
  const te=filterByDate(db.expenses,'date',from,to).reduce((s,e)=>s+(e.amount||0),0);
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Hummingbird ERP Report'],['Generated',new Date().toLocaleString()],['Period',(from||'All')+' to '+(to||'Now')],[''],['Total Sales',ts],['Production Cost',tpc],['Gross Profit',ts-tpc],['Total Expenses',te],['Net Profit',ts-tpc-te]]),'Summary');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Customer','Sales','Collected','Receivable'],...db.customers.map(c=>{const b=getCustomerBalance(c.id);return[c.name,b.sales,b.paid,b.balance];})]),'Customers');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Batch ID','Product','Date','Qty','Fabric','Acc','SG','Print/Emb','Transport','Other','Total','Cost/Unit','Status'],...db.production.map(b=>[b.batchId,b.product,b.date,b.qty,b.fabricCost,b.accCost,b.sgCost,(b.printCost||0)+(b.embrCost||0),b.transportCost,b.otherCost,b.totalCost,b.costPerUnit,b.status])]),'Production');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Date','Category','Type','Amount','Description'],...db.expenses.map(e=>[e.date,e.category,e.type,e.amount,e.description||''])]),'Expenses');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Name','Type','Items','Purchases','Paid','Payable'],...db.suppliers.map(s=>{const b=getSupplierBalance(s.id);return[s.name,s.type,s.items||'',b.purchases,b.paid,b.balance];})]),'Suppliers');
  XLSX.writeFile(wb,'HummingbirdERP_Report_'+today()+'.xlsx'); showToast('Full report Excel exported');
}

// ===================== SETTINGS =====================
function renderSettings(){
  setVal('settCompanyName',db.settings.company||'');setVal('settBrandName',db.settings.brand||'');
  setVal('settPhone',db.settings.phone||'');setVal('settAddress',db.settings.address||'');
  setText('lastBackupDate',db.settings.lastBackup?fmtDate(db.settings.lastBackup):'Never');
  renderExpCatList();
}
function saveSettings(){
  db.settings.company=strVal('settCompanyName');db.settings.brand=strVal('settBrandName');
  db.settings.phone=strVal('settPhone');db.settings.address=strVal('settAddress');
  saveDB(); showToast('Settings saved');
}
function renderExpCatList(){
  const c=document.getElementById('expCatList'); if(!c) return;
  c.innerHTML=(db.settings.expCategories||[]).map((cat,i)=>`<div style="display:inline-flex;align-items:center;gap:4px;background:var(--accent-light);color:var(--accent);border:1.5px solid rgba(37,99,235,0.25);border-radius:20px;padding:4px 12px;font-size:11.5px;font-weight:600;margin:2px">${cat}<button onclick="removeExpCat(${i})" style="background:none;border:none;cursor:pointer;color:var(--accent4);font-size:14px;line-height:1;padding:0 0 0 4px">×</button></div>`).join('');
}
function addExpenseCategory(){
  const v=strVal('newExpCat'); if(!v) return;
  if((db.settings.expCategories||[]).includes(v)){showToast('Category already exists','error');return;}
  if(!db.settings.expCategories) db.settings.expCategories=[];
  db.settings.expCategories.push(v); setVal('newExpCat','');
  renderExpCatList(); saveDB(); showToast('Category "'+v+'" added');
}
function removeExpCat(i){db.settings.expCategories.splice(i,1);renderExpCatList();saveDB();}

// ===================== BACKUP =====================
function backupExport(){
  db.settings.lastBackup=today();
  const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='HummingbirdERP_Backup_'+today()+'.json';a.click();URL.revokeObjectURL(a.href);
  saveDB(); showToast('Backup exported successfully');
}
function backupImportFn(input){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const imported=JSON.parse(e.target.result);
      if(!confirm('This will replace ALL current data with the backup. Continue?')) return;
      db=imported; saveDB(); location.reload();
    }catch(err){showToast('Invalid backup file','error');}
  };
  reader.readAsText(file);
}
function confirmReset(){
  if(!confirm('⚠️ RESET ALL DATA?\nThis permanently deletes everything!')) return;
  if(!confirm('FINAL CONFIRMATION: Are you sure?')) return;
  localStorage.removeItem(DB_KEY); location.reload();
}

// ===================== DELETE =====================
function deleteRecord(table,id){
  pendingDelete={table,id};
  setText('deleteConfirmMsg','Delete this record? This action cannot be undone.');
  openModal('deleteConfirmModal');
}
function executeDelete(){
  if(!pendingDelete) return;
  const {table,id}=pendingDelete;
  const actions={
    cutting:()=>{db.cutting=db.cutting.filter(e=>e.id!==id);renderCutTable();},
    finishing:()=>{db.finishing=db.finishing.filter(e=>e.id!==id);renderFinTable();sgRefresh();},
    sgLedger:()=>{db.sgLedger=db.sgLedger.filter(e=>e.id!==id);renderSGLedger();sgRefresh();},
    customers:()=>{db.customers=db.customers.filter(c=>c.id!==id);renderCustomerTable();},
    custInvoices:()=>{db.custInvoices=db.custInvoices.filter(i=>i.id!==id);renderCustomerDetail();updateCustomerKPIs();},
    custPayments:()=>{db.custPayments=db.custPayments.filter(p=>p.id!==id);renderCustomerDetail();updateCustomerKPIs();},
    custReturns:()=>{db.custReturns=db.custReturns.filter(r=>r.id!==id);renderCustomerDetail();},
    suppliers:()=>{db.suppliers=db.suppliers.filter(s=>s.id!==id);renderSupplierTables();},
    supPurchases:()=>{db.supPurchases=db.supPurchases.filter(p=>p.id!==id);renderSupplierDetail();updateSupplierKPIs();},
    supPayments:()=>{db.supPayments=db.supPayments.filter(p=>p.id!==id);renderSupplierDetail();updateSupplierKPIs();},
    production:()=>{db.production=db.production.filter(b=>b.id!==id);renderProduction();},
    expenses:()=>{db.expenses=db.expenses.filter(e=>e.id!==id);renderExpenses();},
    cheques:()=>{db.cheques=db.cheques.filter(c=>c.id!==id);renderCheques();},
    staff:()=>{db.staff=db.staff.filter(s=>s.id!==id);renderStaff();},
    salaries:()=>{db.salaries=db.salaries.filter(s=>s.id!==id);renderStaff();}
  };
  if(actions[table]) actions[table]();
  closeModal('deleteConfirmModal'); pendingDelete=null; saveDB(); showToast('Record deleted');
}

// ===================== INIT =====================
window.addEventListener('DOMContentLoaded',()=>{
  const msgs=['Loading database…','Initializing modules…','Applying theme…','System ready!'];
  let mi=0;
  const loadMsg=document.getElementById('loadMsg');
  const msgInterval=setInterval(()=>{if(loadMsg&&msgs[mi])loadMsg.textContent=msgs[mi++];if(mi>=msgs.length)clearInterval(msgInterval);},550);
  loadDB();
  if(db.settings?.theme==='dark') setTheme('dark');
  const updateTime=()=>{const d=new Date();const el=document.getElementById('liveDateBadge');if(el) el.textContent=d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'})+' · '+d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});};
  updateTime(); setInterval(updateTime,30000);
  setTimeout(()=>{navTo('dashboard',document.querySelector('.nav-item.active'));renderExpCatOptions();},100);
  setTimeout(()=>{const ls=document.getElementById('loadScreen');if(ls) ls.classList.add('hide');},2400);
});
window.onclick=e=>{if(e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');};
document.addEventListener('keydown',e=>{if(e.key==='Escape') document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));});
