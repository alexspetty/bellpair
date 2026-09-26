import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash, randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {availableParallelism} from 'node:os';
import {pathToFileURL} from 'node:url';
import {ROOT, PROTOCOL, PROTOCOL_V2, validBase, tableFor, pairsFor, baseArgs, InputError, validateReceipt, verifyReceipt, sameChallenge, challengeArgs} from './lib/protocol.mjs';

const brand = JSON.parse(await readFile(`${ROOT}brand.json`, 'utf8'));
const staticFiles = new Map([
  ['/', ['public/index.html','text/html; charset=utf-8']],
  ['/app.js',['public/app.js','text/javascript; charset=utf-8']],
  ['/style.css',['public/style.css','text/css; charset=utf-8']],
  ['/mark.svg',['public/mark.svg','image/svg+xml']],
]);
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
const json = (res, status, value) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); };
const check = (condition, message) => { if (!condition) throw new InputError(message); };
async function body(req) {
  check((req.headers['content-type'] || '').split(';')[0] === 'application/json', 'Use application/json.');
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 16384) fail(413,'Request too large.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new InputError('Invalid JSON.'); }
}

export function createApp({now = () => Date.now(), ttlSeconds = 600, maxAttempts = 25000000,
                           threads = Math.min(4, availableParallelism()), jobTimeoutMs = 30000} = {}) {
  const records = new Map(), pairIndices = new Map(); let activeJob = null, activeVerifiers = 0;
  check(Number.isInteger(threads) && threads >= 1 && threads <= 8, 'Invalid thread limit.');
  const seconds = () => Math.floor(now() / 1000);
  const recordFor = id => {
    check(typeof id === 'string' && /^[0-9a-f]{32}$/.test(id), 'Invalid challenge ID.');
    const r = records.get(id); if (!r) fail(404,'Challenge is unknown to this server.');
    if (r.challenge.expiresAt <= seconds()) fail(410,'Challenge has expired.');
    return r;
  };
  const jobView = r => {
    const j = r.job;
    return {id:r.challenge.id, status:j.status, phase:j.phase, found:j.found, error:j.error,
      elapsedMs:Math.max(0,(j.endedAt ?? now()) - j.startedAt), receipt:j.receipt};
  };
  const startJob = r => {
    if (activeJob) fail(429,'A search is already running. Wait or cancel it first.');
    if (r.redeemed) fail(409,'This challenge has already been redeemed.');
    if (r.job?.status === 'complete') return jobView(r);
    const j = {status:'running', phase:r.challenge.pairA, found:[], startedAt:now(), receipt:null, error:null};
    const child = spawn(`${ROOT}build/work-solve`, [...challengeArgs(r.challenge),String(maxAttempts),String(threads),...baseArgs(r.challenge)], {stdio:['ignore','pipe','pipe']});
    r.job = j; activeJob = {child,j}; let output = '', pending = '';
    const stop = (status, message) => { if (j.status === 'running') { j.status = status; j.error = message; j.endedAt = now(); child.kill('SIGKILL'); } };
    j.cancel = () => stop('cancelled','Search cancelled.');
    const timer = setTimeout(() => stop('failed','Search reached its time limit. Try a lower difficulty.'),jobTimeoutMs);
    const release = () => { clearTimeout(timer); if (activeJob?.j === j) activeJob = null; };
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 16384) stop('failed','Unexpected solver output.'); });
    child.stderr.on('data', chunk => {
      pending += chunk;
      if (pending.length > 16384) { stop('failed','Unexpected solver output.'); return; }
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (event.event === 'phase') j.phase = event.residue;
          if (event.event === 'found') j.found.push(event);
        } catch { /* Only structured solver events are displayed. */ }
      }
    });
    child.on('error', () => { stop('failed','Solver unavailable. Run make first.'); release(); });
    child.on('close', code => {
      release();
      if (j.status !== 'running') return;
      j.endedAt = now();
      try {
        if (code !== 0) throw new Error(code === 3 ? 'Attempt limit reached. Issue a new challenge or lower the difficulty.' : 'Solver did not complete.');
        j.receipt = validateReceipt(JSON.parse(output));
        if (!sameChallenge(j.receipt.challenge,r.challenge)) throw new Error('Solver challenge mismatch.');
        j.status = 'complete';
      } catch (e) { j.status = 'failed'; j.error = e.message; }
    });
    return jobView(r);
  };
  const server = http.createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const host = req.headers.host || '';
      const expected = [`127.0.0.1:${server.address()?.port}`,`localhost:${server.address()?.port}`];
      if (!expected.includes(host)) fail(403,'Use this service through localhost.');
      if (req.headers.origin && req.headers.origin !== `http://${host}`) fail(403,'Cross-origin requests are disabled.');
      if (req.headers['sec-fetch-site'] === 'cross-site') fail(403,'Cross-site requests are disabled.');
      const url = new URL(req.url,`http://${host}`); const path = url.pathname;
      if (req.method === 'GET' && staticFiles.has(path)) {
        const [file,type] = staticFiles.get(path);
        const content = await readFile(`${ROOT}${file}`);
        res.writeHead(200,{'Content-Type':type}); res.end(content); return;
      }
      if (req.method === 'GET' && path === '/api/meta') {
        const base=Number(url.searchParams.get('base')??10);
        check(validBase(base),'Choose a base from 2 to 36.');
        json(res,200,{brand,base,protocol:PROTOCOL_V2,legacyProtocol:PROTOCOL,table:tableFor(base),pairs:pairsFor(base),limits:{bases:[2,36],difficultyBits:[0,12],threads,maxAttemptsPerRole:maxAttempts,expirySeconds:ttlSeconds}}); return;
      }
      if (req.method === 'GET' && path === '/api/benchmark') {
        try { json(res,200,JSON.parse(await readFile(`${ROOT}experiments/benchmark.json`,'utf8'))); }
        catch { json(res,404,{error:'No benchmark saved. Run make bench.'}); }
        return;
      }
      if (req.method === 'GET' && /^\/api\/jobs\/[0-9a-f]{32}$/.test(path)) {
        const r = recordFor(path.split('/').at(-1)); if (!r.job) fail(404,'No search for this challenge.');
        json(res,200,jobView(r)); return;
      }
      if (req.method !== 'POST') fail(404,'Route not found.');
      const data = await body(req);
      check(data && typeof data === 'object' && !Array.isArray(data),'Expected an object.');
      if (path === '/api/challenges') {
        check(typeof data.payload === 'string' && Buffer.byteLength(data.payload,'utf8') <= 2048,'Payload must be at most 2048 bytes.');
        const base=Object.hasOwn(data,'base')?data.base:10;
        check(validBase(base),'Choose a base from 2 to 36.');
        const pairs=pairsFor(base), pairIndex=pairIndices.get(base)??0;
        const bits = data.difficultyBits ?? 8;
        check(Number.isInteger(bits) && bits >= 0 && bits <= 12,'Choose a difficulty from 0 to 12.');
        for (const [id,r] of records) if (r.challenge.expiresAt + 60 < seconds() && r.job?.status !== 'running') records.delete(id);
        if (records.size >= 64) fail(429,'Challenge limit reached. Wait for older challenges to expire.');
        const challenge = {id:randomBytes(16).toString('hex'),payloadHash:createHash('sha256').update(data.payload,'utf8').digest('hex'),
          pairA:pairs[pairIndex % pairs.length], difficultyBits:bits,expiresAt:seconds()+ttlSeconds,
          ...(Object.hasOwn(data,'base')?{base}: {})};
        pairIndices.set(base,pairIndex+1);
        records.set(challenge.id,{challenge,redeemed:false,job:null});
        json(res,201,{challenge}); return;
      }
      if (path === '/api/solve') { const r=recordFor(data.id); json(res,202,startJob(r)); return; }
      if (path === '/api/cancel') {
        const r=recordFor(data.id); if (!r.job) fail(404,'No search for this challenge.');
        r.job.cancel(); json(res,200,jobView(r)); return;
      }
      if (path === '/api/verify' || path === '/api/redeem') {
        const receipt = validateReceipt(data.receipt); const r=recordFor(receipt.challenge.id);
        if (!sameChallenge(receipt.challenge,r.challenge)) fail(400,'Receipt does not match the issued challenge.');
        if (path === '/api/redeem' && r.redeemed) fail(409,'Receipt already redeemed. Replay rejected.');
        if (activeVerifiers >= 4) fail(429,'Verifier is busy.');
        activeVerifiers++;
        let result;
        try { result=await verifyReceipt(receipt); } finally { activeVerifiers--; }
        if (!result.valid) { json(res,422,{...result,error:'Proof verification failed.'}); return; }
        // Recheck after the asynchronous verifier to make redemption atomic.
        recordFor(receipt.challenge.id);
        if (path === '/api/redeem') {
          if (r.redeemed) fail(409,'Receipt already redeemed. Replay rejected.');
          r.redeemed=true;
        }
        json(res,200,{...result,redeemed:r.redeemed,challengeId:r.challenge.id}); return;
      }
      fail(404,'Route not found.');
    } catch (e) {
      const status=e instanceof InputError ? 400 : e.status || 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) json(res,status,{error:status === 500?'The local service could not complete this request.':e.message});
      else res.end();
    }
  });
  server.requestTimeout=10000; server.headersTimeout=10000; server.maxConnections=32;
  const stop = () => { activeJob?.j.cancel(); server.close(); server.closeAllConnections(); };
  return {server,stop};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port=Number(process.env.BELLPAIR_PORT || 8787);
  if (!Number.isInteger(port) || port<1024 || port>65535) throw new Error('Invalid BELLPAIR_PORT.');
  const {server,stop}=createApp();
  server.on('error',error=>{console.error(`Could not start Bellpair: ${error.message}`);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`${brand.name}: http://127.0.0.1:${port}`));
  process.on('SIGINT',stop); process.on('SIGTERM',stop);
}
