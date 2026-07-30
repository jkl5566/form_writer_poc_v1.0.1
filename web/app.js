'use strict';

const App = {
  catalog: null,
  schema: null,
  record: null,
  saveTimer: null,
  installPrompt: null,
  signatureSlot: null,
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nowIso = () => new Date().toISOString();
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'rec_'+Date.now()+'_'+Math.random().toString(36).slice(2));
const clone = (o) => JSON.parse(JSON.stringify(o));

function toast(message) {
  const t = $('toast'); t.textContent = message; t.classList.add('show');
  clearTimeout(toast._timer); toast._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function addAudit(action, detail='') {
  App.record.audit ||= [];
  App.record.audit.push({ action, detail, at: nowIso() });
}

function signablePayload(record=App.record) {
  return {
    id: record.id, form_code: record.form_code, schema_version: record.schema_version,
    version: record.version, data: record.data, checklist: record.checklist,
    grids: record.grids, decisions: record.decisions, defect: record.defect,
  };
}

function isLocked() {
  return ['partially_signed','signed','superseded','void'].includes(App.record?.status);
}

function hasFailure() {
  if (!App.record) return false;
  for (const sec of Object.values(App.record.checklist || {}))
    for (const row of Object.values(sec || {})) if (row.result === 'fail') return true;
  for (const sec of Object.values(App.record.decisions || {}))
    for (const row of Object.values(sec || {})) if (row.result === 'no') return true;
  for (const rows of Object.values(App.record.grids || {}))
    for (const row of rows || []) if (row.result === 'fail') return true;
  return false;
}

function fieldDefault(field) {
  if (field.default === 'today') return new Date().toISOString().slice(0,10);
  if (field.default !== undefined) return field.default;
  return '';
}

function newRecord(schema) {
  const record = {
    id: uuid(), form_code: schema.form_code, schema_version: schema.schema_version,
    title: schema.title, version: 1, status: 'draft', sync_state: 'pending',
    data: {}, checklist: {}, grids: {}, decisions: {}, defect: {status:'',notes:'',review_date:'',reviewer:'',photos:[]},
    signatures: {}, audit: [], created_at: nowIso(), updated_at: nowIso(), parent_id: null,
  };
  for (const sec of schema.sections) {
    if (sec.type === 'fields') for (const f of sec.fields || []) record.data[f.key] = fieldDefault(f);
    if (sec.type === 'checklist') {
      record.checklist[sec.id] = {};
      for (const g of sec.groups || []) for (const item of g.items || [])
        record.checklist[sec.id][item.key] = {result:null,actual:'',note:'',auto_assessment:null,overridden:false};
    }
    if (sec.type === 'measurement_grid') {
      record.grids[sec.id] = [];
      for (let i=0;i<(sec.min_rows||1);i++) record.grids[sec.id].push(emptyGridRow(sec));
    }
    if (sec.type === 'decision_matrix') {
      record.decisions[sec.id] = {};
      for (const item of sec.items || []) record.decisions[sec.id][item.key] = {result:null, explanation:''};
    }
  }
  record.audit.push({action:'created',detail:'建立表單紀錄',at:nowIso()});
  applyComputed(record, schema);
  return record;
}

function emptyGridRow(sec) {
  const row = {_id:uuid()};
  for (const c of sec.columns || []) row[c.key] = '';
  return row;
}

function applyComputed(record=App.record, schema=App.schema) {
  for (const sec of schema.sections || []) if (sec.type === 'fields') {
    for (const f of sec.fields || []) if (f.computed) {
      const c=f.computed; let val='';
      if (c.op === 'multiply') {
        const nums=(c.args||[]).map(k=>parseFloat(record.data[k]));
        if (nums.every(Number.isFinite)) val=nums.reduce((a,b)=>a*b,1).toFixed(c.precision ?? 2);
      }
      record.data[f.key]=val;
    }
  }
}

function catalogEntry(code) { return App.catalog.forms.find(f => f.form_code === code); }
async function loadSchema(code) {
  const entry = catalogEntry(code); if (!entry) throw new Error('找不到表單目錄：'+code);
  const res = await fetch(entry.schema); if (!res.ok) throw new Error(`Schema 載入失敗 ${res.status}`);
  return res.json();
}

async function scheduleSave() {
  if (!App.record) return;
  App.record.sync_state = 'pending';
  $('savePill').classList.remove('hidden'); $('savePill').textContent='儲存中…'; $('savePill').className='pill warn';
  clearTimeout(App.saveTimer);
  App.saveTimer=setTimeout(async()=>{
    applyComputed(); recomputeStatus(); await Store.save(App.record);
    $('savePill').textContent='已存本機'; $('savePill').className='pill ok';
    await refreshStatus();
  },350);
}

async function refreshStatus() {
  const online=navigator.onLine;
  $('networkPill').textContent=online?'連線中':'離線作業中'; $('networkPill').className='pill '+(online?'ok':'warn');
  $('storagePill').textContent=Store.mode==='indexeddb'?'本機資料庫':'暫存模式'; $('storagePill').className='pill '+(Store.mode==='indexeddb'?'ok':'warn');
  const count=await Store.pendingCount(); $('pendingPill').textContent=`待上傳 ${count}`; $('pendingPill').className='pill '+(count?'warn':'ok');
  if (App.record) {
    const map={draft:'草稿',completed:'填寫完成',partially_signed:'部分簽認',signed:'已簽認鎖定',superseded:'已被新版本取代',void:'已作廢'};
    $('recordPill').textContent=`v${App.record.version} · ${map[App.record.status]||App.record.status}`;
    $('recordPill').className='pill '+(App.record.status==='signed'?'ok':App.record.status==='draft'?'warn':'');
    $('recordPill').classList.remove('hidden');
  } else $('recordPill').classList.add('hidden');
}

async function renderHome() {
  App.schema=null; App.record=null;
  $('homeView').classList.remove('hidden'); $('formView').classList.add('hidden'); $('bottomActions').classList.add('hidden'); $('backBtn').classList.add('hidden'); $('savePill').classList.add('hidden');
  const catalog=$('catalog'); catalog.innerHTML='';
  for (const f of App.catalog.forms) {
    const card=document.createElement('article'); card.className='catalog-card';
    card.innerHTML=`<div class="code">${esc(f.form_code)} · ${esc(f.archetype)}</div><h3>${esc(f.title)}</h3><div class="tags">${(f.tags||[]).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div><div class="record-meta">來源頁：${esc(f.source_page||'—')}</div><div class="card-actions"><button class="btn primary">建立紀錄</button></div>`;
    card.querySelector('button').onclick=()=>createAndOpen(f.form_code);
    catalog.appendChild(card);
  }
  await renderRecordList(); await refreshStatus();
}

async function renderRecordList() {
  const root=$('records'); const rows=await Store.list(); root.innerHTML='';
  if (!rows.length) { root.innerHTML='<div class="empty">尚無本機紀錄。先從上方建立一份表單。</div>'; return; }
  for (const r of rows) {
    const card=document.createElement('article'); card.className='record-card';
    const status={draft:'草稿',completed:'填寫完成',partially_signed:'部分簽認',signed:'已簽認',superseded:'舊版本',void:'作廢'}[r.status]||r.status;
    card.innerHTML=`<div class="record-main"><div class="record-title">${esc(r.title||r.form_code)}</div><div class="record-meta">${esc(r.form_code)} · v${r.version} · ${status} · ${new Date(r.updated_at).toLocaleString('zh-TW',{hour12:false})}</div></div><button class="btn small">開啟</button>`;
    card.querySelector('button').onclick=()=>openRecord(r.id); root.appendChild(card);
  }
}

async function createAndOpen(code) {
  try { App.schema=await loadSchema(code); App.record=newRecord(App.schema); await Store.save(App.record); openFormView(); }
  catch(e){console.error(e);toast(e.message);}
}
async function openRecord(id) {
  try { const r=await Store.get(id); if(!r) throw new Error('找不到紀錄'); App.schema=await loadSchema(r.form_code); App.record=r; openFormView(); }
  catch(e){console.error(e);toast(e.message);}
}
function openFormView() {
  $('homeView').classList.add('hidden'); $('formView').classList.remove('hidden'); $('bottomActions').classList.remove('hidden'); $('backBtn').classList.remove('hidden');
  renderForm(); refreshStatus(); window.scrollTo({top:0,behavior:'instant'});
}

function renderForm() {
  const s=App.schema,r=App.record;
  $('formTitle').textContent=s.title; $('formMeta').textContent=`${s.form_code} · Schema ${s.schema_version} · 紀錄 ${r.id.slice(0,8)}`;
  const root=$('formRoot'); root.innerHTML='';
  if (s.workflow?.prerequisites?.length) root.appendChild(renderGatingStatus());
  for (const sec of s.sections) {
    if (sec.visible_when==='has_failure' && !hasFailure()) continue;
    let node=null;
    if (sec.type==='fields') node=renderFields(sec);
    else if (sec.type==='checklist') node=renderChecklist(sec);
    else if (sec.type==='measurement_grid') node=renderMeasurementGrid(sec);
    else if (sec.type==='decision_matrix') node=renderDecisionMatrix(sec);
    else if (sec.type==='defect_review') node=renderDefect(sec);
    else if (sec.type==='signatures') node=renderSignatures(sec);
    else if (sec.type==='remarks') node=renderRemarks(sec);
    if (node) root.appendChild(node);
  }
  updateProgress();
  $('revisionBtn').disabled=!['partially_signed','signed','superseded'].includes(r.status);
  $('deleteBtn').disabled=!['draft','completed'].includes(r.status) || Object.keys(r.signatures||{}).length>0;
}

function shell(sec, extra='') {
  const el=document.createElement('section'); el.className='card '+extra;
  el.innerHTML=`<h2>${esc(sec.title||'')}</h2>${sec.hint?`<p class="hint">${esc(sec.hint)}</p>`:''}`; return el;
}
function visibleField(f) {
  if (!f.visible_when_value) return true;
  return Object.entries(f.visible_when_value).every(([k,v])=>App.record.data[k]===v);
}
function renderFields(sec) {
  const el=shell(sec); const grid=document.createElement('div'); grid.className='field-grid '+(sec.layout==='grid-2'?'grid-2':'');
  for (const f of sec.fields||[]) if (visibleField(f)) grid.appendChild(renderField(f));
  el.appendChild(grid); return el;
}
function renderField(f) {
  const box=document.createElement('div'); box.className='field';
  const label=document.createElement('label'); label.textContent=f.label; if(f.required)label.classList.add('required'); box.appendChild(label);
  const locked=isLocked()||f.readonly; const val=App.record.data[f.key]??'';
  if (f.type==='radio') {
    const row=document.createElement('div'); row.className='radio-row';
    for (const raw of f.options||[]) {const o=typeof raw==='string'?{value:raw,label:raw}:raw,b=document.createElement('button');b.type='button';b.className='radio-btn '+(val===o.value?'active':'');b.textContent=o.label;b.disabled=locked;b.onclick=()=>{App.record.data[f.key]=o.value;applyComputed();addAudit('field_changed',f.key);scheduleSave();renderForm();};row.appendChild(b);} box.appendChild(row);return box;
  }
  let input;
  if (f.type==='select') {input=document.createElement('select');input.innerHTML='<option value="">請選擇</option>'+ (f.options||[]).map(raw=>{const o=typeof raw==='string'?{value:raw,label:raw}:raw;return `<option value="${esc(o.value)}" ${String(val)===String(o.value)?'selected':''}>${esc(o.label)}</option>`}).join('');}
  else if (f.type==='textarea') {input=document.createElement('textarea');input.value=val;input.placeholder=f.placeholder||'';}
  else {input=document.createElement('input');input.type=f.type||'text';if(f.type==='datetime-local'&&val)input.value=val.slice(0,16);else input.value=val;if(f.step)input.step=f.step;if(f.placeholder)input.placeholder=f.placeholder;}
  input.disabled=locked; input.oninput=input.onchange=()=>{App.record.data[f.key]=input.value;applyComputed();addAudit('field_changed',f.key);scheduleSave();if(f.computed||['unit_length','pay_depth'].includes(f.key))renderForm();};
  if (f.unit) {const w=document.createElement('div');w.className='input-unit';w.appendChild(input);const u=document.createElement('span');u.className='unit';u.textContent=f.unit;w.appendChild(u);box.appendChild(w);} else box.appendChild(input);
  return box;
}

function itemApplicable(item) {
  if (!item.applicable_when) return true;
  return App.record.data[item.applicable_when.field]===item.applicable_when.value;
}
function renderChecklist(sec) {
  const el=shell(sec); const values=App.record.checklist[sec.id];
  for (const g of sec.groups||[]) {
    const gh=document.createElement('div');gh.className='group-head';gh.textContent=g.label;el.appendChild(gh);
    for (const item of g.items||[]) el.appendChild(renderChecklistRow(sec,item,values[item.key]));
  } return el;
}
function renderChecklistRow(sec,item,row) {
  const el=document.createElement('div');el.className='check-row '+(row.result==='fail'?'fail':'');
  const applicable=itemApplicable(item);
  if(!applicable && !row.auto_na){ row.result='na'; row.auto_na=true; }
  if(applicable && row.auto_na){ row.result=null; row.auto_na=false; }
  el.innerHTML=`<div class="check-top"><div class="check-title">${esc(item.label)}${item.hold_point?'<span class="hold">停留點</span>':''}<div class="standard">${esc(item.standard||'')}</div></div><div class="tri"></div></div>`;
  const tri=el.querySelector('.tri'); const opts=[['pass','○','合格'],['fail','╳','缺失'],['na','／','不適用']];
  for(const [v,sym,title] of opts){const b=document.createElement('button');b.type='button';b.textContent=sym;b.title=title;b.className=v+' '+(row.result===v?'active':'');b.disabled=isLocked()||!applicable;b.onclick=()=>{row.result=row.result===v?null:v;row.overridden=true;addAudit('inspection_result',`${item.key}:${row.result}`);scheduleSave();renderForm();};tri.appendChild(b);}
  const detail=document.createElement('div');detail.className='check-detail';
  const actual=document.createElement('div');actual.className='sub-field';actual.innerHTML='<label>實際抽查情形</label>';
  const inp=document.createElement('input');inp.type=item.actual_type==='number'?'number':'text';inp.value=row.actual||'';if(item.unit)inp.placeholder=`請輸入數值（${item.unit}）`;if(item.step)inp.step=item.step;inp.disabled=isLocked()||!applicable;
  inp.oninput=()=>{row.actual=inp.value;const auto=evaluateNumeric(item,inp.value);row.auto_assessment=auto;if(auto&&!row.overridden)row.result=auto;addAudit('inspection_actual',item.key);scheduleSave();renderForm();};actual.appendChild(inp);
  if(item.unit){const u=document.createElement('div');u.className='auto-note';u.textContent='單位：'+item.unit;actual.appendChild(u);}
  if(row.auto_assessment){const n=document.createElement('div');n.className='auto-note '+row.auto_assessment;n.textContent=`系統定量判定：${row.auto_assessment==='pass'?'合格':'不合格'}${row.overridden?'（已人工覆寫）':''}`;actual.appendChild(n);}
  const note=document.createElement('div');note.className='sub-field';note.innerHTML='<label>備註</label>';const ni=document.createElement('input');ni.value=row.note||'';ni.disabled=isLocked();ni.oninput=()=>{row.note=ni.value;scheduleSave();};note.appendChild(ni);
  detail.append(actual,note);el.appendChild(detail);return el;
}
function evaluateNumeric(item,value){const n=parseFloat(value);if(!Number.isFinite(n)||item.actual_type!=='number')return null;if(item.min!==undefined&&n<item.min)return'fail';if(item.max!==undefined&&n>item.max)return'fail';if(item.min!==undefined||item.max!==undefined)return'pass';return null;}

function renderMeasurementGrid(sec) {
  const el=shell(sec);const wrap=document.createElement('div');wrap.className='measurement-wrap';const rows=App.record.grids[sec.id];
  rows.forEach((row,index)=>{const card=document.createElement('div');card.className='grid-row';card.innerHTML=`<div class="grid-row-head"><span>量測紀錄 ${index+1}</span><button class="btn small danger no-print">刪除</button></div>`;card.querySelector('button').disabled=isLocked()||rows.length<=(sec.min_rows||1);card.querySelector('button').onclick=()=>{rows.splice(index,1);addAudit('grid_row_removed',sec.id);scheduleSave();renderForm();};const grid=document.createElement('div');grid.className='grid-fields';for(const c of sec.columns||[]){const f=document.createElement('div');f.className='grid-field';f.innerHTML=`<label class="${c.required?'required':''}">${esc(c.label)}${c.unit?' ('+esc(c.unit)+')':''}</label>`;let input;if(c.type==='select'){input=document.createElement('select');input.innerHTML='<option value="">請選擇</option>'+c.options.map(o=>`<option value="${esc(o)}" ${String(row[c.key])===String(o)?'selected':''}>${esc(resultLabel(o))}</option>`).join('');}else{input=document.createElement('input');input.type=c.type||'text';input.value=row[c.key]||'';if(c.step)input.step=c.step;}input.disabled=isLocked();input.oninput=input.onchange=()=>{row[c.key]=input.value;addAudit('grid_value_changed',`${sec.id}.${c.key}`);scheduleSave();renderForm();};f.appendChild(input);grid.appendChild(f);}card.appendChild(grid);wrap.appendChild(card);});
  const add=document.createElement('button');add.className='btn no-print';add.textContent='＋ 新增量測列';add.disabled=isLocked()||rows.length>=(sec.max_rows||100);add.onclick=()=>{rows.push(emptyGridRow(sec));addAudit('grid_row_added',sec.id);scheduleSave();renderForm();};wrap.appendChild(add);el.appendChild(wrap);return el;
}
function resultLabel(v){return {pass:'○ 合格',fail:'╳ 缺失',na:'／ 不適用'}[v]||v;}

function renderDecisionMatrix(sec) {
  const el=shell(sec);const values=App.record.decisions[sec.id];
  for(const item of sec.items||[]){const row=values[item.key],d=document.createElement('div');d.className='decision-row';d.innerHTML=`<div class="decision-label">${esc(item.label)}</div><div class="decision-options"></div>`;const opts=d.querySelector('.decision-options');for(const [v,l] of [['yes','是'],['no','否'],['na','／']]){const b=document.createElement('button');b.type='button';b.textContent=l;b.className=row.result===v?'active':'';b.disabled=isLocked();b.onclick=()=>{row.result=row.result===v?null:v;addAudit('decision_result',`${item.key}:${row.result}`);scheduleSave();renderForm();};opts.appendChild(b);}const need=(item.explanation_required_when||[]).includes(row.result);if(need||row.explanation){const box=document.createElement('div');box.className='explain sub-field';box.innerHTML=`<label class="${need?'required':''}">說明</label>`;const input=document.createElement('input');input.value=row.explanation||'';input.disabled=isLocked();input.oninput=()=>{row.explanation=input.value;scheduleSave();};box.appendChild(input);d.appendChild(box);}el.appendChild(d);}return el;
}

function renderDefect(sec) {
  const el=shell(sec,'defect-box');const d=App.record.defect;
  const grid=document.createElement('div');grid.className='field-grid grid-2';
  const fields=[
    {key:'status',label:'複查狀態',type:'select',options:['待改善','已完成改善','未完成改善']},
    {key:'review_date',label:'複查日期',type:'date'},
    {key:'reviewer',label:'複查人員職稱／姓名',type:'text'},
    {key:'notes',label:'缺失與改善說明',type:'textarea',full:true},
  ];
  for(const f of fields){const box=document.createElement('div');box.className='field '+(f.full?'full':'');box.innerHTML=`<label class="${f.key==='status'?'required':''}">${f.label}</label>`;let input;if(f.type==='select'){input=document.createElement('select');input.innerHTML='<option value="">請選擇</option>'+f.options.map(o=>`<option ${d[f.key]===o?'selected':''}>${o}</option>`).join('');}else if(f.type==='textarea'){input=document.createElement('textarea');input.value=d[f.key]||'';}else{input=document.createElement('input');input.type=f.type;input.value=d[f.key]||'';}input.disabled=isLocked();input.oninput=input.onchange=()=>{d[f.key]=input.value;addAudit('defect_changed',f.key);scheduleSave();};box.appendChild(input);grid.appendChild(box);}el.appendChild(grid);
  const photoBox=document.createElement('div');photoBox.className='field';photoBox.style.marginTop='10px';photoBox.innerHTML='<label>改善前／中／後照片（PoC 本機壓縮保存）</label>';
  const file=document.createElement('input');file.type='file';file.accept='image/*';file.multiple=true;file.setAttribute('capture','environment');file.disabled=isLocked();file.onchange=async()=>{for(const f of [...file.files]){if(d.photos.length>=9){toast('PoC 每筆最多 9 張照片');break;}d.photos.push({id:uuid(),name:f.name,image:await compressImage(f),at:nowIso()});}addAudit('photo_added',String(file.files.length));scheduleSave();renderForm();};photoBox.appendChild(file);
  const pg=document.createElement('div');pg.className='photo-grid';for(const p of d.photos||[]){const x=document.createElement('div');x.className='photo';x.innerHTML=`<img src="${p.image}" alt="${esc(p.name)}"><button type="button">×</button>`;x.querySelector('button').disabled=isLocked();x.querySelector('button').onclick=()=>{d.photos=d.photos.filter(y=>y.id!==p.id);scheduleSave();renderForm();};pg.appendChild(x);}photoBox.appendChild(pg);el.appendChild(photoBox);return el;
}
async function compressImage(file){const url=URL.createObjectURL(file);try{const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url;});const max=1280,scale=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.76);}finally{URL.revokeObjectURL(url);}}

