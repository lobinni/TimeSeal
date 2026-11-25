# Testing guide

TimeSeal is testable at three independent layers. None of them needs a wallet for the first two, and none of
them needs a model call at all — the interpretation step is always supplied as a recorded fixture.

All commands below run **from `intelligent/`**. From the repository root, prefix each path:
`python3 -m unittest discover -s intelligent/tests -v`,
`python3 intelligent/scripts/preview.py examples/conflict.json`,
`node intelligent/scripts/verify.mjs`.

```sh
# layer 1 — 31 local invariants, no network
python3 -m unittest discover -s tests -v

# layer 2 — run any shipped sample through the real contract code, offline
python3 scripts/preview.py examples/feasible.json
python3 scripts/preview.py examples/conflict.json

# layer 3 — read-only verification of the deployed contract
node scripts/verify.mjs

# optional static analysis of the standalone source
genvm-lint check contracts/timeseal.py --json
```

---

## Layer 1 — local invariants (31 tests)

`tests/host.py` installs a scripted `genlayer` module before the contract is imported. It reproduces exactly
two runtime surfaces: `gl.nondet.exec_prompt` (the leader call, fed from `Host.queue`) and
`gl.vm.run_nondet_unsafe` (the observe/validate boundary, which runs one independent validator comparison).
Everything else — schema validation, canonicalization, the solver, the record store — is the real contract
code. **This layer is not consensus.** It proves the contract's own invariants.

### `test_timeseal.py` — 22 tests

| # | Test | What it proves | Expected |
| --- | --- | --- | --- |
| 1 | `LifecycleTests.test_complete_lifecycle_and_tight_windows` | seal → analyze → commit; tight windows | `earliest [0,10,15]`, `latest [0,20,35]`, pair `(0,2)` = `{15,35}`, state `COMMITTED`, second commit rejected |
| 2 | `LifecycleTests.test_rejected_writes_leave_state_unchanged` | every rejection is non-mutating | 6 bad commits + foreign `OWNER_ONLY` raise and leave the record byte-identical |
| 3 | `LifecycleTests.test_seal_is_owner_scoped_and_immutable` | namespace and immutability | a second wallet gets its own ID; changed payload → `ID_CONFLICT`; bad tag → `TAG` |
| 4 | `ConsensusTests.test_direction_normalization_and_semantic_disagreement` | equivalence, not formatting | reversed interval agrees; a shifted bound disagrees; a non-`Return` never agrees |
| 5 | `ConsensusTests.test_model_failures_never_become_review` | failure ≠ ambiguity | `disagree` / `malformed` / `model_error` all raise; record untouched |
| 6 | `ConsensusTests.test_injection_disagreement_does_not_mutate` | prompt injection resistance | a clause that says "approve zero" cannot change the accepted bound |
| 7 | `ConsensusTests.test_explicit_unknown_and_conflict_stay_distinct` | `REVIEW` vs `CONFLICT` | unknown → `REVIEW`, commit blocked, `analyze` re-entry blocked; contradiction → `CONFLICT` with `cycle_sum < 0` and a witness |
| 8 | `ReanalyzeTests.test_review_can_be_reassessed_within_attempt_limit` | the one legal re-read | `REVIEW` → `reanalyze` → `FEASIBLE` at revision 2, then commit succeeds |
| 9 | `ReanalyzeTests.test_reanalyze_is_rejected_outside_review_and_after_limit` | anti-re-roll | blocked from `SEALED` and `FEASIBLE`; third attempt → `ATTEMPT_LIMIT` |
| 10 | `ReanalyzeTests.test_conflict_record_cannot_be_reassessed` | contradictions are final | `reanalyze` from `CONFLICT` → `NOT_REVIEW` |
| 11 | `ViewTests.test_tight_bound_requires_analysis_and_valid_indices` | view preconditions | `NOT_ANALYZED`, `NOT_FOUND`, `EVENT_INDEX`; correct pair values |
| 12 | `ViewTests.test_tight_bound_refuses_conflict_and_committed_states` | view honesty | `CONFLICT` → `NOT_FEASIBLE`; a committed record still returns its immutable bounds |
| 13 | `ViewTests.test_protocol_advertises_limits_and_states` | client bootstrap | version, chain 61999, attempt limit, `reanalyze` and `COMMITTED` all advertised |
| 14 | `SchemaTests.test_interpretation_schema_anchor` | anchor + type strictness | `bool`, `float`, invented quote, double unbounded, self endpoints, duplicate JSON key all rejected |
| 15 | `SchemaTests.test_specification_limits` | input bounds | non-integer horizon, case-duplicate events, empty clauses, extra keys rejected |
| 16 | `SchemaTests.test_owner_record_limit` | storage cap | 24 records then `OWNER_LIMIT` |
| 17 | `SolverTests.test_against_exhaustive_integer_schedule_oracle` | **solver correctness** | 700 random 3-event systems: `CONFLICT` ⇔ no integer schedule exists; `earliest`/`latest` are feasible and every tight interval equals the exhaustive min/max |
| 18 | `SolverTests.test_explicit_impossible_interval_and_horizon_conflict` | domain edges bite | `lo > hi` and `hi < 0` and horizon violations all produce a negative cycle |
| 19 | `SolverTests.test_unbounded_rule_is_rejected_before_solving` | solver never sees garbage | `lo = hi = null` → `UNBOUNDED_RULE` |
| 20 | `SdkJsonRegressionTests.test_sdk_returns_json_objects_without_string_decoding` | SDK shape tolerance | the validator may return a parsed object, not a string |
| 21 | `NullableJsonRegressionTests.test_explicit_unknown_allows_omitted_nulls_only` | UNKNOWN normalization | omitted nulls normalize; any non-null field or extra key fails |
| 22 | `NullableJsonRegressionTests.test_missing_unbounded_side_preserves_finite_bound` | omitted bound field | dropping `lo` keeps `hi = 20`, does not zero it |

