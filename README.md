# TimeSeal

**A GenLayer Intelligent Contract that decides whether a written elapsed-time plan can be true at once.**

TimeSeal seals an event roster together with the original source clauses of a handover plan, an installation
schedule or an incident timeline, interprets every clause through native GenLayer nondeterministic execution
with an independent validator, and then either derives the exact tight interval for every event pair or
retains a concrete contradiction proving the declarations cannot coexist. Only a schedule satisfying every
accepted constraint can be committed.

> Installation must happen 10–20 minutes after the start and opening 5–15 minutes after installation, so the
> opening window is exactly 15–35 minutes after the start. Adding *"opening no later than minute 4"* is a
> contradiction to be proven, not an instruction to quietly adjust the plan.

## Deployed

| | |
| --- | --- |
| Network | Stable Studionet |
| Chain ID | **61999** |
| Contract | **[`0x4EE33A9172f54869C0feA7314074dD7eB710A778`](https://explorer-studio.genlayer.com/address/0x4EE33A9172f54869C0feA7314074dD7eB710A778)** |
| Source SHA-256 | `525246061490d4158301c7d71ec8d9327d8c615677989b1e82a8cb1e3668a608` |
| SDK | `genlayer-js@1.1.8` |
| Constructor / payable | none / none |

```sh
node scripts/verify.mjs     # 13 read-only checks, no wallet, non-zero exit on mismatch
```

Full record in [deployment.json](deployment.json) · details in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## This is a contract-only project

```
contracts/timeseal.py     the Intelligent Contract — the only deployable artifact
tests/host.py             scripted GenLayer runtime (leader + validator surfaces)
tests/test_timeseal.py    22 protocol and solver invariants
tests/test_deployment.py  9 repository-to-chain binding tests
examples/                 4 specifications + their recorded interpretations
scripts/                  verify · example · runtime · preview
docs/                     PROTOCOL · ARCHITECTURE · DEPLOYMENT · TESTING · OPERATIONS · SECURITY
deployment.json           the live deployment record
README.md                 this file
requirements-validation.txt   pinned genvm-linter
```

**To submit TimeSeal you submit this folder — and at minimum `contracts/timeseal.py`.** Nothing here
imports from the sibling `frontend/` directory at the repository root, and the contract has no frontend
dependency of any kind. This folder is self-contained: it builds nothing, bundles nothing and needs no
Node package to be verified.

## Mechanism

1. **`seal(tag, payload)`** fixes 2–6 named events, a finite minute horizon and 1–10 source clauses under the
   caller's namespace. The record ID is `<lowercase-sender>:<tag>`, the input is immutable, and replaying the
   exact same payload at an existing ID is idempotent.
2. **`analyze(record_id, expected_revision)`** runs a real leader/validator boundary. Every validator
   independently re-interprets the complete original clause set; consensus is the full canonical interval
   decision — status, endpoints and bounds for every clause — never a formatting check. Reversed but
   mathematically equivalent intervals agree. Malformed output, exceptions, ungrounded quotes or disagreement
   abort before any state mutation.
3. **The deterministic solver** converts accepted bounds into difference constraints. It either produces tight
   bounds for **every** event pair plus feasible earliest/latest schedules, or an indexed negative-weight cycle
   whose strictly negative sum proves inconsistency, with a witness naming the clauses and edge kinds involved.
   Any accepted `UNKNOWN` clause produces `REVIEW` instead.
4. **`reanalyze`** lets the owner re-read a `REVIEW` record, bounded to three attempts total. It is never
   available from `FEASIBLE`, `CONFLICT` or `COMMITTED`, so a proven contradiction can never be re-rolled.
5. **`commit_schedule`** checks a caller-selected complete schedule against the accepted bounds, re-derives
   the proof, matches the analysis digest, ownership and exact revision. Commitment is terminal. The contract
   never chooses times and never overrides a constraint.

## Quick start

Every command in this README and in `docs/` is run **from this folder** (`intelligent/`). From the
repository root, prefix each path with `intelligent/`, for example
`python3 -m unittest discover -s intelligent/tests -v`.

```sh
# layer 1 — 31 local invariants (no network, no wallet)
python3 -m unittest discover -s tests -v

# layer 2 — run a sample through the real contract code, offline
python3 scripts/preview.py examples/conflict.json

# layer 3 — read-only verification of the deployed contract
node scripts/verify.mjs

# optional static check of the standalone source
genvm-lint check contracts/timeseal.py --json
```

Step-by-step instructions, the full 31-test catalogue and a troubleshooting table are in
[docs/TESTING.md](docs/TESTING.md).

## Write path

```sh
export STUDIO_PRIVATE_KEY=0x...        # local signer only, never committed
export ENABLE_CHAIN_WRITES=61999       # explicit opt-in, no default, no fallback

node scripts/example.mjs seal '["handover","<specification JSON string>"]'
node scripts/example.mjs analyze '["0x<your-address>:handover",0]'
node scripts/example.mjs commit_schedule '["0x<your-address>:handover",1,"<analysis_hash>","[0,12,22]"]'
```

Record ID is `<your-lowercase-address>:<tag>` — not the contract address. Reads need no key at all:
`node scripts/example.mjs protocol`.

## Documentation

| File | Contents |
| --- | --- |
| [docs/PROTOCOL.md](docs/PROTOCOL.md) | input schema, consensus equivalence, exact solver, state machine, method table |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | line-by-line comparison against the reference implementation |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | deployed record, source parity, redeployment policy, acceptance criteria |
| [docs/TESTING.md](docs/TESTING.md) | three test layers, all 31 cases, sample catalogue, troubleshooting |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | reproduce, lint, read, write, accept |
| [docs/SECURITY.md](docs/SECURITY.md) | trust boundaries and what the contract does not prove |

## Limits

TimeSeal analyzes *public declarations*, not observed clocks, sensor data, authenticated external events or
current UTC time. A source author can lie. Independent validators and literal quotation anchors reduce
unsupported interpretation but cannot eliminate correlated model errors. Each clause must express one interval
on one event pair; calendar rules, uncertain durations and alternative schedules are not silently approximated.
Minute-domain boundaries are inclusive. A committed plan does not run a scheduler and does not guarantee that
any real-world event occurs.

## License

MIT
