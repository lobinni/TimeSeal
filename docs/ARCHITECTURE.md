# Architecture: reference implementation vs TimeSeal

Both contracts share one architectural spine — seal → interpret under consensus → solve deterministically →
commit under authorization — because that spine is correct for the problem. This document records every
difference, function by function, so the delta is auditable rather than implied.

Sizes: reference `contracts/windowproof.py` **270 lines / 21 defs**; TimeSeal `contracts/timeseal.py`
**341 lines / 25 defs** (byte-identical to the deployed artifact, CRLF — see [DEPLOYMENT.md](DEPLOYMENT.md)).

## Surface comparison

| Reference (line) | TimeSeal (line) | Change |
| --- | --- | --- |
| `need` L23 | `need` L35 | identical contract, docstring added at module level |
| `pack` L28 | `pack` L40 | unchanged |
| `unique` L32 | `unique` L44 | unchanged |
| `decode` L40 | `decode` L52 | unchanged |
| `sha` L45 | `sha` L57 | unchanged |
| `text` L49 | `text` L61 | unchanged |
| `specification` L55 | `specification` L67 | unchanged limits: title 3–120, 2–6 events, horizon 1–1,000,000, 1–10 clauses of 10–800 |
| `interpretation` L72 | `interpretation` L84 | unchanged validation and canonicalization; comment clarified |
| `signature` L105 | `signature` L119 | unchanged |
| `agrees` L109 | `agrees` L123 | unchanged; docstring states that consensus is the complete decision, not a format check |
| `edges_for` L118 | `edges_for` L133 | **hardened**: skips non-`KNOWN` rules explicitly instead of relying on the caller |
| `negative_cycle` L131 | `negative_cycle` L149 | unchanged Bellman-Ford witness extraction with continuity and weight invariants |
| `valid_schedule` L162 | `valid_schedule` L181 | unchanged |
| — | `witness` **L190** | **new**: derives the clause indices and edge kinds participating in the negative cycle |
| `derive` L170 | `derive` L197 | CONFLICT result now carries `witness`; FEASIBLE result unchanged |
| `class WindowProof` L200 | `class TimeSeal` L228 | renamed; owner limit promoted to `OWNER_LIMIT` constant |
| `protocol` L208 | `protocol` L238 | now also publishes `states`, `methods` and `attempts` so a client can bootstrap without hardcoding |
| `get_record` L212 | `get_record` L246 | unchanged |
| `list_records` L216 | `list_records` L250 | unchanged |
| — | `tight_bound` **L254** | **new view**: exact attainable interval for one event pair of an analyzed record |
| `_owned` L219 | `_owned` L268 | unchanged: sender-derived ownership plus exact revision check |
| `seal` L228 | `seal` L277 | same namespace, idempotency, `ID_CONFLICT` and `OWNER_LIMIT`; record gains `attempts: 0` |
| — | `_assess` **L294** | **new**: the shared analyze/reanalyze body, extracted so both paths run identical consensus and hashing code |
| `analyze` L244 | `analyze` L316 | thin wrapper over `_assess`; same `SEALED` precondition |
| — | `reanalyze` **L322** | **new**: owner-authorized re-reading of a `REVIEW` record, capped at `MAX_ATTEMPTS = 3` |
| `commit_schedule` L260 | `commit_schedule` L330 | identical four gates (feasible, digest, re-derived proof, valid schedule); revision now increments instead of being hardcoded to 2 |

## What was deliberately kept

* **Sealed, immutable input.** The roster and the original clauses never change after `seal`; corrections are
  a new tag. Interpretation can never be pointed at edited prose.
* **Anchored quotes.** Every accepted rule's quote is replaced by the complete original clause, so a model
  cannot substitute its own explanation for the source.
* **Consensus on the whole decision.** Validators compare the ordered sequence of every canonical rule, which
  makes reversed-but-equivalent intervals agree while any numeric drift fails.
* **Deterministic, integer-only arithmetic.** Difference constraints, no floating point, no tolerance.
* **Terminal commitment.** `COMMITTED` cannot be reopened, reassessed or overwritten.
* **No payable entry point, no admin, no external call, no HTTP, no time source.**

## What was added, and why

1. **`reanalyze` with an attempt cap.** The reference made analysis irreversible: an ambiguous clause left the
   record permanently in `REVIEW` with no path forward other than a new tag. TimeSeal allows the owner to ask
   for a second reading, but only from `REVIEW`, never from a proven `CONFLICT` or a passing `FEASIBLE`, and
   never more than three times. This removes a dead end without introducing a way to re-roll a contradiction.
2. **`witness` on conflicts.** A negative cycle is machine-verifiable but hard to read. Naming the participating
   clause indices and edge kinds lets a client point at the exact declarations that cannot hold together, and it
   costs one `set` comprehension on an already-computed cycle.
3. **`tight_bound(record_id, a, b)` view.** Callers previously had to download the entire proof and index
   `tight_intervals` themselves. A single pair lookup is the common case for a timeline UI and is read-only.
4. **Extracted `_assess`.** `analyze` and `reanalyze` must produce byte-identical certificates for identical
   inputs. One shared body removes the risk of the two paths drifting.
5. **Revision as a counter.** The reference hardcoded revision 1 after analysis and 2 after commit. TimeSeal
   increments on every state change, so `expected_revision` stays a meaningful optimistic-concurrency check if
   another state transition is ever added.
6. **Published `protocol()` surface.** `states`, `methods` and `attempts` are returned by the contract itself,
   so a client cannot fall out of sync with the deployed limits.

## What was removed

No reference-specific branding, deployed address, evidence journal, acceptance transaction hashes or
project-identifying constants remain anywhere in this repository. Version strings, record shape, method names
and documentation are all authored for TimeSeal.
