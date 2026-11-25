"""Scripted host for local invariants only. Never a substitute for network consensus.

Simulates exactly the two GenLayer runtime surfaces the contract touches:
  * gl.nondet.exec_prompt  - leader interpretation, scripted through Host.queue
  * gl.vm.run_nondet_unsafe - observe/validate boundary, one validator comparison
"""
import importlib.util
import pathlib
import sys
import types


class Return:
    def __init__(self, calldata):
        self.calldata = calldata


class Host:
    def __init__(self):
        self.queue = []
        self.calls = 0
        self.message = types.SimpleNamespace(sender_address='0x' + '1' * 40)
        self.public = types.SimpleNamespace(view=lambda f: f, write=lambda f: f)
        self.Contract = object
        self.vm = types.SimpleNamespace(Return=Return, run_nondet_unsafe=self.run)
        self.nondet = types.SimpleNamespace(exec_prompt=self.prompt)

    def prompt(self, *args, **kwargs):
        self.calls += 1
        response = self.queue.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    def run(self, observe, validate):
        proposed = observe()
        if not validate(Return(proposed)):
            raise Exception('CONSENSUS_REJECTED')
        return proposed


host = Host()
module = types.ModuleType('genlayer')
module.gl = host
module.TreeMap = dict
module.__all__ = ['gl', 'TreeMap']
sys.modules['genlayer'] = module

root = pathlib.Path(__file__).resolve().parents[1]
path = next((root / 'contracts').glob('*.py'))
spec = importlib.util.spec_from_file_location('contract', path)
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)

A, B, C, D = ['0x' + str(i) * 40 for i in range(1, 5)]
