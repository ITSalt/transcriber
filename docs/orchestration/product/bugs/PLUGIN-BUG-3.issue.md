## Summary
Lock collision "by glob" treats a repository-wide file glob such as `**/package.json` as colliding with any directory glob (`web/src/i18n/**`), because the two patterns could in theory match the same path (`web/src/i18n/package.json`), even though no such file exists in the repository and neither package creates one. Result: `dispatch` refuses the second package of a wave the plan explicitly runs in parallel.

## Environment
pepper-orchestrator 0.11.0 (marketplace pepperskills); Claude Code 2.1.292; Ubuntu 24.04.4 LTS x86_64; Python 3.12.3; bash. Workspace: in-repo (orch/<program> branch of a shared repository), one repository, 11 area modules, sessions local, permission_mode bypassPermissions, spec_graph nacl.

## Command
```
orch.py dispatch <WP-2>
```
after `dispatch <WP-1>` took the lock `**/package.json` (declared from the repository's `shared_paths`). Output:
```
dispatch refused: lock <repo-1>:**/package.json is held by <WP-1> (overlaps web/src/i18n/**)
queued: <WP-2> waits in the lock table for <repo-1>:**/package.json
```
`dispatch --dry-run` of both packages had passed before the first one was dispatched, so the plan gave no warning.

## Expected
Either (a) collisions are decided against the actual tree: a file-name glob and a directory glob collide only when a file matching both exists in the base (or is listed in the package), or (b) `overlap --planned` and `dispatch --dry-run` report the potential collision before any lock is taken, so the orchestrator can narrow the declaration while planning.

## Actual
The collision appears only at the second real dispatch; the only way out is to narrow the first package's declaration (to `api/package.json`, `web/package.json`, ...) and re-lock by hand.

## Workaround
Released the broad lock, re-declared the first package's shared paths as the concrete manifests, acquired those locks, dispatched the second package.
