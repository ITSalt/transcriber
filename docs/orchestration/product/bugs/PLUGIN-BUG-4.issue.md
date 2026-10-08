## Summary
Two `review_clone.sh` runs started concurrently by two reviewer subagents (different PRs, different `--sha`) reported the same work directory `/tmp/orch-review.XXXXXX` and the second run printed the first run's SHA (`clone: <repo> at <sha-A>` for `--sha <sha-B>`). The second agent then ran `git checkout <sha-B>` inside that directory while the first agent's tests were running there, so both first test runs had to be discarded.

## Environment
pepper-orchestrator 0.11.0 (marketplace pepperskills); Claude Code 2.1.292 with the Bash sandbox; Ubuntu 24.04.4 LTS x86_64; bash; shared `/tmp`. Workspace: in-repo, one repository, area modules, sessions local, two `orchestrator-reviewer` agents launched in one orchestrator message.

## Command
```
review_clone.sh --repo <url> --sha <sha-A> --setup ... --test ... --keep   # agent 1
review_clone.sh --repo <url> --sha <sha-B> --setup ... --test ... --keep   # agent 2, ~1 min later
```
Output of both: `clone: <url> at <sha-A>` and `kept: /tmp/orch-review.LQk4dw/repo`.

## Expected
`mktemp -d` gives each run its own directory; the clone is checked out exactly at `--sha`; a `--sha` mismatch after checkout is an error.

## Actual
One directory for two runs; the second run reported the first run's HEAD. Root cause not established: either the sandbox shares `/tmp` in a way that makes `mktemp` non-unique across subagents, or the script continues after a failed `git clone` into an existing non-empty directory and prints the HEAD of the existing clone (lines 36–51).

## Workaround
Run the second clone with `TMPDIR=<session scratchpad>/clones`, or do not run two `--keep` reviews concurrently. Suggested fix: verify the directory is empty after `mktemp`, abort on `git clone` failure, and after checkout compare `git rev-parse HEAD` with `--sha` (exit 2 on mismatch).
