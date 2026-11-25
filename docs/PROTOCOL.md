# TimeSeal protocol

## Input

Exact JSON keys: `title`, `events`, `horizon`, `clauses`. The title is 3–120 characters; events are 2–6
distinct case-insensitive names of 1–50 characters; the horizon is an integer from 1 through 1,000,000 minutes;
there are 1–10 clauses of 10–800 characters. No additional properties and no duplicate JSON keys are accepted.
JSON is bounded at 100,000 characters; text must encode as valid UTF-8 and exclude unsupported control
characters.

Event 0 is the reference origin. All event times are integers in `[0, horizon]`, and time 0 is fixed at zero.
These are protocol assumptions stated by the contract, not facts inferred from the source prose.

## Consensus and equivalence

Each clause independently becomes a `KNOWN` interval `lo ≤ t[b] − t[a] ≤ hi`, or `UNKNOWN`. One side may be
unbounded (`null`, or an omitted bound field), but both may not be unbounded. Endpoints must be different
events. Each finite bound is an exact integer minute in `[−1,000,000, 1,000,000]`. Quoted excerpts must occur
literally in their own clause.

An explicit `UNKNOWN` may omit null-valued endpoint/bound fields and its empty quote; these normalize to the
full canonical null/empty shape. It may not carry non-null endpoints or bounds. Missing status, unknown keys
and malformed `KNOWN` objects fail the call rather than degrading into `UNKNOWN`.

Intervals are canonicalized to `a < b`: reversing direction negates and exchanges the upper and lower bounds.
Independent interpretations must agree on the complete ordered sequence of status, endpoints and bounds. The
nondeterministic return is canonical JSON text, which avoids cross-sandbox container-type differences. Schema
checking alone is never used as consensus.

Ambiguity is an accepted business outcome. Malformed output, model exceptions, ungrounded anchors and
disagreement abort **before** storage mutation; they never become `UNKNOWN` or a partially trusted
certificate. Contradictory but explicit bounds stay `KNOWN` so the deterministic solver can expose the
conflict.

The contract calls `gl.vm.run_nondet_unsafe` with a real independent validator. The network supplies Optimistic
Democracy, validator selection, voting, leader rotation, appeals and finality. The application does not
synthesize those events and does not substitute local mocks.

## Exact solver

An upper bound creates edge `a → b` with weight `hi`; a lower bound creates edge `b → a` with weight `−lo`.
Horizon and non-negativity edges bind every event to the origin. An edge always means `t[to] ≤ t[from] + weight`.

Bellman-Ford looks for a negative cycle. The stored witness lists the edge indices, verifies matching
endpoints and a strictly negative sum, and now also reports the participating clause indices and edge kinds.
That closed chain of inequalities is a concrete contradiction inside the supplied model — not necessarily a
minimum-cardinality explanation.

When the system is consistent, Floyd-Warshall computes every tight upper bound `D[a][b]`. The exact attainable
interval for `t[b] − t[a]` is `[−D[b][a], D[a][b]]`. Earliest times are `−D[i][0]`; latest times are `D[0][i]`.
Both full vectors are re-checked against every original numeric edge before they are stored. Integer weights
make both extrema attainable in this integer-minute model.

## State machine

```
                 ┌────────────────────────────── reanalyze (owner, attempts < 3) ──────────────┐
                 ▼                                                                             │
  seal ──► SEALED ── analyze ──┬──► FEASIBLE ── commit_schedule ──► COMMITTED (terminal)       │
                               ├──► CONFLICT   (negative cycle, never reassessed)              │
                               └──► REVIEW ────────────────────────────────────────────────────┘
```

| Method | Arguments in order | Rules |
| --- | --- | --- |
| `protocol` | none | Public JSON: version, chain, limits, states, methods, interpretation rules |
| `get_record` | `record_id:string` | Public JSON record; empty string if absent |
| `list_records` | `owner:string` | Owner's record IDs, maximum 24 |
| `tight_bound` | `record_id:string,a:int,b:int` | Public JSON interval for one event pair; `NOT_FOUND`, `EVENT_INDEX`, `NOT_ANALYZED`, `NOT_FEASIBLE` |
| `seal` | `tag:string,payload:string` | Caller-owned ID `<lowercase-address>:<tag>`; immutable input; exact replay is idempotent |
| `analyze` | `record_id:string,expected_revision:int` | Owner only; `SEALED`; produces `FEASIBLE`, `CONFLICT` or `REVIEW` |
| `reanalyze` | `record_id:string,expected_revision:int` | Owner only; `REVIEW` only; at most 3 total attempts; same three outcomes |
| `commit_schedule` | `record_id:string,expected_revision:int,analysis_hash:string,times_json:string` | Owner only; `FEASIBLE`; exact accepted digest; complete valid schedule |

`seal` stores revision 0. Each successful `analyze` or `reanalyze` increments the revision and the attempt
counter. `commit_schedule` increments the revision again. Every write after `seal` requires the exact current
revision, so a stale client cannot overwrite a newer certificate. Tags are 3–32 lowercase letters, digits or
hyphens. A different payload at an existing ID is rejected with `ID_CONFLICT`.

The analysis hash commits to version, record ID, immutable input hash, accepted interpretations, the entire
proof and the attempt number. Commitment re-derives the proof from the stored input and accepted rules and
checks every schedule edge before storing the schedule and its digest. A failed call leaves the record
untouched. Ownership is the actual transaction sender, never a caller-supplied address. There is no
administrator override, no transfer, no token, no delegated signature and no external scheduler mutation.
