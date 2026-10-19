# weworkremotely-cli

CLI for searching remote job postings on [We Work Remotely](https://weworkremotely.com). Zero runtime dependencies — just `bun` and `fetch`.

## Why this reads RSS instead of scraping HTML

We Work Remotely's HTML pages (homepage, sitemap, and individual posting pages) sit behind a Cloudflare JS challenge and return HTTP 403 to any plain fetch — including one with full browser headers. Its per-category RSS feeds do not, and each RSS item already carries the **full job description**, region/country, employment type, posting date, and expiry.

- **`search`** fetches one category's RSS feed and filters it client-side by keyword.
- **`detail`** re-fetches a feed and finds the matching item by its guid/link, since there is no working way to fetch a single posting page directly. A compound id from `search` (`<category>/<slug>`) narrows this to one request; a bare slug or URL tries each known category in turn.

See `../url-reference.md` for the full endpoint documentation and the verified category list.

## Commands

```bash
bun run src/cli.ts search --category customer-support --query "support" --format table
bun run src/cli.ts detail <category>/<job-slug> --format plain
```

## Install

```bash
bun install
bun run typecheck
bun run test
```

Personal use only — keep volume low, no bulk data collection.
