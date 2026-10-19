---
name: weworkremotely-search
version: 1.0.0
description: >
  Use this skill to search remote job listings on We Work Remotely
  (weworkremotely.com), a long-running global remote-jobs board covering
  programming, customer support, design, sales/marketing, and
  management/finance (including some operations and ops-coordinator roles).
  Trigger phrases: we work remotely, weworkremotely, remote customer support
  jobs, remote programming jobs, remote operations jobs, "find me a remote
  job", "are there any remote <role> jobs".
context: fork
allowed-tools: Bash(bun run .agents/skills/weworkremotely-search/cli/src/cli.ts *)
---

# We Work Remotely Search Skill

Search real, live postings on [We Work Remotely](https://weworkremotely.com), one of the oldest and best-known remote-jobs boards.

## ⚠️ How search works here (read before using)

We Work Remotely's HTML pages — the homepage, sitemap, and individual posting
pages — sit behind a Cloudflare JS challenge and return 403 to any plain
fetch, even with full browser headers. Its **per-category RSS feeds do not**,
and each feed item already carries the full job description. This skill:

- **`search`** reads one category's RSS feed, filtered client-side by
  keyword. There is **no free-text search across all categories in one
  call** — pick a category.
- **`detail`** re-reads a category feed to find a matching item (there is no
  reachable single-posting page). A compound id from `search`
  (`<category>/<slug>`) is fastest; a bare URL or slug tries each known
  category in turn.

See `url-reference.md` for the exact endpoints, the verified category list,
and parsing notes.

## ⚠️ Personal use only

This skill only reads paths `robots.txt` allows. Even so, keep volume low and
don't use this for bulk data collection or commercial purposes. Run it on
your own responsibility.

## When to use this skill

- Search for remote programming, customer support, design,
  sales/marketing, or management/finance (including some operations) roles
- Filter results by keyword within a category, and by posting age
- Get the full detail of a specific posting, including its expiry date

## Commands

### Search job listings

```bash
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts search --category <slug> [flags]
```

Key flags:

- `--category <slug>` / `-c <slug>` — **required.** One of: `programming`,
  `full-stack-programming`, `front-end-programming`, `back-end-programming`,
  `devops-sysadmin`, `customer-support`, `design`, `sales-and-marketing`,
  `management-and-finance`, `product`.
- `--query <text>` / `-q <text>` — keyword filter, matched client-side against
  each posting's title and company (case-insensitive substring).
- `--jobage <days>` — only postings whose RSS `pubDate` is within N days.
- `--page <n>` — page number (1-indexed, 20 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full posting detail

```bash
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts detail <category>/<slug>|<url>|<slug> [--format json|plain]
```

Accepts the compound id from a `search` result (`id` field, e.g.
`customer-support/wrike-account-manager-l4`), a full posting URL, or a bare
slug (the latter two search every known category until a match is found).

## Usage examples

```bash
# Customer support roles mentioning "support", last 14 days
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts search -c customer-support -q "support" --jobage 14 --format table

# Operations-flavored roles (WWR files these under management-and-finance)
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts search -c management-and-finance -q "operations" --format table

# Full detail for a specific posting, by compound id
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts detail customer-support/wrike-account-manager-l4 --format plain

# Full detail by URL (tries each known category until it finds a match)
bun run .agents/skills/weworkremotely-search/cli/src/cli.ts detail https://weworkremotely.com/remote-jobs/wrike-account-manager-l4
```

## Output formats

| Format | Best for |
| -------- | ---------- |
| `json` | Default — programmatic use, passing ids to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single posting's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- No authentication required — the RSS feeds are public.
- No structured `--location` filter beyond what's in the feed's
  region/country/state fields (often just "Anywhere in the World"); combine
  a place name into `--query` if you need to filter by it.
- No dedicated admin/virtual-assistant category — `management-and-finance` is
  the closest fit for operations/ops-coordinator roles, mixed in with
  finance/accounting and skewing senior.
- A feed holds only its current window of the most recent postings (no
  pagination at the source) — `detail` on a posting that has aged out returns
  `NOT_FOUND`, which is expected, not a bug.
- `date` (search and detail) and `expiresAt` (detail) are the contract
  `YYYY-MM-DD` date part of the feed's RFC-822 values, or `null` when the feed
  omits or malforms one — never the raw RFC-822 string, which `/scrape` cannot
  store as a `posted_date`.
- The CLI backs off on 429/5xx with jitter, matching the other portal skills
  in this repo.
