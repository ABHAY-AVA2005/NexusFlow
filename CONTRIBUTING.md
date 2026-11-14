# Contributing Guide

## Branching and merge policy

- `main` is only for progress tracking and holds the final merged code.
- Each member has a dedicated branch: `abhay-team-lead`, `tanvi-frontend`, `abhishek-audio`, and `kajal-backend`.
- Members work only in their own branch and never on someone else's branch.
- Only the Team Lead (Abhay) merges branch work into `main`.
- Members open a weekly pull request from their own branch to `main`.

## Commit rules

- Commit message format: `type: short meaning`
- Valid types: `feat`, `fix`, `docs`, `test`, `chore`, `perf`, `refactor`
- Examples:
  - `feat: add POST /telemetry bulk endpoint`
  - `docs: add graph schema to README`
- Valid commits include code, docs, README updates, config changes, assets, and merge commits.
- Invalid commits include empty commits, one-character noise, repeated identical commits, auto-generated spam, and unrelated content.
- Never commit `.env` files or secrets.

## Daily workflow

```bash
git checkout <your-branch>
git pull origin <your-branch>
# make code or docs changes
git add .
git commit -m "type: short meaning"
git push origin <your-branch>
```

- Commit before 9 PM every day, including weekends.
- If blocked, commit something meaningful such as docs, tests, cleanup, or a daily log update.
- If a member is unresponsive for 48 hours, report it and continue working.

## Review and merge

- The Team Lead reviews pull requests before merging.
- `main` must remain stable and merge-ready.
- Weekly pull requests keep progress reviewable and visible to the team.
