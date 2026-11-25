# Reproducible use and verification

Python 3.12+ and Node.js 22+ are supported. Nothing in the contract project needs a frontend: every entry
point below is a CLI against `contracts/timeseal.py`.

## Local invariants

```sh
python3 -m unittest discover -s tests -v
```

The 31 tests substitute only the host and the model. They are not live consensus: they prove that the record
store, the consensus gate, the solver and the rejection paths behave exactly as documented, including against
an exhaustive integer-schedule oracle over 700 randomized constraint sets, and that the repository is bound to
the deployed source by `tests/test_deployment.py`. The full catalogue is in [TESTING.md](TESTING.md).

```sh
genvm-lint check contracts/timeseal.py --json
```

`genvm-linter==0.11.0` (see `requirements-validation.txt`) checks the pinned standalone source.
The `lint` stage runs on any Python 3.11+; the `validate` stage unpacks the pinned SDK and therefore needs
Python 3.12 or newer, where `TarFile.extractall(filter=...)` exists. On 3.11 the validator reports
`E101 Failed to load SDK` — an environment limitation of the tool, not a finding against the contract.

## Offline sample runs

```sh
python3 scripts/preview.py examples/feasible.json
python3 scripts/preview.py examples/reversed.json
python3 scripts/preview.py examples/conflict.json
python3 scripts/preview.py examples/unknown.json
python3 scripts/preview.py examples/feasible.json --commit
```

Each example ships its recorded interpretation as `examples/<name>.accepted.json`. The tool runs the real
`seal` and `analyze` code, prints the certificate — state, revision, analysis hash, earliest/latest
schedules, tight pair bound, conflict witness or unknown clause indices — and, with `--commit`, performs the
commitment against the earliest feasible schedule. No wallet, no RPC and no model call is involved; this is
how to check a new specification before paying for consensus.

## Read-only calls

```sh
npm ci

# 13 checks against the live contract: source parity, protocol surface, SDK pin
node scripts/verify.mjs
node scripts/verify.mjs 0x<your-address>:handover    # + one record read back

node scripts/example.mjs protocol
node scripts/example.mjs get_record '["0x<your-address>:handover"]'
node scripts/example.mjs tight_bound '["0x<your-address>:handover",0,2]'
node scripts/example.mjs list_records '["0x<your-address>"]'
```

Read calls need no wallet and submit no transaction. They read at `LATEST_FINAL`. The target address comes
from [`deployment.json`](../deployment.json): `0x4EE33A9172f54869C0feA7314074dD7eB710A778`.

## Write calls

```sh
export STUDIO_PRIVATE_KEY=0x...        # local signer only, never committed
export ENABLE_CHAIN_WRITES=61999       # explicit opt-in, no default, no fallback

node scripts/example.mjs seal '["handover","<specification JSON string>"]'
node scripts/example.mjs analyze '["0x<address>:handover",0]'
# wait for FINALIZED + SUCCESS, read the record back, then:
node scripts/example.mjs commit_schedule '["0x<address>:handover",1,"<analysis_hash>","[0,12,22]"]'
```

`examples/feasible.json` is a ready specification: serialize it as the second argument of `seal`. An ambiguous
record is re-read with `reanalyze` at its current revision, at most three attempts in total.

Each write is journalled in `.local/` before broadcast, so a timeout resumes the same transaction hash and
never resends an already successful call. A recorded `SUBMITTING` entry without a hash requires manual
reconciliation against the signer's transaction history; it is never retried automatically.

## Deployment

The contract is live at **`0x4EE33A9172f54869C0feA7314074dD7eB710A778`** on Stable Studionet, chain **61999**.
`deployment.json` holds the full record; [DEPLOYMENT.md](DEPLOYMENT.md) explains it.

```sh
node scripts/verify.mjs          # confirm repository == chain before anything else
node scripts/example.mjs deploy  # only when deployment.json is deliberately removed
```

The constructor takes no arguments and there is no payable entry point. `deploy` refuses to run while
`deployment.json` exists, so a second deployment requires removing the record on purpose. Every read and
write refuses to run if the on-chain source bytes no longer match the recorded hash.

Only Stable Studionet is permitted: chain **61999**, RPC `https://studio.genlayer.com/api`, SDK
**genlayer-js@1.1.8**. No alternate network, no fallback RPC, no value attached to any transaction.

## Acceptance checklist

For every positive step, require `FINALIZED`, `SUCCESS`, majority agreement, `NORMAL` execution mode and
`leader_only:false`, then read the record back at `latest-final` and confirm the expected business state:
`SEALED` after `seal`, then `FEASIBLE`, `CONFLICT` or `REVIEW` after `analyze`, then `COMMITTED` after
`commit_schedule`.

Expected negative steps must finalize with the exact named contract failure and leave the record byte-identical.
A rejection is never counted as a success. Undetermined consensus, a source mismatch or an unexpected state
stops the run. Technical or model failure is not business `REVIEW`.

## Frontend separation

The sibling `frontend/` directory at the repository root contains an optional read-only presentation layer
with its own [README](../../frontend/README.md). It imports nothing from this project, and this project
imports nothing from it. The root `src/` holds only a build entry that re-exports it.

Strip `frontend/` and `src/` entirely, or ship them in another repository — this folder, the 31 tests and
every script in `scripts/` are unaffected either way. Nothing in the submission set depends on a browser.
