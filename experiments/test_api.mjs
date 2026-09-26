import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {createApp} from '../server.mjs';
import {ROOT, TABLE, challengeArgs, verifyReceipt} from '../lib/protocol.mjs';

const run=promisify(execFile);
const clone=value=>structuredClone(value);
test('issued challenges, proofs and redemption', async t=>{
  let clock=1800000000000;
  const {server,stop}=createApp({now:()=>clock,threads:2});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(stop);
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=async(path,data,headers={})=>{
    const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
    return {status:res.status,body:await res.json()};
  };
  const issue=async(bits=0)=>{
    const r=await post('/api/challenges',{payload:'A request with meaning: π',difficultyBits:bits});
    assert.equal(r.status,201); return r.body.challenge;
  };
  const c=await issue(); let receipt;
  await t.test('fresh challenge binds UTF-8 payload and rotates the complete table',async()=>{
    assert.equal(c.payloadHash,createHash('sha256').update('A request with meaning: π').digest('hex'));
    assert.equal(c.pairA,9);
    const pairs=new Set([c.pairA]);
    for(let i=0;i<19;i++) pairs.add((await issue()).pairA);
    assert.equal(pairs.size,20); assert.equal((await issue()).pairA,9);
    assert.equal(TABLE.length,40);
    for(const a of TABLE) assert.equal(a.weight+TABLE.find(b=>b.residue===100-a.residue).weight,0);
  });
  await t.test('C solver and independent Node serialization agree',async()=>{
    const {stdout}=await run(`${ROOT}build/work-solve`,[...challengeArgs(c),'1000000','2']);
    receipt=JSON.parse(stdout);
    for(const s of receipt.shares){
      const prefix=`reflection-work/v1\nid=${c.id}\npayload=${c.payloadHash}\npair=${String(c.pairA).padStart(2,'0')},${100-c.pairA}\nbits=00\nexpires=${String(c.expiresAt).padStart(10,'0')}\nrole=${String(s.residue).padStart(2,'0')}\nnonce=`;
      const digest=createHash('sha256').update(prefix).update(Buffer.from(s.nonce,'hex')).digest();
      assert.equal(digest.toString('hex'),s.digest);
      assert.equal(((digest.readBigUInt64BE(24) | 1n<<63n | 1n)).toString(),s.prime);
    }
    assert.equal((await verifyReceipt(receipt)).valid,true);
    assert.equal((await post('/api/verify',{receipt})).status,200);
  });
  await t.test('proof changes fail independent verification',async()=>{
    for(const field of ['nonce','digest','prime']){
      const r=clone(receipt);
      if(field==='prime') r.shares[0].prime=(BigInt(r.shares[0].prime)^2n).toString();
      else r.shares[0][field]=r.shares[0][field].slice(0,-1)+(r.shares[0][field].at(-1)==='0'?'1':'0');
      const result=await post('/api/verify',{receipt:r});
      assert.equal(result.status,422,field); assert.equal(result.body.valid,false);
    }
  });
  await t.test('incomplete, swapped and forged table entries are rejected',async()=>{
    const variants=[];
    let r=clone(receipt);r.shares.pop();variants.push(r);
    r=clone(receipt);r.shares.reverse();variants.push(r);
    r=clone(receipt);r.shares[1]=r.shares[0];variants.push(r);
    r=clone(receipt);r.shares[0].weight++;variants.push(r);
    r=clone(receipt);r.balance=1;variants.push(r);
    r=clone(receipt);r.shares[0].prime=Number(r.shares[0].prime);variants.push(r);
    for(const bad of variants) assert.equal((await post('/api/verify',{receipt:bad})).status,400);
  });
  await t.test('challenge, payload, difficulty and expiry cannot be changed',async()=>{
    for(const field of ['payloadHash','difficultyBits','expiresAt','pairA']){
      const r=clone(receipt);
      if(field==='payloadHash') r.challenge[field]='f'.repeat(64);
      else if(field==='pairA') r.challenge[field]=11;
      else r.challenge[field]++;
      assert.equal((await post('/api/verify',{receipt:r})).status,400,field);
    }
    const r=clone(receipt);r.challenge.id='f'.repeat(32);
    assert.equal((await post('/api/verify',{receipt:r})).status,404);
  });
  await t.test('concurrent redemptions produce exactly one acceptance',async()=>{
    const responses=await Promise.all([post('/api/redeem',{receipt}),post('/api/redeem',{receipt})]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    assert.equal((await post('/api/redeem',{receipt})).status,409);
    const read=await post('/api/verify',{receipt});assert.equal(read.status,200);assert.equal(read.body.redeemed,true);
  });
  await t.test('expired challenge is rejected even with a valid proof',async()=>{
    clock+=601000;
    assert.equal((await post('/api/verify',{receipt})).status,410);
    assert.equal((await post('/api/redeem',{receipt})).status,410);
    assert.equal((await verifyReceipt(receipt)).valid,true,'Offline arithmetic remains valid independently of expiry.');
  });
  await t.test('cross-origin computation and invalid resource limits are rejected',async()=>{
    assert.equal((await post('/api/challenges',{payload:'x'}, {'Origin':'https://example.com'})).status,403);
    assert.equal((await post('/api/challenges',{payload:'x',difficultyBits:13})).status,400);
    assert.equal((await post('/api/challenges',{payload:'x'.repeat(2049)})).status,400);
  });
  await t.test('async solver produces a receipt the separate verifier accepts',async()=>{
    const challenge=await issue(4);
    assert.equal((await post('/api/solve',{id:challenge.id})).status,202);
    let job;
    for(let i=0;i<200;i++){
      job=await (await fetch(`${base}/api/jobs/${challenge.id}`)).json();
      if(job.status!=='running')break;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.equal(job.status,'complete',job.error);assert.equal(job.found.length,2);
    assert.equal((await post('/api/verify',{receipt:job.receipt})).body.valid,true);
  });
  await t.test('cancellation releases the worker',async()=>{
    const challenge=await issue(12);
    await post('/api/solve',{id:challenge.id});
    const result=await post('/api/cancel',{id:challenge.id});
    assert.ok(['cancelled','complete'].includes(result.body.status));
  });
});