### `test_deployment.py` — 9 tests

| # | Test | What it proves | Expected |
| --- | --- | --- | --- |
| 23 | `DeploymentRecordTests.test_deployment_record_is_present_and_well_formed` | the record exists and pins the network | Stable Studionet, 61999, pinned RPC and SDK, no constructor args, not payable |
| 24 | `DeploymentRecordTests.test_contract_address_is_the_deployed_one` | right address | `0x4EE33A9172f54869C0feA7314074dD7eB710A778`, hex-valid, present in the explorer URL |
| 25 | `DeploymentRecordTests.test_committed_source_is_byte_identical_to_the_deployed_source` | **repository = chain** | SHA-256 `52524606…`, byte and line counts match, CRLF throughout, single blank line after the pragma |
| 26 | `DeploymentRecordTests.test_protocol_readback_matches_the_contract_module` | record cannot drift from code | version, attempt cap, owner limit, states and ABI in the record equal the contract's own constants |
| 27 | `DeploymentRecordTests.test_scripts_reference_the_deployed_address` | tooling sanity | scripts pin 61999, read `deployment.json`, contain no reference to any other project |
| 28 | `ExampleFixtureTests.test_each_example_has_a_recorded_interpretation` | samples are runnable | all 4 specs ship a `*.accepted.json` |
| 29 | `ExampleFixtureTests.test_each_example_produces_the_documented_state` | samples do not drift | `feasible`→`FEASIBLE`, `reversed`→`FEASIBLE`, `conflict`→`CONFLICT`, `unknown`→`REVIEW` |
| 30 | `ExampleFixtureTests.test_accepted_quotes_are_literal_substrings_of_their_clause` | anchoring holds for fixtures | every `KNOWN` quote occurs literally in its own clause |
| 31 | `ExampleFixtureTests.test_specifications_are_valid_json_with_the_exact_schema` | fixtures obey the schema | exact key set, event and clause counts, slug-shaped file names |

