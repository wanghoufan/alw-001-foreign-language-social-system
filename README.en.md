# Foreign-Language Social System (ALW-001)

[简体中文](./README.md)

A local-first social knowledge-base MVP for people who practice foreign-language
conversation: it keeps people profiles and interaction notes as plain Markdown files
you own, and gives them a review flow so important edits are confirmed before they land.
The local server listens only on `127.0.0.1` (your own machine). There are no external
dependencies, no accounts, no cloud sync, and no AI API calls.

## Quick start: run it locally

Requires Node.js 20+. The first run creates `SocialMate-Data` inside this project and
writes fictional demo people and templates; existing files are never overwritten.

```sh
node scripts/initialize-data.mjs
node server.mjs
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173) on this machine. To stop, press
`Ctrl+C` in the server terminal. If port 4173 is taken, pick a free one:

```sh
PORT=4174 node server.mjs
```

Data directory: `SocialMate-Data/` (inside the project root); override it with the
`SOCIALMATE_DATA_DIR` environment variable. The server binds only to the loopback
address — LAN access from a phone is not supported.

## Data and review

Markdown files are the single source of truth. Edits to a person's main profile must go
through the Review flow's preview and confirmation; if a candidate edit has become
outdated after its preview, it is rejected. Interaction records cannot be overwritten
through the review API. The demo person `Test-Anna` is entirely fictional; delete
`SocialMate-Data/People/Test-Anna` to remove her.

## Environment and verification

- Uses Node's built-in HTTP and file modules; no packages to install and no API keys.
- `node scripts/initialize-data.mjs` initializes the directory tree and templates.
- `node --test` runs the local-server acceptance tests.
- GitHub: `wanghoufan/alw-001-foreign-language-social-system` (private)

## Speaking-practice records

After each ChatGPT Live practice session, a downloadable complete Markdown (`.md`)
review file should be produced. The file name format is
`口语练习 YYYY-MM-DD - 场景短名 - Level N - 8位标识.md` (the prefix 口语练习 means
"speaking practice"); dates follow Asia/Shanghai; vertical bars and the formal
archive naming rules are not used here. After downloading, put the raw single-session
record into `SocialMate-Data/Practice/Sessions/`. Weekly and monthly analyses go into
`SocialMate-Data/Practice/Reviews/Weekly/` and `Monthly/` respectively, and each report
must cite the file names of the single-session records it is based on; raw records must
never be rewritten. Every single-session record keeps, as far as available: the dialogue
transcript, a practice overview, comprehension and responses, original sentences with
natural rewrites, interaction rhythm, reusable expressions, at most 3 actionable goals
for next time, and open questions. Transcripts must never be back-filled by invention,
and pronunciation must not be inferred from text alone.
