---
name: remoteok-search
version: 1.0.0
description: >
  Use this skill to search job listings on RemoteOK (remoteok.com), a large
  worldwide remote-work job board covering engineering, design, customer
  support, operations, marketing, sales, and admin/virtual-assistant roles.
  Postings span every region and many explicitly name accepted countries.
  Trigger phrases: remoteok, remote ok, remote ok jobs, worldwide remote jobs,
  "find me a remote job", "are there any remote <role> jobs", remote job board.
context: fork
allowed-tools: Bash(bun run .agents/skills/remoteok-search/cli/src/cli.ts *)
---

# RemoteOK Search Skill

Search real, live postings on [RemoteOK](https://remoteok.com), a large
worldwide remote-work job board with a broad functional spread (not
tech-only) and a large minority of postings open to Latin America.

## ⚠️ How search works here (read before using)

RemoteOK's public `/api` feed is a **fixed rolling window of its ~100 most
recent postings** — confirmed live: the `page` query parameter is a no-op and
returns byte-identical results, so there is no way to reach further back.
Each entry already carries title, company, location, date, tags, and a coarse
salary range.

- **`search`** fetches that feed and filters it **entirely client-side**
  (query, location, posting age). The feed's own `tags=` server-side filter
  exists but was unreliable during investigation — an unmatched tag
  sometimes returned zero results, sometimes a barely-filtered near-full
  page — so this skill never depends on it.
- **`detail`** fetches the actual posting page and parses its structured
  data for the full picture: description, employment type, structured
  salary, and the posting's real accepted-countries list
  (`applicantLocationRequirements`) — the field that determines eligibility,
  and more complete than the visible location text in some postings.

**Always run `detail` before treating a `search` result as qualified** — see
`url-reference.md` for the exact endpoints.

## ⚠️ Attribution required (RemoteOK API terms)

The `/api` response itself states these terms: *"Please link back... to the
URL on Remote OK and mention Remote OK as a source, so we get traffic back
from your site."* Any use of results beyond personal search (sharing a list,
publishing findings) should credit RemoteOK and link the posting's URL. This
is a stated legal condition of using the API, not a robots directive.

## When to use this skill

- Search RemoteOK's latest postings across every function, or scoped to a
  keyword (matched against title, company, and tags)
- Filter results by a location substring and by posting age
- Get the full detail of a specific posting, including its real accepted
  countries, employment type, structured salary, and deadline

## Commands

### Search job listings

```bash
bun run .agents/skills/remoteok-search/cli/src/cli.ts search [flags]
```

Key flags:

- `--query <text>` / `-q <text>` — keyword filter, matched client-side
  (case-insensitive substring) against title, company, and tags.
- `--location <text>` / `-l <text>` — filter against the location field.
  Most postings are `Worldwide` or blank (no stated geo restriction) — a
  genuine country name (e.g. `Brazil`) narrows to postings that name it
  explicitly.
- `--jobage <days>` — only postings within N days of today.
- `--page <n>` — page number (1-indexed, 20 results per page) over the
  **filtered** results — not a request for older postings; see the warning
  above.
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full posting detail

```bash
bun run .agents/skills/remoteok-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

Accepts the numeric id from a `search` result, a full posting URL, or a
`<slug>-<id>` fragment.

## Usage examples

```bash
# Customer support roles, last 14 days
bun run .agents/skills/remoteok-search/cli/src/cli.ts search -q "customer support" --jobage 14 --format table

# Operations/admin roles explicitly open to Brazil
bun run .agents/skills/remoteok-search/cli/src/cli.ts search -q operations -l Brazil --format table

# Search across every function (no --query)
bun run .agents/skills/remoteok-search/cli/src/cli.ts search --jobage 7 --format table

# Full detail for a specific posting
bun run .agents/skills/remoteok-search/cli/src/cli.ts detail 1137408 --format plain
bun run .agents/skills/remoteok-search/cli/src/cli.ts detail https://remoteok.com/remote-jobs/remote-software-deployment-engineer-kpi-solutions-1137408
```

## Output formats

| Format | Best for |
| -------- | ---------- |
| `json` | Default — programmatic use, passing ids to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single posting's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- No authentication required — both `/api` and posting pages are public and
  allowed by `robots.txt`.
- `search` only ever sees the current ~100-item rolling window — there is no
  way to search RemoteOK's older archive through this skill.
- `search`'s `tags` array is a real field from the API (unlike Djinni's RSS
  feed) and is included in results, but tags are broad and often loosely
  applied (many postings carry 15+ tags) — treat them as a hint, not a
  precise classification.
- `detail`'s `tags` field is always `[]` — the posting page's JSON-LD doesn't
  carry tags; use `search`'s tags for that.
- The CLI backs off on 429/5xx with jitter, matching the other portal skills
  in this repo.