---

## Layer 2 — offline sample runs

`scripts/preview.py` drives the real `seal` and `analyze` code with a recorded interpretation and prints the
certificate.

```sh
python3 scripts/preview.py examples/feasible.json
python3 scripts/preview.py examples/reversed.json
python3 scripts/preview.py examples/conflict.json
python3 scripts/preview.py examples/unknown.json
python3 scripts/preview.py examples/feasible.json --commit
```

| Sample | Expected `state` | What to look for |
| --- | --- | --- |
| `feasible.json` | `FEASIBLE` | `earliest [0,10,15]`, `latest [0,20,35]`, `tight_0_last {15,35}`, `suggested_commit_args` |
| `reversed.json` | `FEASIBLE` | identical bounds to `feasible` — the clauses are written backwards and were normalized |
| `conflict.json` | `CONFLICT` | `cycle_sum -11`, witness clauses `[0,1,2]`, kinds `LOWER + UPPER` |
| `unknown.json` | `REVIEW` | `unknown_clauses [1]` and the `reanalyze_args` pair |
| `feasible.json --commit` | `COMMITTED` | revision 2 plus a `schedule_hash` |

`--commit` submits nothing: it runs `commit_schedule` in memory against the earliest feasible schedule.

### Adding a sample

1. Write `examples/<name>.json` with exactly `title`, `events`, `horizon`, `clauses`.
2. Write `examples/<name>.accepted.json` — the canonical rules consensus would return, one per clause, in
   order. `KNOWN` needs `a`, `b`, `lo`, `hi`, `quote` with a literal excerpt; `UNKNOWN` is all nulls with an
   empty quote.
3. Add `<name>` to `ExampleFixtureTests.SAMPLES` and to `EXPECTED_STATE`.
4. Run the two commands above; the new case must appear in the count (31 → 32).

---

## Layer 3 — live verification and acceptance

```sh
node scripts/verify.mjs
node scripts/verify.mjs 0x<owner>:handover
```

13 read-only checks: network, deployed source hash and length, committed-source parity, every field of
`protocol_readback`, the SDK pin, and optionally one record read at `latest-final`. Non-zero exit on any
mismatch, so it can gate CI. See [DEPLOYMENT.md](DEPLOYMENT.md) for the full acceptance table that every
positive and negative transaction must satisfy.

### Write path, end to end

```sh
export STUDIO_PRIVATE_KEY=0x...
export ENABLE_CHAIN_WRITES=61999

node scripts/example.mjs seal '["handover","<specification JSON string>"]'
node scripts/example.mjs analyze '["0x<owner>:handover",0]'
# poll until FINALIZED + SUCCESS, read the record back, then:
node scripts/example.mjs commit_schedule '["0x<owner>:handover",1,"<analysis_hash>","[0,12,22]"]'
node scripts/example.mjs get_record '["0x<owner>:handover"]'
```

Every write is journalled under `.local/` before broadcast: a timeout resumes the same transaction hash and
never resends a successful call.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `E101 Failed to load SDK: TarFile.extractall()…` from `genvm-lint` | the validator needs Python 3.12+ | install Python 3.12, or rely on `lint` (which passes on 3.11) plus layer 1 and 3 |
| `test_committed_source_is_byte_identical…` fails after an edit | the file was reformatted or modified | `git checkout contracts/timeseal.py`, or redeploy deliberately and update `deployment.json` |
| `IndexError: pop from empty list` inside a test | the scripted model queue was not filled for that call | every `analyze` needs exactly two queued responses; see `tests/host.py` |
| `deployment.json` missing | record removed or never created | restore it; layer 1 and `scripts/verify.mjs` both require it |
| `Run node scripts/example.mjs deploy first` | no local deployment record | restore `deployment.json`; never redeploy just to satisfy a script |
| a write fails before finalization for lack of funds | the local signer holds no Stable Studionet balance | fund the local test signer; this project never transfers assets on your behalf |