function renderSignatures(sec) {
  const el=shell(sec);for(const slot of sec.slots||[]){const sig=App.record.signatures[slot.key],box=document.createElement('div');box.className='sig-box '+(sig?'signed':'');const head=document.createElement('div');head.className='sig-head';head.innerHTML=`<strong>${esc(slot.label)}${slot.required?' *':''}</strong>`;const b=document.createElement('button');b.className='btn small '+(sig?'':'primary');b.textContent=sig?'已簽認':'簽認';b.disabled=!!sig||['signed','superseded','void'].includes(App.record.status);b.onclick=()=>startSignature(slot);head.appendChild(b);box.appendChild(head);if(sig){const img=document.createElement('img');img.className='sig-image';img.src=sig.image;box.appendChild(img);const meta=document.createElement('div');meta.className='sig-meta';meta.innerHTML=`簽署人：${esc(sig.signer_name)}<br>時間：${esc(new Date(sig.signed_at).toLocaleString('zh-TW',{hour12:false}))}<br>內容雜湊：${esc(sig.content_hash.slice(0,24))}…`;box.appendChild(meta);const v=document.createElement('div');v.className='verify';v.textContent='驗證中…';box.appendChild(v);verifySignature(sig).then(ok=>{v.textContent=ok?'內容未經變更':'內容已變更，此簽認失效';v.className='verify '+(ok?'ok':'bad');});}el.appendChild(box);}return el;
}
async function verifySignature(sig){return (await Hash.sha256(Hash.canonical(signablePayload())))===sig.content_hash;}
function renderRemarks(sec){const el=shell(sec);el.innerHTML+=`<ol class="remarks">${(sec.items||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`;return el;}

