#!/usr/bin/env node
/**
 * Read-only verification of the deployed TimeSeal contract.
 *
 *   node intelligent/scripts/verify.mjs
 *   node intelligent/scripts/verify.mjs 0x<owner>:handover     # also read one record back
 *
 * Submits no transaction, needs no wallet and holds no key. It checks that the bytes in this
 * repository are the bytes on chain, that the recorded protocol surface still matches, and
 * optionally that a record reads back at latest-final. Exits non-zero on any mismatch.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {TransactionHashVariant} from 'genlayer-js/types';
import {client, network, sha, need, RPC, CHAIN, SDK, ROOT} from './runtime.mjs';

const deployment = JSON.parse(await fs.readFile(path.join(ROOT, 'deployment.json'), 'utf8'));
const recordId = process.argv[2];

const rows = [];
const check = (name, ok, detail = '') => rows.push({name, ok: Boolean(ok), detail});

need(deployment.chain_id === CHAIN, `deployment.json expects chain ${CHAIN}`);

const c = client();
await network(c);
check('rpc network is Stable Studionet', true, RPC);

// 1. source parity --------------------------------------------------------
const onChain = await c.getContractCode(deployment.contract);
const onChainSha = sha(onChain);
check('deployed source sha256 matches deployment.json', onChainSha === deployment.source.sha256, onChainSha);
check('deployed source byte length', onChain.length === deployment.source.bytes,
  `${onChain.length} bytes`);

const local = await fs.readFile(path.join(ROOT, deployment.source.file));
check('committed source is byte-identical to deployed source', sha(local) === onChainSha, sha(local));

// 2. protocol surface -----------------------------------------------------
const raw = await c.readContract({address: deployment.contract, functionName: 'protocol', args: [],
  transactionHashVariant: TransactionHashVariant.LATEST_FINAL});
const protocol = JSON.parse(raw);
for (const [key, value] of Object.entries(deployment.protocol_readback)) {
  check(`protocol.${key}`, JSON.stringify(protocol[key]) === JSON.stringify(value),
    JSON.stringify(protocol[key]));
}
check('sdk pin', deployment.sdk === SDK, deployment.sdk);

// 3. optional record readback --------------------------------------------
if (recordId) {
  const found = await c.readContract({address: deployment.contract, functionName: 'get_record',
    args: [recordId], transactionHashVariant: TransactionHashVariant.LATEST_FINAL});
  check(`get_record(${recordId})`, typeof found === 'string' && found.length > 0,
    found ? `${JSON.parse(found).state}` : 'absent');
}

// report ------------------------------------------------------------------
const failed = rows.filter(r => !r.ok);
for (const r of rows) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
}
console.log(`\n${rows.length - failed.length}/${rows.length} checks passed · ${deployment.contract} · chain ${CHAIN}`);
if (failed.length) {
  console.error('Verification failed. Do not submit: the repository and the chain disagree.');
  process.exit(1);
}
