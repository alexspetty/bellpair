#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {verifyReceipt} from './lib/protocol.mjs';
try {
  if (process.argv.length !== 3) throw new Error('Usage: node verify-receipt.mjs receipt.json');
  const receipt = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const result = await verifyReceipt(receipt);
  console.log(JSON.stringify({...result, scope:'Arithmetic validity only. Issuance, expiry and redemption require the issuing server.'}, null, 2));
  process.exitCode = result.valid ? 0 : 1;
} catch (error) { console.error(error.message); process.exitCode = 2; }