function renderGatingStatus(){
  const sec={title:'檢驗停留點 Gating（PoC）'}; const el=shell(sec);
  const line=document.createElement('div');line.className='pill warn';line.textContent='檢查前置表單…';el.appendChild(line);
  const note=document.createElement('p');note.className='hint';note.style.marginTop='8px';note.textContent=App.schema.workflow?.notes||'';el.appendChild(note);
  checkGating().then(r=>{line.textContent=r.ok?'前置條件已通過':'尚缺：'+r.missing.join('、');line.className='pill '+(r.ok?'ok':'bad');});
  return el;
}
async function checkGating(){
  const prereqs=App.schema?.workflow?.prerequisites||[];
  if(!prereqs.length)return {ok:true,missing:[]};
  const unit=String(App.record?.data?.construction_unit||'').trim();
  if(!unit)return {ok:false,missing:['施工單元尚未填寫']};
  const records=await Store.list(); const missing=[];
  for(const code of prereqs){
    const found=records.some(r=>r.form_code===code&&r.status==='signed'&&String(r.data?.construction_unit||'').trim()===unit);
    if(!found)missing.push(`${code} 同單元已簽認紀錄`);
  }
  return {ok:missing.length===0,missing};
}

function validationErrors() {
  const errors=[];
  for(const sec of App.schema.sections||[]){if(sec.visible_when==='has_failure'&&!hasFailure())continue;if(sec.type==='fields'){for(const f of sec.fields||[]){if(!visibleField(f))continue;if(f.required&&!String(App.record.data[f.key]??'').trim())errors.push(f.label);}}
    if(sec.type==='checklist'){const values=App.record.checklist[sec.id];for(const g of sec.groups||[])for(const item of g.items||[]){if(!itemApplicable(item))continue;if(item.required&&!values[item.key].result)errors.push(item.label);}}
    if(sec.type==='measurement_grid'){const rows=App.record.grids[sec.id]||[];if(rows.length<(sec.min_rows||1))errors.push(sec.title);rows.forEach((r,i)=>{for(const c of sec.columns||[])if(c.required&&!String(r[c.key]??'').trim())errors.push(`${sec.title}第${i+1}列：${c.label}`);});}
    if(sec.type==='decision_matrix'){const values=App.record.decisions[sec.id];for(const item of sec.items||[]){const r=values[item.key];if(!r.result)errors.push(item.label);if((item.explanation_required_when||[]).includes(r.result)&&!r.explanation.trim())errors.push(item.label+'說明');}}
  }
  if(hasFailure()&&!App.record.defect.status)errors.push('缺失複查狀態');
  return [...new Set(errors)];
}
function recomputeStatus(){const required=(App.schema.sections.find(s=>s.type==='signatures')?.slots||[]).filter(s=>s.required);const count=required.filter(s=>App.record.signatures[s.key]).length;if(count===0)App.record.status=validationErrors().length?'draft':'completed';else if(count<required.length)App.record.status='partially_signed';else App.record.status='signed';}

