## Summary
`orch.py deliver --check` gate G5 blocks the second merge of the same work package. A package was delivered in two steps on purpose (expand/contract for a destructive DB migration: code first, `DROP COLUMN` in a separate deploy). After the first PR reached PROD, the session opened a second PR for the same package; `set <WP> status READY` → `review-start --round N` → `accept` → `merge add` → `deliver --check` printed:

```
| G5 | RED | the previous merge <WP> is ACCEPTED, not VERIFIED_TEST (or --after-failure D-n) |
```

## Environment
pepper-orchestrator 0.11.0 (marketplace pepperskills); Claude Code 2.1.292; Ubuntu 24.04 x86_64; bash; Python 3.12. Workspace: in-repo, one repository, area modules, sessions local, `merge_policy: sequential`, trusted delivery handed over by an owner decision.

## Command
```
orch.py deliver --check <WP>     # second PR of the same package, previous row of that package in the merge queue is "merged"
```

## Expected
Either the merge queue row keeps the status the package had when that row was merged (VERIFIED_TEST / PROD at that time), or G5 skips a previous merged row that belongs to the same package, or the documentation states that one package = one merge and a second merge needs a new package.

## Actual
G5 looks at the previous merged queue row (the same package) and compares the package's *current* status, which is ACCEPTED again for the second PR, so the gate can never pass without an `--after-failure D-n` decision, which is not a failure case.

## Workaround
Dropped the queued row (`merge drop`), set the package back to its true status (PROD), created a new package for the contract step with the same PR, accepted it against the existing review report, and delivered it with `deliver --apply`.

### Fingerprint
`G5 RED the previous merge is ACCEPTED, not VERIFIED_TEST`
