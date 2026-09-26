const $=id=>document.getElementById(id);
const signed=n=>n>0?`+${n}`:n<0?`−${-n}`:'0';
const pad=n=>n.toString(meta?.base??10).toUpperCase().padStart(2,'0');
const format=n=>Number(n).toLocaleString(undefined,{maximumFractionDigits:0});
let meta,challenge,receipt,jobId,redeemed=false,busy=false;
async function request(path,data){
  const res=await fetch(path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const body=await res.json();if(!res.ok){const e=new Error(body.error||'Request failed.');e.status=res.status;throw e;}return body;
}
function status(text,type=''){ $('status').textContent=text;$('status-dot').className=`status-dot ${type}`; }
function message(text,type=''){ $('receipt-message').textContent=text;$('receipt-message').className=`receipt-message ${type}`; }
function setBusy(value){busy=value;$('find').disabled=value;$('payload').disabled=value;$('difficulty').disabled=value;$('base').disabled=value;$('cancel').hidden=!value;}
function setPair(a){
  for(const [i,residue] of [a,meta.base*meta.base-a].entries()){
    const side=i?'b':'a';const entry=meta.table.find(t=>t.residue===residue);
    $(`residue-${side}`).textContent=pad(residue);$(`ending-${side}`).textContent=pad(residue);
    $(`weight-${side}`).textContent=signed(entry.weight);$(`prime-${side}`).textContent='Waiting for work';
    $(`share-${side}`).classList.remove('complete','searching');
  }
  $('example').textContent=`${pad(a)} → ${signed(meta.table.find(t=>t.residue===a).weight)}  /  ${pad(meta.base*meta.base-a)} → ${signed(meta.table.find(t=>t.residue===meta.base*meta.base-a).weight)}`;
  for(const cell of $('collision-table').children){
    cell.classList.toggle('selected-a',Number(cell.dataset.residue)===a);
    cell.classList.toggle('selected-b',Number(cell.dataset.residue)===meta.base*meta.base-a);
  }
}
function reset(){
  receipt=null;redeemed=false;
  for(const id of ['verify','redeem','download'])$(id).disabled=true;
  $('redeem').textContent='Redeem once';$('receipt-details').hidden=true;
  for(const id of ['balance','attempts','duration','verify-time'])$(id).textContent='—';
  $('receipt-state').textContent='Complete the pair first';$('balance-caption').textContent='Both halves required';
  message('Verification checks both hashes, both primes and the selected pair.');
}
function drawJob(job){
  let balance=0;
  for(const [i,residue] of [challenge.pairA,meta.base*meta.base-challenge.pairA].entries()){
    const side=i?'b':'a';const found=job.found.find(x=>x.residue===residue);const card=$(`share-${side}`);
    card.classList.toggle('complete',Boolean(found));card.classList.toggle('searching',!found&&job.phase===residue&&job.status==='running');
    card.querySelector('.found-label').textContent=found?'Found ✓':'Searching';
    if(found){$(`prime-${side}`).textContent=BigInt(found.prime).toString(meta.base).toUpperCase();$(`prime-${side}`).title='Decimal value: '+found.prime;balance+=meta.table.find(t=>t.residue===residue).weight;}
  }
  $('balance').textContent=job.found.length?signed(balance):'—';
  $('duration').textContent=`${(job.elapsedMs/1000).toFixed(2)} s`;
  if(job.found.length===1)$('balance-caption').textContent='Waiting for partner';
  if(job.status==='running'){
    $('pair-status').textContent=`Searching ${pad(job.phase)}`;
    status(`Searching for a prime ending in ${pad(job.phase)}…`,'running');
  }
}
async function poll(id){
  while(jobId===id){
    const job=await request(`/api/jobs/${id}`);drawJob(job);
    if(job.status==='complete'){
      receipt=job.receipt;$('attempts').textContent=format(receipt.search.attempts);$('duration').textContent=`${receipt.search.seconds.toFixed(3)} s`;
      $('receipt-json').textContent=JSON.stringify(receipt,null,2);$('receipt-details').hidden=false;
      $('pair-status').textContent='Pair complete';$('balance-caption').textContent='Exactly balanced';$('receipt-state').textContent='Ready to verify';
      for(const button of ['verify','download'])$(button).disabled=false;
      status('Both contributions found. Check the receipt.','good');setBusy(false);return;
    }
    if(job.status!=='running'){
      $('pair-status').textContent=job.status==='cancelled'?'Search cancelled':'Search stopped';
      status(job.error||'Search stopped.',job.status==='failed'?'error':'');setBusy(false);return;
    }
    await new Promise(resolve=>setTimeout(resolve,250));
  }
}
$('challenge-form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;reset();setBusy(true);status('Issuing a fresh challenge…','running');
  try{
    ({challenge}=await request('/api/challenges',{payload:$('payload').value,difficultyBits:Number($('difficulty').value),base:Number($('base').value)}));
    setPair(challenge.pairA);jobId=challenge.id;
    await request('/api/solve',{id:jobId});await poll(jobId);
  }catch(e){status(e.message,'error');setBusy(false);}
});
$('cancel').addEventListener('click',async()=>{
  if(!jobId)return;
  try{await request('/api/cancel',{id:jobId});}catch(e){status(e.message,'error');}
});
$('verify').addEventListener('click',async()=>{
  const checkedReceipt=receipt;
  $('verify').disabled=true;message('Checking with the separate C/GMP verifier…');
  try{
    const result=await request('/api/verify',{receipt:checkedReceipt});
    if(receipt!==checkedReceipt)return;
    $('verify-time').textContent=`${result.verificationMs.toFixed(3)} ms`;
    $('receipt-state').textContent=result.redeemed?'Verified · redeemed':'Verified';
    message('Both proofs are valid. Hashes, prime values, residues and balance all check out.','success');$('redeem').disabled=false;
  }catch(e){if(receipt===checkedReceipt)message(e.message,'error');}finally{if(receipt===checkedReceipt)$('verify').disabled=false;}
});
$('redeem').addEventListener('click',async()=>{
  const checkedReceipt=receipt;
  $('redeem').disabled=true;
  try{
    await request('/api/redeem',{receipt:checkedReceipt});if(receipt!==checkedReceipt)return;
    redeemed=true;$('redeem').textContent='Try replay';$('receipt-state').textContent='Redeemed once';
    message('Accepted once. Try replaying this same receipt to see it rejected.','success');
  }catch(e){
    if(receipt!==checkedReceipt)return;
    if(e.status===409&&redeemed){message('Replay rejected. This receipt has already been used.','success');$('receipt-state').textContent='Replay rejected';}
    else message(e.message,'error');
  }finally{if(receipt===checkedReceipt)$('redeem').disabled=false;}
});
$('download').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(receipt,null,2)+'\n'],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`bellpair-${receipt.challenge.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
async function loadBenchmark(){
  try{
    const data=await request('/api/benchmark');const table=document.createElement('table');
    table.innerHTML='<thead><tr><th>Work required</th><th>Mean attempts</th><th>Mean time / pair</th></tr></thead><tbody></tbody>';
    const names={'hash-only':'Hash difficulty only','hash-and-residue':'Hash + selected endings','paired-prime':'Hash + endings + two primes'};
    for(const row of data.summary){
      const tr=document.createElement('tr');
      for(const text of [names[row.mode],format(row.meanAttempts),`${row.meanMilliseconds.toFixed(3)} ms`]){const td=document.createElement('td');td.textContent=text;tr.append(td);}
      table.querySelector('tbody').append(tr);
    }
    const note=document.createElement('p');note.className='benchmark-note';note.textContent=`Base 10 · 12 pairs per method · difficulties 6, 8 and 10 · one worker · mean arithmetic verification ${data.meanVerificationMilliseconds.toFixed(3)} ms. These timings exclude server and process startup. The benchmark compares cost at equal hash bits; it does not establish a security advantage.`;
    $('benchmark').replaceChildren(table,note);
  }catch{$('benchmark').textContent='No benchmark recorded yet. Run make bench in the repository to generate it.';}
}
async function loadBase(base){
  const next=await request('/api/meta?base='+base);meta=next;
  reset();challenge=null;jobId=null;document.title=`${meta.brand.name} · A proof takes two`;
  document.querySelectorAll('[data-brand]').forEach(el=>el.textContent=meta.brand.name);
  $('collision-table').replaceChildren();
  $('collision-table').setAttribute('aria-label',`Base ${base} collision table`);
  $('table-count').textContent=`${meta.table.length} eligible endings · base ${base}`;
  $('pair-count').textContent=meta.pairs.length;
  $('base-note').textContent=`Primes and endings below are written in base ${base}. Changing the base also changes expected search work.`;
  for(const entry of meta.table){
    const cell=document.createElement('div');cell.className='cell';cell.dataset.residue=entry.residue;
    const residue=document.createElement('span');residue.textContent=pad(entry.residue);const w=document.createElement('small');w.textContent=signed(entry.weight);
    cell.append(residue,w);cell.title=`Ending ${pad(entry.residue)}: fingerprint ${entry.collision}, centered weight ${signed(entry.weight)}`;$('collision-table').append(cell);
  }
  setPair(meta.pairs[0]);$('pair-status').textContent='Ready when you are';
}
for(let base=2;base<=36;base++){const option=document.createElement('option');option.value=base;option.textContent=`Base ${base}`;option.selected=base===10;$('base').append(option);}
$('base').addEventListener('change',async()=>{
  if(busy)return;setBusy(true);
  try{await loadBase(Number($('base').value));status('Ready. Your computer will do the work.');}
  catch(error){$('base').value=meta.base;status(error.message,'error');}
  finally{setBusy(false);}
});
try{
  await loadBase(10);$('base').disabled=false;$('find').disabled=false;status('Ready. Your computer will do the work.');await loadBenchmark();
}catch(e){status(`Cannot reach the local service: ${e.message}`,'error');}
