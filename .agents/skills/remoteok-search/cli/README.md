# remoteok-cli

CLI for searching job postings on [RemoteOK](https://remoteok.com). Zero runtime dependencies — just `bun` and `fetch`.

## Why search and detail read different sources

RemoteOK's public `/api` endpoint (allowed by `robots.txt`) returns a fixed rolling window of its ~100 most recent postings — there is no working pagination beyond that (a `page` query param is a confirmed no-op). Each entry already carries title, company, location, date, tags, and a coarse salary range, but not the full description or the posting's real accepted-countries list.

- **`search`** fetches that feed and filters it entirely client-side (query, location, posting age) — the feed's own `tags=` filter parameter exists but behaved unreliably during investigation (an unmatched tag sometimes returned zero results, sometimes a barely-filtered near-full page), so this CLI never relies on it.
- **`detail`** fetches the actual posting page and parses its `schema.org JobPosting` JSON-LD block for the full picture: description, employment type, structured salary, and `applicantLocationRequirements` — the field that actually determines eligibility.

See `../url-reference.md` for the full endpoint documentation.

## Attribution (RemoteOK API terms)

The `/api` response's own first element states: *"Please link back... to the URL on Remote OK and mention Remote OK as a source, so we get traffic back from your site."* Any use of results outside personal search (sharing a list, publishing findings) should credit RemoteOK and link the posting's `url` field.

## Commands

```bash
bun run src/cli.ts search --query "customer support" --format table
bun run src/cli.ts detail <numeric-id> --format plain
```

## Install

```bash
bun install
bun run typecheck
bun run test
```
