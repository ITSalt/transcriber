# TECH-014 — Test Spec

## Acceptance tests

- renderPdf(sampleMarkdown) returns a non-empty Buffer whose first bytes match %PDF-
- Output PDF contains all four required section headers (Participants, Discussion Topics, Decisions, Action Items)
