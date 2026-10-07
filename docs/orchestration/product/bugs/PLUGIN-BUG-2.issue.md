## Summary
`orch.py report --check` can never write a record when the owner of the workspace's home-origin (or of a module repository) is the same GitHub organization that hosts the plugin: the report template itself contains the literal `ITSalt/PepperSkills`, the anonymizer maps the origin owner to `<home-origin-owner>` and the final leak scan then finds that word inside the plugin's own template text and refuses with "the report still looks private after anonymization (name from orch.yaml (6 characters))".

## Environment
pepper-orchestrator 0.11.0 (marketplace pepperskills); Claude Code 2.1.292; Ubuntu 24.04.4 LTS x86_64; Python 3.12.3; bash. Workspace: in-repo (orch/<program> branch of a shared repository), one repository, 11 area modules, sessions local, permission_mode bypassPermissions, spec_graph nacl.
The workspace's home repository and the module repository live under the same GitHub organization as the plugin.

## Command
```
orch.py report --check --command "orch.py dispatch --dry-run" --log min.log \
  --title "Start prompt orders instructions sync" \
  --expected-actual "expected: read-only check; actual: sync ordered" --workaround "decision: check only"
```
with `min.log` containing one line without any name. Output:
```
orch: the report still looks private after anonymization (name from orch.yaml (6 characters)); nothing was written: shorten --log or --command to the failing lines
```
Tracing `plugin_report.leaks` shows the match inside the generated record: `Текст для публикации в \`ITSalt/PepperSkills\` — \`bugs/PLUGIN-BUG-4.issue.md\``.

## Expected
The leak scan ignores the plugin's own constants (the target repository `ITSalt/PepperSkills`), or the template text is excluded from the scan, or the origin owner is not treated as private when it equals the plugin's organization.

## Actual
No record and no Issue can be produced by the tool; the hint "shorten --log or --command" cannot help because the leak is in the template.

## Workaround
Records `bugs/PLUGIN-BUG-n.md` and Issues written by hand (anonymized by the same rules) after an owner decision.