function updateProgress(){let total=0,done=0;for(const sec of App.schema.sections||[]){if(sec.type==='fields')for(const f of sec.fields||[]){if(f.required&&visibleField(f)){total++;if(String(App.record.data[f.key]??'').trim())done++;}}if(sec.type==='checklist'){const v=App.record.checklist[sec.id];for(const g of sec.groups||[])for(const item of g.items||[]){if(item.required&&itemApplicable(item)){total++;if(v[item.key].result)done++;}}}if(sec.type==='measurement_grid')for(const row of App.record.grids[sec.id]||[])for(const c of sec.columns||[]){if(c.required){total++;if(String(row[c.key]??'').trim())done++;}}if(sec.type==='decision_matrix'){const v=App.record.decisions[sec.id];for(const item of sec.items||[]){total++;if(v[item.key].result)done++;}}}const pct=total?done/total*100:0;$('progressFill').style.width=pct+'%';$('progressLabel').textContent=`必要項目 ${done} / ${total}`;}

async function startSignature(slot){
  const missing=validationErrors();
  if(missing.length){toast('尚未完成：'+missing.slice(0,3).join('、')+(missing.length>3?' 等':'') );return;}
  const gating=await checkGating();
  if(!gating.ok){toast('Gating 未通過：'+gating.missing.join('、'));return;}
  App.signatureSlot=slot;
  $('signatureTitle').textContent=slot.label+'簽認';
  $('signerName').value='';

  // 先顯示 dialog，等待瀏覽器完成版面配置後再量測 canvas。
  // 舊版在 dialog 尚未顯示時讀取 getBoundingClientRect()，手機上寬度會是 0，
  // 導致 canvas 實際像素寬度為 0，因此看得到簽名框卻無法留下筆跡。
  $('signatureDialog').showModal();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  openPad();
}
function getPosition(){return new Promise(res=>{if(!navigator.geolocation)return res(null);const timer=setTimeout(()=>res(null),3500);navigator.geolocation.getCurrentPosition(p=>{clearTimeout(timer);res([p.coords.latitude,p.coords.longitude]);},()=>{clearTimeout(timer);res(null);},{timeout:3000,maximumAge:60000});});}

