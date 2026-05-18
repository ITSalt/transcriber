---
id: TECH-014
title: Puppeteer PDF renderer
type: tech
wave: 0
priority: high
depends_on: ['TECH-005']
---

# TECH-014 — Puppeteer PDF renderer

## What

Implement renderPdf(markdown, meta) -> Buffer that converts Markdown to PDF via Puppeteer. Output is transient: NEVER persisted (BRQ-017).

## Deliverables

- api/src/lib/pdf.ts: renderPdf({markdown, meta:{title, version}}) -> Buffer
- Uses headless Chromium; HTML template at api/src/lib/pdf/template.html with section styles for the four BRQ-011 sections
- Markdown rendered to HTML via remark/rehype before passing to Puppeteer
- Puppeteer launched in single-shot mode (close browser after each render)

## Verification

- renderPdf(sampleMarkdown) returns a non-empty Buffer whose first bytes match %PDF-
- Output PDF contains all four required section headers (Participants, Discussion Topics, Decisions, Action Items)

## Definition of done

- [ ] All deliverables produced.
- [ ] All verification checks pass.
- [ ] Pull request links to this task file by ID.
- [ ] No follow-up TODOs left in the codebase that block downstream UCs.
