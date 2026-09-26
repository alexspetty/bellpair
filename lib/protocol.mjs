import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const runFile = promisify(execFile);
export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const PROTOCOL = 'reflection-work/v1';
export const PROTOCOL_V2 = 'reflection-work/v2';
export const validBase = b => Number.isInteger(b) && b >= 2 && b <= 36;
export const baseArgs = c => Object.hasOwn(c,'base') ? [String(c.base)] : [];
const challengeKeys = ['id', 'payloadHash', 'pairA', 'difficultyBits', 'expiresAt'];
export class InputError extends Error {}
const requireInput = (condition, message) => { if (!condition) throw new InputError(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
export const isUnit = (a, base=10) => {
  if(!validBase(base) || !Number.isInteger(a) || a<=0 || a>=base*base) return false;
  let x=a,y=base; while(y){const r=x%y;x=y;y=r;} return x===1;
};
export function collision(a, base=10) {
  requireInput(isUnit(a,base), 'Invalid residue for this base.');
  let result = -1 - Math.floor(a/base);
  for(let d=0;d<base;d++) result+=Math.floor(((base+1)*d+1)*a/(base*base))-Math.floor((base+1)*d*a/(base*base));
  return result;
}
export const weight = (a,base=10) => 2*collision(a,base)+1;
export const tableFor = base => {
  requireInput(validBase(base),'Choose a base from 2 to 36.');
  return Array.from({length:base*base},(_,a)=>a).filter(a=>isUnit(a,base)).map(a=>({residue:a,collision:collision(a,base),weight:weight(a,base)}));
};
export const pairsFor = base => [base-1,...tableFor(base).filter(x=>2*x.residue<base*base&&x.residue!==base-1).map(x=>x.residue)];
export const TABLE=tableFor(10);
export const PAIRS=pairsFor(10);
export function validateChallenge(c) {
  requireInput(exactKeys(c, Object.hasOwn(c??{},'base')?[...challengeKeys,'base']:challengeKeys), 'Malformed challenge.');
  requireInput(typeof c.id === 'string' && /^[0-9a-f]{32}$/.test(c.id), 'Invalid challenge ID.');
  requireInput(typeof c.payloadHash === 'string' && /^[0-9a-f]{64}$/.test(c.payloadHash), 'Invalid payload digest.');
  const base=Object.hasOwn(c,'base')?c.base:10;
  requireInput(validBase(base),'Choose a base from 2 to 36.');
  requireInput(isUnit(c.pairA,base) && 2*c.pairA < base*base, 'Invalid reflection pair.');
  requireInput(Number.isInteger(c.difficultyBits) && c.difficultyBits >= 0 && c.difficultyBits <= 20, 'Invalid difficulty.');
  requireInput(Number.isSafeInteger(c.expiresAt) && c.expiresAt > 0 && c.expiresAt <= 9999999999, 'Invalid expiry.');
  return c;
}
export const challengeArgs = c => [c.id, c.payloadHash, String(c.pairA), String(c.difficultyBits), String(c.expiresAt)];
export const sameChallenge = (a, b) => [...challengeKeys,'base'].every(k => a[k] === b[k]);
export function validateReceipt(receipt) {
  requireInput(object(receipt), 'Expected a receipt object.');
  const required = ['version','protocol','challenge','shares','balance'];
  requireInput(required.every(k => Object.hasOwn(receipt,k)) && Object.keys(receipt).every(k => [...required,'search'].includes(k)), 'Malformed receipt fields.');
  const v2=receipt.version===2 && receipt.protocol===PROTOCOL_V2;
  requireInput(v2 || (receipt.version===1 && receipt.protocol===PROTOCOL), 'Unsupported receipt protocol.');
  const c = validateChallenge(receipt.challenge);
  requireInput(Object.hasOwn(c,'base')===v2, 'Base and protocol version do not match.');
  const base=c.base??10;
  requireInput(Array.isArray(receipt.shares) && receipt.shares.length === 2, 'Two contributions are required.');
  receipt.shares.forEach((s, i) => {
    requireInput(exactKeys(s, ['residue','nonce','prime','digest','collision','weight']), 'Malformed contribution.');
    const residue = i === 0 ? c.pairA : base*base-c.pairA;
    requireInput(s.residue === residue, 'Contribution has the wrong role.');
    requireInput(typeof s.nonce === 'string' && /^[0-9a-f]{16}$/.test(s.nonce), 'Invalid nonce.');
    requireInput(typeof s.prime === 'string' && /^[1-9][0-9]{0,19}$/.test(s.prime), 'Prime must be a decimal string.');
    requireInput(BigInt(s.prime) >= (1n << 63n) && BigInt(s.prime) < (1n << 64n), 'Candidate outside the 64-bit domain.');
    requireInput(typeof s.digest === 'string' && /^[0-9a-f]{64}$/.test(s.digest), 'Invalid proof digest.');
    requireInput(s.collision === collision(residue,base) && s.weight === weight(residue,base), 'Incorrect collision entry or weight.');
  });
  requireInput(receipt.balance === 0 && receipt.shares[0].weight + receipt.shares[1].weight === 0, 'Pair does not balance.');
  // Search statistics describe the producer's run. They have no verification authority.
  if (Object.hasOwn(receipt, 'search')) {
    const s = receipt.search;
    requireInput(exactKeys(s, ['attempts','primalityTests','seconds','threads']), 'Malformed search metadata.');
    for (const k of ['attempts','primalityTests','threads']) requireInput(Number.isSafeInteger(s[k]) && s[k] >= 0, 'Invalid search metadata.');
    requireInput(typeof s.seconds === 'number' && Number.isFinite(s.seconds) && s.seconds >= 0, 'Invalid search duration.');
  }
  return receipt;
}
export async function verifyReceipt(receipt) {
  validateReceipt(receipt);
  const args = [...challengeArgs(receipt.challenge), ...receipt.shares.flatMap(s => [s.nonce, s.prime, s.digest]), ...baseArgs(receipt.challenge)];
  let stdout;
  try {
    ({stdout} = await runFile(`${ROOT}build/work-verify`, args, {timeout: 3000, maxBuffer:16384}));
  } catch (error) {
    if (error.code === 1) stdout = error.stdout;
    else throw new Error('The C verifier could not complete.', {cause:error});
  }
  return JSON.parse(stdout);
}