let pad={strokes:[],drawing:false,current:null,ctx:null,canvas:null};
function openPad(){
  const c=$('signatureCanvas');
  const ctx=c.getContext('2d');
  const rect=c.getBoundingClientRect();
  const ratio=window.devicePixelRatio||1;
  const cssWidth=Math.max(280,Math.round(rect.width||c.parentElement?.clientWidth||320));
  const cssHeight=210;

  c.width=Math.round(cssWidth*ratio);
  c.height=Math.round(cssHeight*ratio);
  c.style.width='100%';
  c.style.height=cssHeight+'px';
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.lineWidth=2.4;
  ctx.lineCap='round';
  ctx.lineJoin='round';
  ctx.strokeStyle='#17231e';
  pad={strokes:[],drawing:false,current:null,ctx,canvas:c,pointerId:null};

  const pos=e=>{
    const r=c.getBoundingClientRect();
    const p=e.touches?.[0]||e.changedTouches?.[0]||e;
    return{x:p.clientX-r.left,y:p.clientY-r.top};
  };
  const down=e=>{
    e.preventDefault();
    if(e.pointerId!==undefined){
      pad.pointerId=e.pointerId;
      try{c.setPointerCapture(e.pointerId);}catch(_){}
    }
    pad.drawing=true;
    pad.current=[pos(e)];
  };
  const move=e=>{
    if(!pad.drawing)return;
    e.preventDefault();
    const p=pos(e),last=pad.current[pad.current.length-1];
    pad.current.push(p);
    ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();
  };
  const up=e=>{
    if(pad.drawing&&pad.current?.length)pad.strokes.push(pad.current);
    pad.drawing=false;pad.current=null;
    if(e?.pointerId!==undefined){try{c.releasePointerCapture(e.pointerId);}catch(_){}}
    pad.pointerId=null;
  };

  // Pointer Events 是主路徑；舊版 Safari 再退回 touch/mouse。
  if(window.PointerEvent){
    c.onpointerdown=down;c.onpointermove=move;c.onpointerup=up;
    c.onpointercancel=up;c.onpointerleave=e=>{if(!c.hasPointerCapture?.(e.pointerId))up(e);};
    c.ontouchstart=c.ontouchmove=c.ontouchend=null;
    c.onmousedown=c.onmousemove=c.onmouseup=null;
  }else{
    c.ontouchstart=down;c.ontouchmove=move;c.ontouchend=up;c.ontouchcancel=up;
    c.onmousedown=down;c.onmousemove=move;c.onmouseup=up;c.onmouseleave=up;
  }
}
function clearPad(){
  pad.strokes=[];
  if(!pad.ctx||!pad.canvas)return;
  pad.ctx.save();
  pad.ctx.setTransform(1,0,0,1,0,0);
  pad.ctx.clearRect(0,0,pad.canvas.width,pad.canvas.height);
  pad.ctx.restore();
}

