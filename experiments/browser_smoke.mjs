// Start chromedriver separately. BELLPAIR_URL and WEBDRIVER_URL may override local defaults.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const driver=process.env.WEBDRIVER_URL || 'http://127.0.0.1:9515';
const base=process.env.BELLPAIR_URL || 'http://127.0.0.1:8787';
const artifacts=new URL('./artifacts/',import.meta.url);
await mkdir(artifacts,{recursive:true});
async function command(path,method='GET',data){
  const res=await fetch(driver+path,{method,headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  const json=await res.json();if(!res.ok||json.value?.error)throw new Error(JSON.stringify(json));return json.value;
}
const session=await command('/session','POST',{capabilities:{alwaysMatch:{browserName:'chrome','goog:chromeOptions':{args:['--headless=new','--no-sandbox','--disable-dev-shm-usage','--window-size=1440,1200']},'goog:loggingPrefs':{browser:'ALL'}}}});
const root=`/session/${session.sessionId}`;
const execute=script=>command(`${root}/execute/sync`,'POST',{script,args:[]});
const click=id=>execute(`document.getElementById(${JSON.stringify(id)}).click();`);
const waitFor=async(script,timeout=35000)=>{
  const start=Date.now();while(Date.now()-start<timeout){if(await execute(script))return;await new Promise(r=>setTimeout(r,100));}
  throw new Error('Browser wait timed out: '+script);
};
const screenshot=async name=>writeFile(new URL(name,artifacts),Buffer.from(await command(`${root}/screenshot`),'base64'));
try{
  await command(`${root}/url`,'POST',{url:base});
  await waitFor('return !document.getElementById("find").disabled');
  assert.equal(await execute('return document.querySelectorAll(".cell").length'),40);
  await click('find');
  await waitFor('return !document.getElementById("verify").disabled');
  await click('verify');
  await waitFor('return !document.getElementById("redeem").disabled');
  assert.equal(await execute('return document.getElementById("receipt-state").textContent'),'Verified');
  await click('redeem');
  await waitFor('return document.getElementById("receipt-state").textContent==="Redeemed once"');
  await click('redeem');
  await waitFor('return document.getElementById("receipt-state").textContent==="Replay rejected"');
  const receipt=JSON.parse(await execute('return document.getElementById("receipt-json").textContent'));
  await writeFile(new URL('browser-receipt.json',artifacts),JSON.stringify(receipt,null,2)+'\n');
  assert.equal(await execute('return document.getElementById("balance").textContent'),'0');
  assert.equal(await execute('return document.documentElement.scrollWidth <= innerWidth'),true);
  await screenshot('desktop.png');
  await command(`${root}/window/rect`,'POST',{width:390,height:844});
  await execute('window.scrollTo({top:0,behavior:"instant"})');
  assert.equal(await execute('return document.documentElement.scrollWidth <= innerWidth'),true);
  await screenshot('mobile.png');
  await execute('document.querySelector(".proof-panel").scrollIntoView({behavior:"instant"})');
  await screenshot('mobile-pair.png');
  const logs=await command(`${root}/log`,'POST',{type:'browser'});
  const expectedReplay=logs.filter(x=>x.source==='network' && x.message.includes('/api/redeem') && x.message.includes('409'));
  assert.equal(expectedReplay.length,1,'Exactly one expected replay response');
  const severe=logs.filter(x=>x.level==='SEVERE' && !expectedReplay.includes(x));
  assert.deepEqual(severe,[],'Unexpected browser console errors');
  const results={passed:true,checks:['40 table entries','search','independent verification','single redemption','replay rejection','desktop overflow','mobile overflow','browser console'],screenshots:['desktop.png','mobile.png','mobile-pair.png']};
  await writeFile(new URL('browser-results.json',artifacts),JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify(results));
}finally{await command(root,'DELETE');}
