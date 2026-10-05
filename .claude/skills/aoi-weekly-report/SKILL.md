---
name: aoi-weekly-report
description: Write or update the AOI_CVBased weekly progress report from repository evidence using the project's Thursday-to-Wednesday reporting cycle. Use for AOI 週報、每週進度、weekly update, or the scheduled Wednesday report; do not use for implementing or validating application code.
---

# AOI Weekly Report

Create a concise, auditable Traditional Chinese weekly report for the TileScope AOI repository, or revise an existing report for reviewability. The reporting week is always Thursday 00:00 through Wednesday 23:59 in `Asia/Taipei`.

## Reporting period

- For 「這週／本週」, choose the Thursday-to-Wednesday period containing the current date. Save the file as `weekly_reports/WEEKLY_UPDATE_YYYY-MM-DD_to_YYYY-MM-DD.md`.
- When generated before Wednesday ends, keep Wednesday as the period end date but state the actual evidence cutoff time. Do not imply later Wednesday activity was included.
- Match the section style and wording level of the newest existing `weekly_reports/WEEKLY_UPDATE_*.md` unless the user requests another format. If migrating an older repository, move root-level `WEEKLY_UPDATE_*.md` files into `weekly_reports/` first.

## Evidence

Use read-only repository evidence:

- Git log bounded to the exact local-time period: commit date, subject, daily counts, changed files, and aggregate insertions/deletions.
- Dated completed items in `Todo.md` (the `完成紀錄` entries).
- Relevant README, release notes, and report files changed during the period.
- Current branch, `HEAD`, `origin/main`, tags, and clean/dirty status when useful.

Prefer recorded verification evidence from the commits and `Todo.md`. Phrase it as validation recorded at the related change, not as a fresh rerun. Do not turn commit subjects into unsupported claims: distinguish code changes, documentation, release preparation, packaged artifacts, and externally published releases.

## Default report format (reviewable)

Order the report for a reviewer who must verify it quickly:

1. **三行摘要** — exactly three lines: `已完成` (done) / `尚待完成` (remaining) / `需決策` (decisions needed). One sentence per line.
2. **成果表** — `| 成果 | 證據 (commit/Todo) | 狀態 |` where 狀態 is one of `已驗證` / `僅靜態檢查` / `待實機`. Every row cites a commit hash or a dated `Todo.md` entry.
3. **審查重點** — decisions pending, risks, and compatibility caveats a reviewer must notice (release/GPU/CUDA/CCD scope as applicable).
4. **每日紀錄** — one section per day (or a compact range for no-commit days) ordered Thursday→Wednesday; one sentence per line.
5. **相關提交** — every commit in the period, chronological, one line each.
6. **尚待完成** — open `Todo.md` items and limitations explicitly evidenced by the repository.

Use consistent terms: `已驗證` for a change whose checks actually ran, `僅靜態檢查` for source/static-only work, `待實機` for hardware-dependent work that has not run on the target machine. Explicitly note dates with no commits. Do not count the weekly report's own creation as work completed during the period.

## 修內文模式 (revision mode)

When asked to 修內文 / revise an existing report for reviewability:

1. Rewrite the existing report into the default format above **without adding unsupported claims**.
2. Map every claim to a commit hash or a dated `Todo.md` entry; a claim with no such backing is marked `待確認`, never silently deleted.
3. Recompute numbers (commit counts, file/change totals, test counts) from `git`/`Todo.md`; list any corrections against the original report.
4. Output a revision summary (what changed, what was re-derived, what is now `待確認`).
5. Commit as `Revise weekly report for <period>`.
6. No application validation, exactly as for a fresh report.

## No application validation

Weekly-report-only work does not authorize or require `pytest`, test collection, `compileall`, builds, CUDA checks, GUI/CLI smoke tests, packaging, benchmarks, or other application execution. Do not run them. It is acceptable to run the skill validator when the skill itself is being created or changed.

Use only lightweight report checks: confirming dates, commit totals, Markdown structure, file naming, staged scope, and `git diff --check` limited to the report or skill files. Do not modify `Todo.md`, tag, package, or publish a release unless the user explicitly asks.

## Commit and push

Weekly reporting includes committing and pushing the completed report to `main` → `origin/main` by default. This is a specific exception to any general rule that excludes generated reports from version control.

- Preserve unrelated or user-owned working-tree changes.
- Stage only the new or updated `weekly_reports/` file, intentional weekly-report directory moves, and weekly-report skill documentation changed by the same request. Never use `git add .`.
- Inspect the staged diff and run a staged whitespace check. Do not run application validation.
- Use a concise commit message such as `Add weekly report for YYYY-MM-DD to YYYY-MM-DD` or `Revise weekly report for YYYY-MM-DD to YYYY-MM-DD`.
- Verify the repository and push target, push the current `main` commit to `origin/main`, and confirm local `HEAD` equals `origin/main`.
- Check whether GitHub Actions started for the pushed commit and report its status, but do not replace the skipped local application validation with an extra manual program run.

## Handoff

Save the Markdown file in `weekly_reports/`, commit and push the scoped report changes, report its absolute path and commit hash, summarize the top outcomes (or the revision summary in 修內文模式), and state that AOI program validation was intentionally not rerun under this reporting rule.
