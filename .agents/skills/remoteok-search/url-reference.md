# RemoteOK URL Reference

Public, unauthenticated endpoints used by this skill. Checked 2026-09-21.

> **robots.txt** (`https://remoteok.com/robots.txt`) disallows `/?tags`,
> `/*?action=get_jobs`, `/*?url=`, `/track-ad`, `/l/`, `/@` (profile pages),
> and a set of SEO-spam paths. None of that overlaps with what this skill
> reads: `/api` (search) and `/remote-jobs/<id>` (detail) are both allowed
> and confirmed live with a plain, honest User-Agent. The site also
> publishes an explicit AI/LLM-crawler policy block permitting listing and
> category pages while excluding profile pages — consistent with the
> general rules above.

## Search — JSON API

```
GET https://remoteok.com/api
```

Returns a JSON array. **The first element is not a job** — it's
`{"last_updated": <epoch>, "legal": "<API terms text>"}`, carrying
RemoteOK's attribution requirement (see SKILL.md). Every subsequent element
is a job posting with (at least):

| Field | Meaning |
| --- | --- |
| `id` | Numeric job id (as a string) |
| `position` | Job title |
| `company` | Company name |
| `location` | Free text, often `"Worldwide"` or empty (no stated geo restriction) |
| `date` | ISO 8601 posting date |
| `tags` | Array of free-text tags — broad and loosely applied (15-19 tags on some postings observed) |
| `salary_min` / `salary_max` | Integers, `0` when unstated (normalized to `null` by this skill) |
| `url` / `apply_url` | Both point at `https://remoteOK.com/remote-jobs/<slug>-<id>` in every case observed |

**Confirmed quirks from live investigation:**

- **Fixed ~100-item rolling window, no real pagination.** A `page=2` query
  parameter returns a byte-identical response to `page=1` (verified: same
  99 ids in the same order). There is no way to reach postings older than
  whatever the feed currently holds.
- **The `tags=<slug>` filter parameter is unreliable.** Some slugs filter
  correctly (`tags=operations` returned 98/98 matching entries;
  `tags=virtual-assistant` returned 99/99). Others degrade silently:
  `tags=admin` returned 99 entries but only 27 actually carried an `admin`
  tag (a near-unfiltered fallback), and `tags=customer-success` (a tag that
  doesn't exist in RemoteOK's vocabulary — the correct one is
  `customer support`, two words) returned **zero** results rather than
  falling back. Because a bad guess can silently return either "everything"
  or "nothing" with no error, this skill never sends the `tags` parameter at
  all — `search` fetches the plain feed and filters client-side instead,
  which is slower per call but has one predictable, testable behavior.
- Pretty tag-scoped paths (e.g. `/remote-customer-support-jobs.json`) exist
  and filter correctly for tags that match RemoteOK's vocabulary exactly,
  but share the same silent-degradation risk for a near-miss and are not
  used here for the same reason.

## Detail — job posting page

```
GET https://remoteok.com/remote-jobs/<id>
```

A bare numeric id **301-redirects** to the full slug URL
(`https://remoteok.com/remote-jobs/<slug>-<id>`) — confirmed live, so
`detail` never needs to know the slug. A nonexistent id returns **404**.

Server-rendered HTML containing two `<script type="application/ld+json">`
blocks: an `Organization` block and a `JobPosting` block (schema.org),
structurally similar to Djinni's and Dynamite Jobs' posting pages. Fields
used from the `JobPosting` block:

| JSON-LD field | Meaning |
| --- | --- |
| `title`, `description` (HTML — contains `<p>`/`<br>` tags, stripped to plain text with paragraph breaks by this skill) | Posting title and full body |
| `hiringOrganization.name` | Company name |
| `applicantLocationRequirements[].name` | **Full country names** (e.g. `"Brazil"`, not an ISO code) — unlike Djinni's alpha-3 codes, no lookup table needed |
| `baseSalary.value.minValue` / `.maxValue` | Structured salary range, when stated |
| `employmentType`, `industry`, `jobLocationType` | e.g. `FULL_TIME`, `Startups`, `TELECOMMUTE` |
| `jobBenefits` | Array of benefit slugs, e.g. `["401k", "vision_insurance"]` — lightly formatted, not prose |
| `workHours`, `datePosted`, `validThrough` | e.g. `"Flexible"`, posting date, deadline |

**No `tags` field in the JSON-LD** — that data only exists in the `/api`
search response, not on the posting page. `detail`'s `tags` is always `[]`.

## Notes

- No authentication required for either endpoint.
- The CLI backs off on 429/5xx with jitter, matching the other portal skills
  in this repo.
- RemoteOK is functionally broad (not tech-only) — customer support, ops,
  admin/VA, marketing, sales, and HR roles all appear regularly alongside
  engineering, unlike Djinni's tech-centric skew.
- Always check `detail`'s `applicantLocationRequirements` before treating a
  posting as eligible — `location` in `search` results is free text set by
  the poster and is not a reliable eligibility signal on its own (e.g.
  `"Worldwide"` sometimes still carries country restrictions only visible on
  the detail page).
