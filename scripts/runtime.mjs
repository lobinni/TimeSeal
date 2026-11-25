import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createAccount, createClient, abi} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {TransactionHashVariant} from 'genlayer-js/types';

/** Project root of the Intelligent Contract folder, independent of the current directory. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const RPC = 'https://studio.genlayer.com/api';
export const CHAIN = 61999;
export const SDK = 'genlayer-js@1.1.8';

export const stringify = v => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x, 2) + '\n';
export const sha = v => createHash('sha256').update(v).digest('hex');
export function need(v, m) { if (!v) throw Error(m); }

export async function load(path, otherwise = null) {
  try { return JSON.parse(await fs.readFile(path, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return otherwise; throw e; }
}
export async function save(path, value) {
  await fs.writeFile(path + '.tmp', stringify(value));
  await fs.rename(path + '.tmp', path);
}

export function client(key) {
  return createClient({chain: studionet, endpoint: RPC, ...key ? {account: createAccount(key)} : {}});
}
export async function network(c) {
  need(studionet.id === CHAIN && await c.getChainId() === CHAIN, 'Stable Studionet 61999 required');
}
export function signer(key) { return createAccount(key).address.toLowerCase(); }

export function selected(r) {
  const keys = ['hash', 'from_address', 'to_address', 'status', 'statusName', 'result', 'resultName',
    'leader_only', 'execution_mode', 'value', 'txExecutionResultName', 'txDataDecoded'];
  const out = Object.fromEntries(keys.filter(k => r[k] !== undefined).map(k => [k, r[k]]));
  out.data = {...r.data};
  delete out.data.contract_code;
  if (r.consensus_data) {
    const raw = r.consensus_data.leader_receipt;
    const receipts = Array.isArray(raw) ? raw : raw ? [raw] : [];
    out.consensus_data = {
      votes: r.consensus_data.votes,
      leader_receipt: receipts.map(x => Object.fromEntries(
        ['mode', 'vote', 'execution_result', 'error', 'result', 'eq_outputs'].filter(k => x[k] !== undefined)
          .map(k => [k, x[k]])))
    };
  }
  return out;
}

export function resultOf(r) {
  const receipts = r.consensus_data?.leader_receipt;
  const leader = Array.isArray(receipts) ? receipts.filter(x => x.mode === 'leader').at(-1) : receipts;
  return leader?.execution_result ?? r.txExecutionResultName;
}

export function validateReceipt(r, hash, expectSuccess = true) {
  need((r.statusName ?? r.status) === 'FINALIZED', 'Transaction is not FINALIZED');
  need((r.hash ?? r.txId)?.toLowerCase() === hash.toLowerCase(), 'Receipt hash mismatch');
  need(r.result === 6 || r.resultName === 'MAJORITY_AGREE', 'Missing majority agreement');
  need(r.leader_only === false && r.execution_mode === 'NORMAL', 'Full consensus not established');
  need(expectSuccess
    ? resultOf(r) === 'SUCCESS'
    : resultOf(r) !== 'SUCCESS' && typeof resultOf(r) === 'string', 'Unexpected execution result');
}

export function callOf(r) {
  const data = r.data?.calldata;
  const encoded = typeof data === 'string' ? data : data?.base64;
  need(typeof encoded === 'string', 'Missing receipt calldata');
  const value = abi.calldata.decode(Buffer.from(encoded, 'base64'));
  return value instanceof Map ? Object.fromEntries(value) : value;
}

export function canonical(v) {
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Map) v = Object.fromEntries(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v !== null && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

export function validateBinding(r, entry, address) {
  need(r.from_address?.toLowerCase() === entry.signer, 'Wrong transaction signer');
  need(r.to_address?.toLowerCase() === address.toLowerCase(), 'Wrong contract');
  const call = callOf(r);
  need(call.method === entry.method && canonical(call.args) === canonical(entry.args),
    'Wrong method or arguments');
}

export async function receipt(c, hash, limit = 600000) {
  const start = Date.now();
  let last = '', transportFailures = 0;
  while (Date.now() - start < limit) {
    let r;
    try { r = await c.getTransaction({hash}); transportFailures = 0; }
    catch (e) {
      if (++transportFailures > 5) throw e;
      console.log('Transient RPC read failure; retaining original hash', hash);
      await new Promise(resolve => setTimeout(resolve, 5000));
      continue;
    }
    const status = r.statusName ?? r.status;
    if (status !== last) { console.log(hash, status); last = status; }
    if (status === 'FINALIZED') return r;
    if (['CANCELED', 'UNDETERMINED', 'LEADER_TIMEOUT', 'VALIDATORS_TIMEOUT'].includes(status)) {
      throw Error(`Non-final outcome: ${status}; retained ${hash}`);
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw Error(`Polling timeout; resume hash ${hash}, never resubmit`);
}
