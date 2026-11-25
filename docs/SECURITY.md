# Security boundaries

The transaction sender owns each record. Owner-scoped IDs, immutable input, exact integer revisions and the
accepted analysis digest prevent a different wallet, a stale client or an altered proof from committing a
schedule. Every submitted schedule is re-checked against all accepted numeric edges; a stored `FEASIBLE` label
alone never authorizes arbitrary times. `COMMITTED` is terminal.

All public prose is untrusted. It is serialized under a fixed prompt, constrained to a bounded schema and
independently interpreted. The validator re-interprets the entire original clause set and compares every
canonical rule. Accepted anchors are replaced by the complete original clauses, so they can never become
model-authored explanations. Source anchoring does not prove semantic truth: correlated model errors and a
malicious source author remain possible. No automatic acceptance follows an instruction embedded in the source,
a model confidence score or well-formed JSON.

A business `UNKNOWN` is distinct from a model failure. Failed parsing, exceptions, ungrounded anchors and
disagreement must not mutate state. Unknown rules block complete analysis. Explicit contradictory rules are
preserved and cannot be softened to obtain a passing schedule. The contract can reveal a real inconsistency
only inside the supplied model; it cannot authenticate a clock or an event.

`reanalyze` is the only path that re-runs consensus after the first analysis. It requires the owner, requires
state `REVIEW`, and is capped at three attempts. It is unreachable from `FEASIBLE`, `CONFLICT` and
`COMMITTED`, so a proven contradiction can never be re-rolled into a passing certificate, and a committed
schedule can never be reopened. Each attempt is recorded in the record and bound into the analysis hash.

Numeric computation uses integer difference constraints, never floating-point tolerance. Domain edges bind
every event to `[0, horizon]`. Negative-cycle witnesses are checked for continuity and a strictly negative
sum; feasible extrema are re-checked against every edge before storage. The independent verifier in
`scripts/` recomputes shortest paths with a separate routine rather than importing the contract.

No payable entry point, asset transfer, external command, HTTP request, administrator bypass or time source
is present. Declaration text is public and must not contain secrets. The protocol does not guarantee scheduler
liveness, exact wall-clock timing or real-world event completion.
