# PLUGIN-BUG-5 — deliver G5 blocks a second merge of the same package (expand/contract)

| Поле | Значение |
|------|----------|
| Найден | 2026-10-09, deliver --check второго PR того же пакета (шаг contract после expand) |
| Окружение | pepper-orchestrator 0.11.0, Claude Code 2.1.292, Ubuntu 24.04, bash |
| Модуль | плагин: scripts/orch.py deliver, gate G5 (merge queue) |
| Серьёзность | medium (двухшаговая доставка одного пакета невозможна без обхода) |
| Статус | открыт, обход найден |
| Fingerprint | `G5 RED the previous merge is ACCEPTED, not VERIFIED_TEST` |
| Issue | https://github.com/ITSalt/PepperSkills/issues/36 |

## What happened

A package was delivered in two steps on purpose (expand/contract for a destructive DB migration):
round 1 merged and reached PROD; the session then opened a second PR for the same package
(contract step). After `set <WP> status READY` → `review-start --round 3` → `accept` → `merge add`,
`deliver --check` reported:

```
| G5 | RED | the previous merge <WP> is ACCEPTED, not VERIFIED_TEST (or --after-failure D-n) |
```

G5 looks at the previous merged queue row (the same package) and compares the package's *current*
status, which is ACCEPTED again for the second PR, so the gate can never pass without an
`--after-failure D-n` decision, which is not a failure case.

## Expected

Either the queue row keeps the status the package had when that row was merged (VERIFIED_TEST / PROD
at the time), or G5 skips a previous row that belongs to the same package, or the docs state that
one package = one merge and a second merge needs a new package.

## Workaround used

Dropped the queued row (`merge drop`), set the package back to its true status (PROD), created a new
package for the contract step with the same PR, accepted it against the existing review report, and
delivered it.

## Reproduction

1. Deliver a package (`deliver --apply`) and let it reach VERIFIED_TEST/PROD.
2. `set <WP> status READY`, `review-start <WP> --pr <second PR> --ref <sha> --round N`, `accept`, `merge add`.
3. `deliver --check <WP>` → G5 RED.

Issue in ITSalt/PepperSkills: see the Issue row above.
