# Contributing to Banana Brigade

How work gets into this repository. The Git history is part of the assessment, so these rules keep it clear.

## Branches

- `main` always works: tests pass and the app builds.
- Every change starts on its own branch from `main`:

| Prefix | Use | Example |
|---|---|---|
| `feature/` | A new feature | `feature/campaign` |
| `fix/` | A bug fix or a behaviour change | `fix/lag-and-clear-ui` |
| `docs/` | Documentation only | `docs/readme-ci` |
| `test/` | Tests only | `test/daily-edge-cases` |

Use short lower-case names with hyphens.

```bash
git switch main && git pull
git switch -c feature/short-name
```

## Commits

- Small: one idea per commit. A commit should build and pass the tests.
- Message: one line in plain English, imperative mood, starting with a capital letter, no full stop, under
  about 72 characters. Say what the change does for the game or the player.
  - Good: `Add the Daily Banana Challenge with one attempt a day and day streaks`
  - Bad: `fixes`, `WIP`, `update stuff`
- Add a body (after a blank line) when the reason is not obvious.
- Never commit `.env`, `node_modules/`, `data/` or `client/dist/` (they are in `.gitignore`).
- Commits are authored as Sayub Shakya.

## Before merging

```bash
npm test
npm run build
```

Both must pass. GitHub Actions runs the same steps on every push and pull request.

## Merging

Merge with `--no-ff`, so the feature keeps its own bubble in `git log --graph`:

```bash
git switch main
git merge --no-ff feature/short-name
git branch -d feature/short-name
```

The merge message is Git's default: `Merge branch 'feature/short-name' into main`.

When working through GitHub, open a pull request instead, fill in the template, wait for the green CI check,
then merge with "Create a merge commit".

## Code-review checklist

Use this for every pull request or before every local merge.

**Works**
- [ ] `npm test` passes and new behaviour has a test.
- [ ] `npm run build` passes; the feature works in the browser.
- [ ] Errors are handled (Banana API down, bad input, lost connection).

**Secure**
- [ ] Identity comes from `req.session` or `socket.data`, never from the request body.
- [ ] Input is checked (types, ranges, allowed values) before it reaches the database.
- [ ] No puzzle solution reaches the browser before an answer.
- [ ] Protected routes use `requireLogin` or `requireAdmin`.
- [ ] No secrets in the code; settings come from `.env`.

**Clear**
- [ ] The file header says what the file does and carries the AI credit line.
- [ ] Names are clear; no dead code or stray `console.log`.
- [ ] New events are added to `docs/events.md`; new endpoints to `docs/api.md`.
- [ ] `CHANGELOG.md` has an entry under the next version.

## Releases

Releases use [Semantic Versioning](https://semver.org/) and **annotated tags** (they record who tagged, when,
and a message, unlike lightweight tags):

```bash
# 1. Update "version" in package.json and move the CHANGELOG entries under the new version.
# 2. Commit on a branch and merge into main as usual.
# 3. Tag the merge commit on main:
git switch main
git tag -a v1.0.0 -m "Banana Brigade 1.0.0: campaign, online play, daily challenge, docs and CI"
git push origin v1.0.0
```

Milestones from before 1.0.0 can be tagged on their merge commits in the same way, for example
`git tag -a v0.4-multiplayer b8b4252 -m "Online rooms over Socket.io, run by the server"` (already done for v0.1 to v0.5). List tags with `git tag -n`.

## AI-assisted code

Generative AI may be used for code (not for the assessment video). Every file it helped with carries this line
in its header comment: "Written with help from a generative AI coding assistant; reviewed by Sayub Shakya."
Code from other people or websites is credited in a comment where it is used.

_Written with help from a generative AI coding assistant; reviewed by Sayub Shakya._
