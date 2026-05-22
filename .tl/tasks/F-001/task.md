# F-001 — RFC: future release protocol under strict mode

**Type:** follow-up (post-W11 GAP-closure)
**Status:** open
**Created:** 2026-05-22
**Owner:** project lead (operator)

## Source

`followup_task` field of signed exception
[`EXC-2026-05-22-v020-historical-skipped-pr.yaml`](../../exceptions/EXC-2026-05-22-v020-historical-skipped-pr.yaml).
That exception covers ONLY the historical v0.2.0 release (frozen-in-history,
expiry `2026-05-18T23:59:59Z`) and provides no carve-out for any future
release. As of 2026-05-22 the exception window is already past, so every
release after v0.2.0 needs either:
- a feature-branch + PR + green CI workflow (current `config.yaml.git.strategy = "feature-branch"`), OR
- a fresh per-release signed exception with `project_kind: prototype` declared (irreversibly downgrades the project).

Neither is currently codified as a release protocol. This RFC closes that gap.

## Deliverable

A written RFC at `.tl/rfcs/2026-future-release-protocol.md` (or equivalent
under project convention) covering at minimum:

1. **Release branch shape** — naming (`release/vX.Y.Z`?), source branch
   (main vs develop), merge target.
2. **PR requirements** — minimum reviewers, required green CI checks, what
   blocks merge.
3. **Signed-exception authoring rules** — when an exception is appropriate,
   what `affected_gates` are acceptable, who can author, who must approve,
   expiry-window maxima per gate-category (already documented in
   `.tl/exceptions/_template.yaml` binding rules).
4. **release-status.json discipline** — when entries are written, what
   `merge` / `ci` / `health` fields must say at each lifecycle stage.
5. **Direct-to-main exception path** — when, if ever, is direct-to-main
   acceptable for a non-prototype project? Concrete answer expected;
   "never" is acceptable.

## Deadline

`2026-05-18T23:59:59Z` per the exception's `expiry`. **This deadline is
already past** — the v0.2.0 exception is the only release-history coverage
the project has. Any release attempted under strict mode without this RFC
landed will require ad-hoc per-release exception authoring with weak
provenance. Treat as P0 priority for the next release planning conversation.

## Acceptance criteria

- RFC document committed to `.tl/rfcs/` (or `docs/rfcs/`).
- RFC linked from `.tl/exceptions/EXC-2026-05-22-v020-historical-skipped-pr.yaml`
  via a `followup_task_resolved` field.
- README / CLAUDE.md reference the RFC where they describe release flow.

## References

- `.tl/exceptions/EXC-2026-05-22-v020-historical-skipped-pr.yaml`
- `nacl-tl-release/SKILL.md` § Six Block Conditions (condition 6)
- `nacl-tl-core/references/config-schema.md` § project_kind carve-out semantics
- `.tl/gap-closure/2026-05-22-gap-register.yaml` — GAP-035