async function confirmSignature(){const name=$('signerName').value.trim();if(!name)return toast('請輸入簽署人姓名');if(!pad.strokes.length)return toast('請在簽名板簽名');const hash=await Hash.sha256(Hash.canonical(signablePayload()));const gps=await getPosition();App.record.signatures[App.signatureSlot.key]={slot:App.signatureSlot.key,role:App.signatureSlot.role,signer_name:name,image:pad.canvas.toDataURL('image/png'),strokes:pad.strokes,signed_at:nowIso(),content_hash:hash,gps,device:navigator.userAgent.slice(0,180)};addAudit('signed',App.signatureSlot.key);recomputeStatus();await Store.save(App.record);$('signatureDialog').close();renderForm();refreshStatus();toast(App.record.status==='signed'?'必要簽認完成，紀錄已鎖定':'簽認完成');}

async function createRevision(){if(!App.record)return;const old=App.record;old.status='superseded';old.sync_state='pending';addAudit('superseded','建立新版本');await Store.save(old);const next=clone(old);next.id=uuid();next.parent_id=old.id;next.version=(old.version||1)+1;next.status='draft';next.signatures={};next.audit=[...(old.audit||[]),{action:'revision_created',detail:`由 v${old.version} 建立`,at:nowIso()}];next.created_at=nowIso();next.updated_at=nowIso();next.sync_state='pending';App.record=next;await Store.save(next);renderForm();refreshStatus();toast(`已建立 v${next.version}，原版本保留`);}
async function deleteDraft(){if(!$('deleteBtn').disabled&&confirm('確定刪除此本機草稿？')){await Store.remove(App.record.id);toast('草稿已刪除');renderHome();}}
function downloadJson(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
async function exportRecord(){downloadJson(App.record,`${App.record.form_code}_${App.record.id}_v${App.record.version}.json`);addAudit('export_json');scheduleSave();}
async function exportSyncPackage(){const rows=await Store.pending();if(!rows.length)return toast('目前沒有待上傳紀錄');const payload={package_version:'1.0-poc',exported_at:nowIso(),device:navigator.userAgent,records:rows};downloadJson(payload,`form_writer_sync_${new Date().toISOString().slice(0,10)}.json`);toast(`已匯出 ${rows.length} 筆待上傳資料；PoC 不會自動標記為已同步`);}

async function init(){
  await Store.init();const res=await fetch('../schema/catalog.json');App.catalog=await res.json();
  $('backBtn').onclick=renderHome;$('exportBtn').onclick=exportRecord;$('printBtn').onclick=()=>window.print();$('revisionBtn').onclick=createRevision;$('deleteBtn').onclick=deleteDraft;$('exportSyncBtn').onclick=exportSyncPackage;
  $('sigClear').onclick=clearPad;$('sigCancel').onclick=()=>$('signatureDialog').close();$('sigConfirm').onclick=confirmSignature;
  window.addEventListener('online',refreshStatus);window.addEventListener('offline',refreshStatus);
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();App.installPrompt=e;$('installBtn').classList.remove('hidden');});
  $('installBtn').onclick=async()=>{if(App.installPrompt){App.installPrompt.prompt();await App.installPrompt.userChoice;App.installPrompt=null;$('installBtn').classList.add('hidden');}};
  if('serviceWorker'in navigator){try{await navigator.serviceWorker.register('sw.js');}catch(e){console.warn('SW register failed',e);}}
  await renderHome();
}

init().catch(e=>{console.error(e);toast('啟動失敗：'+e.message);});
