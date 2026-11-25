# Deployment record

TimeSeal is deployed and verified on Stable Studionet. The machine-readable form of this page is
[`deployment.json`](../deployment.json); `scripts/verify.mjs` re-checks every line of it against the chain.

| Field | Value |
| --- | --- |
| Network | Stable Studionet |
| Chain ID | **61999** |
| RPC | `https://studio.genlayer.com/api` |
| SDK | `genlayer-js@1.1.8` |
| Contract address | **`0x4EE33A9172f54869C0feA7314074dD7eB710A778`** |
| Explorer | <https://explorer-studio.genlayer.com/address/0x4EE33A9172f54869C0feA7314074dD7eB710A778> |
| Source file | `contracts/timeseal.py` |
| Source SHA-256 | `525246061490d4158301c7d71ec8d9327d8c615677989b1e82a8cb1e3668a608` |
| Source size | 15,824 bytes / 341 lines / CRLF |
| Constructor | no arguments |
| Payable | no |
| Recorded at | 2026-11-25T03:59:31Z |

## Read back from the chain

```sh
# 13 read-only checks: source parity, protocol surface, SDK pin
node scripts/verify.mjs

# include one business record in the same run
node scripts/verify.mjs 0x<your-address>:handover

# any single view
node scripts/example.mjs protocol
node scripts/example.mjs list_records '["0x<your-address>"]'
node scripts/example.mjs get_record   '["0x<your-address>:handover"]'
node scripts/example.mjs tight_bound  '["0x<your-address>:handover",0,2]'
```

`verify.mjs` needs no wallet and submits nothing. A passing run looks like this:

```
PASS  deployed source sha256 matches deployment.json  — 525246061490d4158301c7d71ec8d9327d8c615677989b1e82a8cb1e3668a608
PASS  committed source is byte-identical to deployed source  — 52524606…
PASS  protocol.version  — "timeseal-1"
PASS  protocol.methods  — ["seal","analyze","reanalyze","commit_schedule"]
…
13/13 checks passed · 0x4EE33A9172f54869C0feA7314074dD7eB710A778 · chain 61999
```

It exits non-zero on the first disagreement, so it is safe to use in CI.

## Source parity

The committed `contracts/timeseal.py` is **byte-identical** to the bytes stored on chain. The artifact was
uploaded with CRLF line endings and one blank line after the dependency pragma; the repository keeps exactly
that form so a single SHA-256 identifies both sides. `tests/test_deployment.py` enforces this, and
`tests/host.py` loads the file through Python's universal-newline reader, so the in-memory source — and
therefore every derived analysis hash — is unaffected by the line endings.

Consequence: **do not reformat `contracts/timeseal.py`.** A stray line ending, an added docstring or an
editor's "format on save" will change the hash and fail the suite. That failure is the point — it means the
repository no longer describes the deployed contract.

## Redeployment policy

1. Never redeploy to "fix" a failing check. First determine whether the repository or the chain is wrong.
2. A real contract change means a new version string (`timeseal-2`), a fresh `deployment.json`, and a new
   address — old records stay bound to the old address and are not migrated.
3. `node scripts/example.mjs deploy` refuses to run while `deployment.json` exists, so an accidental second
   deployment is impossible without deliberately removing the record.
4. After any legitimate redeploy, update `deployment.json` from the new readbacks and re-run
   `python3 -m unittest discover -s tests` — `test_deployment.py` will fail until the record matches.
5. No alternate network and no fallback RPC is permitted anywhere in this repository.

## Acceptance criteria for a live write

Every write must satisfy all of the following before it is accepted evidence:

| Positive steps (`seal`, `analyze`, `reanalyze`, `commit_schedule`) | Negative steps (expected rejections) |
| --- | --- |
| status `FINALIZED` | status `FINALIZED` |
| execution result `SUCCESS` | execution result is the exact named failure, not `SUCCESS` |
| majority agreement (`resultName: MAJORITY_AGREE`) | majority agreement |
| `execution_mode: NORMAL` and `leader_only: false` | `execution_mode: NORMAL` and `leader_only: false` |
| decoded calldata matches signer, contract, method and arguments | decoded calldata matches |
| state read back at `latest-final` equals the expected business state | state read back is byte-identical to the pre-call state |

A rejection is never counted as a success. A technical or model failure is never business `REVIEW`.
