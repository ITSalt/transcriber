## Summary
The start prompt that `orch.py dispatch` generates for every local module session ends with a fixed block that orders the session to create or update a shared block in `CLAUDE.md` and `AGENTS.md` with `orch.py instructions status/sync`. This contradicts concept section 2 ("the orchestrator never asks a session to change CLAUDE.md"), ignores that `CLAUDE.md` is a declared `shared_paths` entry of the repository (a lock the package did not declare), and makes every session stop with a QUESTION.

## Environment
pepper-orchestrator 0.11.0 (marketplace pepperskills); Claude Code 2.1.292; Ubuntu 24.04.4 LTS x86_64; Python 3.12.3; bash. Workspace: in-repo (orch/<program> branch of a shared repository), one repository, 11 area modules, sessions local, permission_mode bypassPermissions, spec_graph nacl.

## Command
```
orch.py dispatch <WP> --dry-run
```
Tail of the printed start prompt:
```
Before implementing, read both CLAUDE.md and AGENTS.md (including existing case variants)
and the applicable nested instruction files. Preserve all existing client-specific text.
If one file is missing or shared blocks differ, prepare confirmed common project rules and
use orch.py instructions status/sync with both expected hashes. Update both shared blocks
when a common rule changes. Do not decide contradictory existing instructions yourself:
send QUESTION with the conflict. Run orch.py instructions check --repo . before READY.
Only the module session edits its repository's instructions; the coordinator never does.
```

## Expected
The prompt asks the session only to read the instruction files (and optionally run `instructions check` as advisory), or the pairing block is opt-in (an `orch.yaml` key) and respects `shared_paths`: a package that does not declare `CLAUDE.md` must not be told to edit it.

## Actual
Three of three dispatched sessions (a repository with `CLAUDE.md` and no `AGENTS.md`) stopped and sent `QUESTION`: the prompt orders `instructions sync`, but `CLAUDE.md`/`AGENTS.md` are outside their allowed paths and `CLAUDE.md` is a shared path without a lock. `orch.py instructions check` exits 1 with `synchronized=false` and no message, which the sessions read as a blocker for READY.

## Workaround
Orchestrator decision recorded in `decisions.md`: packages never touch `CLAUDE.md`/`AGENTS.md`; sessions run only `instructions check`, note `synchronized=false` in the PR Deviations; exit 1 is not treated as a gate (`review-start` and `deliver` do not read it).
