#!/usr/bin/env node
/**
 * Single-call entry point for the deployed TimeSeal Intelligent Contract.
 *
 *   node intelligent/scripts/example.mjs deploy
 *   node intelligent/scripts/example.mjs protocol
 *   node intelligent/scripts/example.mjs get_record '["0x<address>:handover"]'
 *   ENABLE_CHAIN_WRITES=61999 STUDIO_PRIVATE_KEY=0x... \
 *     node intelligent/scripts/example.mjs seal '["handover","<specification JSON string>"]'
 *
 * Paths are resolved against the intelligent/ project root, so the command works from the
 * repository root or from inside intelligent/.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {TransactionHashVariant} from 'genlayer-js/types';
import {client, network, load, save, sha, receipt, validateReceipt, validateBinding, selected, need,
  signer, RPC, CHAIN, SDK, ROOT} from './runtime.mjs';

const VIEWS = ['protocol', 'get_record', 'list_records', 'tight_bound'];
const WRITES = ['seal', 'analyze', 'reanalyze', 'commit_schedule'];
const SOURCE = path.join(ROOT, 'contracts', 'timeseal.py');
const DEPLOYMENT = path.join(ROOT, 'deployment.json');
const LOCAL = path.join(ROOT, '.local');

const [method = 'protocol', encoded = '[]'] = process.argv.slice(2);
const args = JSON.parse(encoded);
need(Array.isArray(args), 'Arguments must be a JSON array');

if (method === 'deploy') {
  need(process.env.ENABLE_CHAIN_WRITES === '61999', 'Explicit ENABLE_CHAIN_WRITES=61999 required');
  const key = process.env.STUDIO_PRIVATE_KEY;
  need(/^0x[0-9a-fA-F]{64}$/.test(key ?? ''), 'Set a local STUDIO_PRIVATE_KEY; never commit it');
  const existing = await load(DEPLOYMENT);
  need(!existing,
    'deployment.json already exists — the contract is deployed. Remove it deliberately only to redeploy.');
  const c = client(key);
  await network(c);
  const source = await fs.readFile(SOURCE);
  const sourceSha = sha(source);
  const hash = await c.deployContract({code: source, args: [], leaderOnly: false});
  console.log('Broadcast', hash, '- polling for finality');
  const r = await receipt(c, hash);
  validateReceipt(r, hash);
  const address = r.data?.contract_address ?? r.to_address;
  need(sha(await c.getContractCode(address)) === sourceSha, 'Deployed source mismatch');
  await save(DEPLOYMENT, {
    network: 'Stable Studionet',
    chain_id: CHAIN,
    rpc: RPC,
    sdk: SDK,
    contract: address,
    explorer: `https://explorer-studio.genlayer.com/address/${address}`,
    recorded_at: new Date().toISOString(),
    constructor_args: [],
    payable: false,
    source: {file: 'contracts/timeseal.py', sha256: sourceSha, bytes: source.length,
      lines: source.toString('utf8').split('\n').length, line_endings: 'CRLF',
      byte_identical_to_local: true},
  });
  console.log('Deployed', address);
  process.exit(0);
}

need(VIEWS.includes(method) || WRITES.includes(method), `Unknown method ${method}`);
const deployment = await load(DEPLOYMENT);
need(deployment?.chain_id === CHAIN, 'No deployment record — run: node intelligent/scripts/example.mjs deploy');
need(deployment.source.sha256 === sha(await fs.readFile(path.join(ROOT, deployment.source.file))),
  'Local source no longer matches the recorded deployed source');

const view = VIEWS.includes(method);
const key = view ? null : process.env.STUDIO_PRIVATE_KEY;
if (!view) {
  need(process.env.ENABLE_CHAIN_WRITES === '61999', 'Explicit ENABLE_CHAIN_WRITES=61999 required');
  need(/^0x[0-9a-fA-F]{64}$/.test(key ?? ''), 'Set a local STUDIO_PRIVATE_KEY; never commit it');
}
const c = client(key ?? undefined);
await network(c);

if (view) {
  const value = await c.readContract({address: deployment.contract, functionName: method, args,
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL});
  console.log(value === '' ? '(empty)' : value);
  process.exit(0);
}

// Writes are journalled before broadcast so a timeout resumes the same hash and never resends.
const who = signer(key);
await fs.mkdir(LOCAL, {recursive: true, mode: 0o700});
const journal = path.join(LOCAL, `${sha(JSON.stringify({method, args, who})).slice(0, 24)}.json`);
let entry = await load(journal);
if (entry?.verified) { console.log('Already verified', entry.hash); process.exit(0); }
if (!entry) {
  const code = await c.getContractCode(deployment.contract);
  need(sha(code) === deployment.source.sha256, 'Deployed source mismatch');
  entry = {method, args, signer: who, stage: 'SUBMITTING'};
  await save(journal, entry);
  entry.hash = await c.writeContract({address: deployment.contract, functionName: method, args,
    value: 0n, leaderOnly: false});
  entry.stage = 'PENDING';
  await save(journal, entry);
}
need(entry.hash, 'Unknown broadcast outcome; reconcile the original signer before retry');
const r = await receipt(c, entry.hash);
entry.receipt = selected(r);
await save(journal, entry);
validateReceipt(r, entry.hash);
validateBinding(r, entry, deployment.contract);
entry.verified = true;
await save(journal, entry);
console.log('FINALIZED + SUCCESS', entry.hash);
console.log(`Read it back with: node intelligent/scripts/example.mjs get_record '["${entry.args[0]}"]'`);
