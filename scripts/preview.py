#!/usr/bin/env python3
"""Run an example specification through TimeSeal with a recorded interpretation.

The contract itself never interprets prose locally: consensus does that on chain.
This tool exists so a developer can exercise seal/analyze/commit_schedule and inspect
the derived proof without a wallet, an RPC or a model call.

    python3 scripts/preview.py examples/feasible.json
    python3 scripts/preview.py examples/conflict.json --commit

Each example pairs with <name>.accepted.json, the canonical interpretation that
consensus would return for that specification.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests'))

from host import c, host, A  # noqa: E402  (installs the stub genlayer module)


def main():
    if len(sys.argv) < 2:
        raise SystemExit('usage: python3 intelligent/scripts/preview.py examples/<name>.json [--commit]')
    spec_path = pathlib.Path(sys.argv[1])
    if not spec_path.exists():
        spec_path = ROOT / spec_path
    if not spec_path.exists():
        raise SystemExit(f' specification not found: {sys.argv[1]}')
    commit = '--commit' in sys.argv

    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    accepted_path = spec_path.with_suffix('.accepted.json')
    if not accepted_path.exists():
        raise SystemExit(f'missing recorded interpretation: {accepted_path}')
    accepted = json.loads(accepted_path.read_text(encoding='utf-8'))

    host.queue = [json.dumps(accepted), json.dumps(accepted)]
    host.message.sender_address = A
    contract = c.TimeSeal()
    contract.records = {}
    contract.owners = {}

    key = contract.seal('sample', json.dumps(spec))
    record = json.loads(contract.analyze(key, 0))

    out = {
        'record_id': key,
        'state': record['state'],
        'revision': record['revision'],
        'attempts': record['attempts'],
        'analysis_hash': record['analysis_hash'],
    }
    proof = record['proof']
    if proof['status'] == 'FEASIBLE':
        out['earliest'] = proof['earliest']
        out['latest'] = proof['latest']
        out['tight_0_last'] = proof['tight_intervals'][0][len(spec['events']) - 1]
        out['suggested_commit_args'] = [key, record['revision'], record['analysis_hash'],
                                        json.dumps(proof['earliest'])]
        if commit:
            committed = json.loads(contract.commit_schedule(
                key, record['revision'], record['analysis_hash'], json.dumps(proof['earliest'])))
            out['state'] = committed['state']
            out['revision'] = committed['revision']
            out['schedule_hash'] = committed['schedule_hash']
    elif proof['status'] == 'CONFLICT':
        out['cycle_sum'] = proof['cycle_sum']
        out['witness'] = proof['witness']
        out['negative_cycle'] = proof['negative_cycle']
    else:
        out['unknown_clauses'] = proof['unknown_clauses']
        out['reanalyze_args'] = [key, record['revision']]

    print(json.dumps(out, indent=2, sort_keys=True))


if __name__ == '__main__':
    main()
