import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {writeFile,mkdir} from 'node:fs/promises';
import {ROOT,tableFor,pairsFor,challengeArgs,baseArgs,verifyReceipt,validateReceipt} from '../lib/protocol.mjs';
import {createApp} from '../server.mjs';
const run=promisify(execFile);
test('all 35 bases: native search, independent hash encoding, verification, binding and API', async t=>{
  const {server,stop}=createApp({threads:1}); server.listen(0,'127.0.0.1');await once(server,'listening');t.after(stop);
  const url=`http://127.0.0.1:${server.address().port}`;
  const post=async(path,data)=>{const r=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
  const recordings={};
  for(let base=2;base<=36;base++){
    const table=tableFor(base),q=base*base;
    assert.equal(table.length,pairsFor(base).length*2);
    for(const entry of table)assert.equal(entry.weight+table.find(other=>other.residue===q-entry.residue).weight,0);
    const meta=await (await fetch(url+`/api/meta?base=${base}`)).json();assert.deepEqual(meta.table,table);
    const issued=await post('/api/challenges',{payload:`Bellpair base ${base} recorded walkthrough`,difficultyBits:4,base});assert.equal(issued.status,201);
    const c=issued.body.challenge;assert.equal(c.base,base);assert.equal(c.pairA,base-1);
    const {stdout}=await run(ROOT+'build/work-solve',[...challengeArgs(c),'8000000','1',...baseArgs(c)]);
    const receipt=JSON.parse(stdout);validateReceipt(receipt);assert.equal(receipt.version,2);
    for(const s of receipt.shares){
      const pad=(n,w)=>String(n).padStart(w,'0');
      const prefix=`reflection-work/v2\nid=${c.id}\npayload=${c.payloadHash}\nbase=${pad(base,4)}\npair=${pad(c.pairA,4)},${pad(q-c.pairA,4)}\nbits=04\nexpires=${pad(c.expiresAt,10)}\nrole=${pad(s.residue,4)}\nnonce=`;
      const digest=createHash('sha256').update(prefix).update(Buffer.from(s.nonce,'hex')).digest();
      assert.equal(digest.toString('hex'),s.digest);assert.equal(BigInt(s.prime)%BigInt(q),BigInt(s.residue));
      assert.equal(((digest.readBigUInt64BE(24)|1n<<63n|1n)).toString(),s.prime);
    }
    const verification=await verifyReceipt(receipt);assert.equal(verification.valid,true);
    assert.equal((await post('/api/verify',{receipt})).status,200);
    const altered=structuredClone(receipt);altered.challenge.base=base===36?35:base+1;
    assert.equal((await post('/api/verify',{receipt:altered})).status,400);
    const args=[...challengeArgs(c),...receipt.shares.flatMap(s=>[s.nonce,s.prime,s.digest]),String(base===36?35:base+1)];
    await assert.rejects(run(ROOT+'build/work-verify',args));
    const downgrade=structuredClone(receipt);downgrade.version=1;downgrade.protocol='reflection-work/v1';assert.throws(()=>validateReceipt(downgrade));
    assert.equal((await post('/api/redeem',{receipt})).status,200);assert.equal((await post('/api/redeem',{receipt})).status,409);
    recordings[base]={receipt,verification};
  }
  for(const base of [1,37,2.5,'16',null])assert.equal((await post('/api/challenges',{payload:'invalid',base})).status,400);
  await mkdir(ROOT+'experiments/artifacts',{recursive:true});
  await writeFile(ROOT+'experiments/artifacts/base-walkthroughs.json',JSON.stringify(recordings,null,2)+'\n');
});
