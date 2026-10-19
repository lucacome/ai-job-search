# We Work Remotely URL Reference

Public, unauthenticated endpoints used by this skill. Checked 2026-09-20.

> **robots.txt** (`https://weworkremotely.com/robots.txt`) allows `/` broadly,
> disallowing only `/admin/`, `/account/`, `/job-seekers/account/`,
> `/job-seekers/profile/`, `/manage-company/`, and token-bearing edit/cancel
> links. None of that overlaps with what this skill reads. **Separately**,
> the site's HTML pages — the homepage, `/sitemap.xml`, and individual
> `/remote-jobs/<slug>` posting pages — sit behind a Cloudflare JS challenge
> and return HTTP 403 to a plain `fetch`, confirmed with both an honest UA and
> full browser headers. This is bot-mitigation, not a robots.txt disallow, and
> this skill does not attempt to work around it (no headless browser, no
> challenge-solving service) — it simply never requests those pages.

## Search — category RSS feed

```
GET https://weworkremotely.com/categories/<category-slug>.rss
```

Confirmed live (HTTP 200) category slugs, mapped to the short `--category`
values this CLI accepts:

| `--category` value | RSS slug |
| --- | --- |
| `programming` | `remote-programming-jobs` |
| `full-stack-programming` | `remote-full-stack-programming-jobs` |
| `front-end-programming` | `remote-front-end-programming-jobs` |
| `back-end-programming` | `remote-back-end-programming-jobs` |
| `devops-sysadmin` | `remote-devops-sysadmin-jobs` |
| `customer-support` | `remote-customer-support-jobs` |
| `design` | `remote-design-jobs` |
| `sales-and-marketing` | `remote-sales-and-marketing-jobs` |
| `management-and-finance` | `remote-management-and-finance-jobs` |
| `product` | `remote-product-jobs` |

This list can't be scraped from the site's own category index (blocked, see
above) — it's the set of slugs directly probed and confirmed. There may be
more; `remote-data-jobs`, `remote-all-other-jobs`, and
`remote-business-support-jobs` were tried and returned a bare 301 with no
`Location` header (not valid slugs, or renamed).

**Admin/VA-type roles have no dedicated category.** `management-and-finance`
carries some operations/ops-coordinator titles alongside finance/accounting
roles (skews senior — lots of "Head of", "Director", "Manager" titles) but
there's no exact match for a dedicated "virtual assistant" category the way
Dynamite Jobs has one.

Returns RSS 2.0 XML. Each `<item>` carries, per posting:

| Field | Meaning |
| --- | --- |
| `<title>` | `"<Company>: <Job Title>"` — split on the *first* `": "` |
| `<region>`, `<country>`, `<state>` | Location fields (often only `<region>` is populated, e.g. "Anywhere in the World") |
| `<category>` | WWR's own category label (e.g. "Customer Support") |
| `<type>` | Employment type (e.g. "Full-Time") |
| `<description>` | **Full** job description, HTML **entity-escaped** (not CDATA) — needs `decodeHtmlEntities` once to get real HTML, then tag-stripping, then a second `decodeHtmlEntities` pass for entities that were nested inside the escaped markup (e.g. `&amp;nbsp;` → `&nbsp;` → a space) |
| `<pubDate>` | RFC-822 posting date |
| `<expires_at>` | RFC-822 expiry — the closest thing to an application deadline |
| `<guid>` / `<link>` | Both point at `https://weworkremotely.com/remote-jobs/<slug>` (unreachable directly, see above — the slug is still useful as an id) |

No pagination parameter — a feed returns its current window of the most
recent postings (roughly 25-30 seen live in `customer-support`). The CLI
paginates client-side over whatever the feed currently holds.

## Detail — re-read the category feed

There is no working single-posting endpoint (the HTML page 403s). `detail`
re-fetches a category feed and finds the `<item>` whose `<link>`/`<guid>`
slug matches. A compound id (`<category>/<slug>`, as returned by `search`)
narrows this to one request. A bare slug or full URL has no category
attached, so the CLI tries each of the ~10 known categories in turn until it
finds a match — bounded, not a crawl, but slower than the compound-id path.

A posting that has scrolled out of its category's current RSS window (no
pagination, remember) is genuinely unreachable via `detail` — this returns
`NOT_FOUND`, not a bug.

## Notes

- No authentication required.
- The CLI backs off on 429/5xx with jitter, matching the other portal skills
  in this repo.
- Country-agnostic in principle (RSS is RSS), but WWR itself is a
  US/English-centric global-remote board — categories and postings are
  overwhelmingly English-language.
