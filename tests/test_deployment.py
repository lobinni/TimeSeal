"""Deployment integrity tests.

These tests bind the committed repository to the deployed artifact. They never touch the
network: the on-chain facts recorded in deployment.json were read back over RPC and are
asserted here as a fixed record, so any local drift fails the suite immediately.
"""
import hashlib
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'contracts' / 'timeseal.py'
DEPLOYMENT = ROOT / 'deployment.json'

CHAIN_ID = 61999
ADDRESS = '0x4EE33A9172f54869C0feA7314074dD7eB710A778'
SOURCE_SHA256 = '525246061490d4158301c7d71ec8d9327d8c615677989b1e82a8cb1e3668a608'
PROTOCOL_VERSION = 'timeseal-1'


def load():
    return json.loads(DEPLOYMENT.read_text(encoding='utf-8'))


class DeploymentRecordTests(unittest.TestCase):
    def test_deployment_record_is_present_and_well_formed(self):
        self.assertTrue(DEPLOYMENT.exists(), 'deployment.json is required in the repository')
        d = load()
        self.assertEqual(d['network'], 'Stable Studionet')
        self.assertEqual(d['chain_id'], CHAIN_ID)
        self.assertEqual(d['rpc'], 'https://studio.genlayer.com/api')
        self.assertEqual(d['sdk'], 'genlayer-js@1.1.8')
        self.assertEqual(d['constructor_args'], [])
        self.assertIs(d['payable'], False)

    def test_contract_address_is_the_deployed_one(self):
        d = load()
        self.assertEqual(d['contract'], ADDRESS)
        self.assertRegex(d['contract'], r'^0x[0-9a-fA-F]{40}$')
        self.assertIn(ADDRESS, d['explorer'])

    def test_committed_source_is_byte_identical_to_the_deployed_source(self):
        """The single most important property: what is committed is what is on chain."""
        d = load()
        raw = SOURCE.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        self.assertEqual(digest, SOURCE_SHA256, 'contracts/timeseal.py no longer matches the deployment')
        self.assertEqual(d['source']['sha256'], digest)
        self.assertEqual(d['source']['bytes'], len(raw))
        self.assertEqual(d['source']['lines'], raw.count(b'\n'))
        self.assertEqual(d['source']['line_endings'], 'CRLF')
        # No bare LF anywhere: the deployed artifact was uploaded with CRLF endings.
        self.assertNotRegex(raw.decode('utf-8'), r'(?<!\r)\n')
        self.assertTrue(raw.startswith(b'# { "Depends": "py-genlayer:'))
        self.assertEqual(raw.count(b'\r\n\r\n"""'), 1, 'exactly one blank line after the pragma')

    def test_protocol_readback_matches_the_contract_module(self):
        import host  # noqa: F401  (ensures the contract module can be loaded)
        from host import c
        d = load()
        p = d['protocol_readback']
        self.assertEqual(p['version'], c.VERSION)
        self.assertEqual(p['attempts'], c.MAX_ATTEMPTS)
        self.assertEqual(p['records_per_owner'], c.OWNER_LIMIT)
        self.assertEqual(p['chain_id'], d['chain_id'])
        self.assertEqual(p['states'], ['SEALED', 'REVIEW', 'CONFLICT', 'FEASIBLE', 'COMMITTED'])
        self.assertEqual(p['methods'], ['seal', 'analyze', 'reanalyze', 'commit_schedule'])
        self.assertEqual(sorted(d['abi']['views']),
                         sorted(['protocol', 'get_record', 'list_records', 'tight_bound']))
        self.assertEqual(sorted(d['abi']['writes']),
                         sorted(['seal', 'analyze', 'reanalyze', 'commit_schedule']))
        self.assertEqual(p['version'], PROTOCOL_VERSION)

    def test_scripts_reference_the_deployed_address(self):
        runtime = (ROOT / 'scripts' / 'runtime.mjs').read_text(encoding='utf-8')
        example = (ROOT / 'scripts' / 'example.mjs').read_text(encoding='utf-8')
        self.assertIn('61999', runtime)
        self.assertIn('deployment.json', example)
        self.assertIn('ROOT', runtime)  # every path resolves from the project folder, not the cwd


class ExampleFixtureTests(unittest.TestCase):
    """Every shipped sample must stay executable by scripts/preview.py."""

    SAMPLES = ['feasible', 'reversed', 'conflict', 'unknown']
    EXPECTED_STATE = {'feasible': 'FEASIBLE', 'reversed': 'FEASIBLE',
                      'conflict': 'CONFLICT', 'unknown': 'REVIEW'}

    def test_each_example_has_a_recorded_interpretation(self):
        for name in self.SAMPLES:
            spec_path = ROOT / 'examples' / f'{name}.json'
            accepted_path = ROOT / 'examples' / f'{name}.accepted.json'
            self.assertTrue(spec_path.exists(), f'missing {spec_path}')
            self.assertTrue(accepted_path.exists(), f'missing {accepted_path}')

    def test_each_example_produces_the_documented_state(self):
        from host import c, host as runtime
        for name in self.SAMPLES:
            spec = json.loads((ROOT / 'examples' / f'{name}.json').read_text(encoding='utf-8'))
            accepted = json.loads((ROOT / 'examples' / f'{name}.accepted.json').read_text(encoding='utf-8'))
            runtime.queue = [json.dumps(accepted), json.dumps(accepted)]
            contract = c.TimeSeal()
            contract.records = {}
            contract.owners = {}
            key = contract.seal('sample', json.dumps(spec))
            record = json.loads(contract.analyze(key, 0))
            self.assertEqual(record['state'], self.EXPECTED_STATE[name], f'{name} drifted')

    def test_accepted_quotes_are_literal_substrings_of_their_clause(self):
        for name in self.SAMPLES:
            spec = json.loads((ROOT / 'examples' / f'{name}.json').read_text(encoding='utf-8'))
            accepted = json.loads((ROOT / 'examples' / f'{name}.accepted.json').read_text(encoding='utf-8'))
            for index, rule in enumerate(accepted['rules']):
                if rule['status'] != 'KNOWN':
                    continue
                self.assertIn(rule['quote'], spec['clauses'][index], f'{name} rule {index} ungrounded')

    def test_specifications_are_valid_json_with_the_exact_schema(self):
        for name in self.SAMPLES:
            spec = json.loads((ROOT / 'examples' / f'{name}.json').read_text(encoding='utf-8'))
            self.assertEqual(set(spec), {'title', 'events', 'horizon', 'clauses'})
            self.assertTrue(2 <= len(spec['events']) <= 6)
            self.assertTrue(1 <= len(spec['clauses']) <= 10)
            self.assertTrue(re.fullmatch(r'[a-z0-9-]+', name))


if __name__ == '__main__':
    unittest.main(verbosity=2)
