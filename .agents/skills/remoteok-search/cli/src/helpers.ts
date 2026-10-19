// Data source: RemoteOK's public JSON API (search) and job posting pages
// (detail). robots.txt (fetched 2026-09-21) disallows /?tags, /*?action=get_jobs,
// /*?url=, /track-ad, /l/, /@, and a handful of SEO-spam paths - none of which
// this skill touches. /api and /remote-jobs/<id> are both allowed.
//
// The /api feed is a **fixed rolling window of ~100 most-recent postings** -
// confirmed live: a `page` query param returns byte-identical results to page 1,
// so there is no way to reach further back than whatever the feed currently
// holds. The feed's own `tags=<slug>` filter parameter exists but behaved
// unreliably during investigation (an unmatched tag sometimes returned zero
// results, sometimes silently fell back to a barely-filtered ~full page) - so
// this skill never relies on it. `search` always fetches the plain unfiltered
// feed and does all query/location/jobage filtering client-side instead, which
// is slower per request but predictable and testable.
//
// The API's own first array element is not a job - it's a `{last_updated,
// legal}` object carrying RemoteOK's attribution terms ("please link back...
// and mention Remote OK as a source"). This is a real ToS condition, not a
// robots directive - SKILL.md and README.md both surface it.

export const API_URL = "https://remoteok.com/api"
export const SITE_BASE = "https://remoteok.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; remoteok-cli/1.0)"

/** Fetch text (JSON/HTML) with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function textFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

/** Strip the JobPosting's HTML description down to readable text with paragraph breaks. */
function cleanDescription(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  return decodeHtmlEntities(stripTags(withBreaks)).replace(/\n{3,}/g, "\n\n").trim()
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  tags: string[]
  salaryMin: number | null
  salaryMax: number | null
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  jobLocationType: string | null
  industry: string | null
  applicantCountries: string[] | null
  validThrough: string | null
  benefits: string[] | null
  workHours: string | null
}

/**
 * Parse the /api response body into job cards. The API's first element is a
 * `{legal, last_updated}` object, not a job - skipped by checking for a
 * "legal" key. Each entry is parsed independently so one malformed record
 * cannot break the rest.
 */
export function parseApiFeed(raw: string): JobCard[] {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []

  const results: JobCard[] = []
  for (const entry of data) {
    if (!entry || typeof entry !== "object" || "legal" in entry) continue
    const j = entry as Record<string, unknown>
    if (typeof j.id !== "string" && typeof j.id !== "number") continue
    const title = typeof j.position === "string" ? j.position : null
    const url = typeof j.url === "string" ? j.url : typeof j.apply_url === "string" ? j.apply_url : null
    if (!title || !url) continue

    const salaryMin = typeof j.salary_min === "number" && j.salary_min > 0 ? j.salary_min : null
    const salaryMax = typeof j.salary_max === "number" && j.salary_max > 0 ? j.salary_max : null

    results.push({
      id: String(j.id),
      title,
      company: typeof j.company === "string" && j.company.trim() ? j.company : null,
      location: typeof j.location === "string" && j.location.trim() ? j.location : null,
      date: typeof j.date === "string" ? j.date : null,
      url,
      tags: Array.isArray(j.tags) ? j.tags.filter((t): t is string => typeof t === "string") : [],
      salaryMin,
      salaryMax,
    })
  }
  return results
}

/** Case-insensitive substring match against title, company, or any tag. */
export function matchesQuery(card: JobCard, query: string): boolean {
  const q = query.toLowerCase()
  if (card.title.toLowerCase().includes(q)) return true
  if (card.company && card.company.toLowerCase().includes(q)) return true
  return card.tags.some((t) => t.toLowerCase().includes(q))
}

/** Case-insensitive substring match against the location field. Most postings are "Worldwide" or blank (fully remote, no geo restriction stated). */
export function matchesLocation(card: JobCard, location: string): boolean {
  return card.location ? card.location.toLowerCase().includes(location.toLowerCase()) : false
}

/** True if `date` falls within the last N days of `now`. Accepts any Date-parseable string. */
export function withinDays(date: string | null, days: number, now: Date = new Date()): boolean {
  if (!date) return true
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return true
  const ms = days * 24 * 60 * 60 * 1000
  return now.getTime() - parsed.getTime() <= ms
}

/** Extract the trailing numeric job id from a remoteok.com/remote-jobs/<slug>-<id> (or bare <id>) URL. */
export function idFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const segments = u.pathname.split("/").filter(Boolean)
    const last = segments[segments.length - 1]
    if (!last) return null
    const m = last.match(/(\d+)$/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** Accept a bare numeric id, a full posting URL, or a "<slug>-<id>" fragment. */
export function normalizeId(input: string): string | null {
  const fromUrl = idFromUrl(input)
  if (fromUrl) return fromUrl
  if (/^\d+$/.test(input)) return input
  const m = input.match(/(\d+)$/)
  return m ? m[1] : null
}

/** The bare-id form always 301-redirects to the full slug URL (confirmed live) - no need to know the slug. */
export function buildDetailUrl(id: string): string {
  return `${SITE_BASE}/remote-jobs/${id}`
}

/**
 * Parse the posting page's schema.org JobPosting JSON-LD block. The page
 * embeds more than one ld+json script (an Organization block, plus the
 * JobPosting) - this scans all of them and picks the one typed JobPosting.
 */
export function parseJobPostingJsonLd(html: string): Record<string, unknown> | null {
  const scriptRe = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
  let m: RegExpExecArray | null
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1])
      if (data && data["@type"] === "JobPosting") return data
    } catch {
      continue
    }
  }
  return null
}

export function parseJobDetail(html: string, id: string): JobDetail | null {
  const ld = parseJobPostingJsonLd(html)
  if (!ld) return null

  const url = buildDetailUrl(id)
  const hiringOrg = ld.hiringOrganization as { name?: string } | undefined
  const applicantReqs = ld.applicantLocationRequirements as { name?: string }[] | undefined
  const applicantCountries = Array.isArray(applicantReqs)
    ? applicantReqs.map((r) => r.name).filter((n): n is string => Boolean(n))
    : null

  const baseSalary = ld.baseSalary as
    | { value?: { minValue?: number; maxValue?: number } }
    | undefined
  const salaryMin = typeof baseSalary?.value?.minValue === "number" ? baseSalary.value.minValue : null
  const salaryMax = typeof baseSalary?.value?.maxValue === "number" ? baseSalary.value.maxValue : null

  return {
    id,
    title: typeof ld.title === "string" ? ld.title : "(untitled)",
    company: hiringOrg?.name ?? null,
    location:
      applicantCountries && applicantCountries.length > 0
        ? applicantCountries.join(", ")
        : typeof ld.jobLocationType === "string"
          ? ld.jobLocationType
          : null,
    date: typeof ld.datePosted === "string" ? ld.datePosted : null,
    url,
    tags: [], // not present in the JSON-LD block - see `search` results for tags
    salaryMin,
    salaryMax,
    description: typeof ld.description === "string" ? cleanDescription(ld.description) : null,
    employmentType: typeof ld.employmentType === "string" ? ld.employmentType : null,
    jobLocationType: typeof ld.jobLocationType === "string" ? ld.jobLocationType : null,
    industry: typeof ld.industry === "string" ? ld.industry : null,
    applicantCountries,
    validThrough: typeof ld.validThrough === "string" ? ld.validThrough : null,
    benefits: Array.isArray(ld.jobBenefits) ? (ld.jobBenefits as string[]) : null,
    workHours: typeof ld.workHours === "string" ? ld.workHours : null,
  }
}
