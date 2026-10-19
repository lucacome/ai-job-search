import { describe, expect, test } from "bun:test"
import {
  parseApiFeed,
  matchesQuery,
  matchesLocation,
  withinDays,
  idFromUrl,
  normalizeId,
  buildDetailUrl,
  parseJobPostingJsonLd,
  parseJobDetail,
} from "../src/helpers.js"

const API_FIXTURE = JSON.stringify([
  { last_updated: 1789862431, legal: "API Terms of Service: link back to Remote OK." },
  {
    slug: "remote-customer-support-specialist-acme-1000001",
    id: "1000001",
    epoch: 1789804834,
    date: "2026-09-19T08:00:34+00:00",
    company: "Acme Inc",
    position: "Customer Support Specialist",
    tags: ["customer support", "saas", "non tech"],
    description: "<p>About Acme</p>",
    location: "Worldwide",
    apply_url: "https://remoteOK.com/remote-jobs/remote-customer-support-specialist-acme-1000001",
    salary_min: 40000,
    salary_max: 60000,
    url: "https://remoteOK.com/remote-jobs/remote-customer-support-specialist-acme-1000001",
  },
  {
    slug: "senior-golang-engineer-beta-1000002",
    id: "1000002",
    epoch: 1789718434,
    date: "2026-09-18T08:00:34+00:00",
    company: "Beta Corp",
    position: "Senior Golang Engineer",
    tags: ["golang", "backend", "senior"],
    description: "<p>About Beta</p>",
    location: "",
    apply_url: "https://remoteOK.com/remote-jobs/senior-golang-engineer-beta-1000002",
    salary_min: 0,
    salary_max: 0,
    url: "https://remoteOK.com/remote-jobs/senior-golang-engineer-beta-1000002",
  },
])

const DETAIL_PAGE_FIXTURE = `<!doctype html>
<html lang="en">
<head><title>Customer Support Specialist at Acme Inc – RemoteOK</title></head>
<body>
<script type="application/ld+json">{"@context":"http://schema.org","@type":"Organization","name":"Acme Inc"}</script>
<script type="application/ld+json">{"@context":"http://schema.org","@type":"JobPosting","title":"Customer Support Specialist","description":"About Acme<p>We help partners scale.</p>","datePosted":"2026-09-19T08:00:34+00:00","validThrough":"2026-12-18T08:00:34+00:00","employmentType":"FULL_TIME","industry":"SaaS","jobLocationType":"TELECOMMUTE","jobBenefits":["401k","vision_insurance"],"workHours":"Flexible","baseSalary":{"@type":"MonetaryAmount","currency":"USD","value":{"@type":"QuantitativeValue","minValue":40000,"maxValue":60000,"unitText":"YEAR"}},"applicantLocationRequirements":[{"@type":"Country","name":"Brazil"},{"@type":"Country","name":"United States"}],"hiringOrganization":{"@type":"Organization","name":"Acme Inc"}}</script>
</body>
</html>`

describe("parseApiFeed", () => {
  test("skips the legal/meta entry and parses job cards", () => {
    const cards = parseApiFeed(API_FIXTURE)
    expect(cards.length).toBe(2)
    expect(cards[0].id).toBe("1000001")
    expect(cards[0].title).toBe("Customer Support Specialist")
    expect(cards[0].company).toBe("Acme Inc")
  })

  test("normalizes blank location to null and zero salary to null", () => {
    const cards = parseApiFeed(API_FIXTURE)
    expect(cards[1].location).toBeNull()
    expect(cards[1].salaryMin).toBeNull()
    expect(cards[1].salaryMax).toBeNull()
  })

  test("keeps a genuine salary range", () => {
    const cards = parseApiFeed(API_FIXTURE)
    expect(cards[0].salaryMin).toBe(40000)
    expect(cards[0].salaryMax).toBe(60000)
  })

  test("returns [] for malformed JSON rather than throwing", () => {
    expect(parseApiFeed("not json")).toEqual([])
  })
})

describe("matchesQuery / matchesLocation", () => {
  const cards = parseApiFeed(API_FIXTURE)

  test("matches on title", () => {
    expect(matchesQuery(cards[0], "customer support")).toBe(true)
  })

  test("matches on tags when title doesn't match", () => {
    expect(matchesQuery(cards[1], "backend")).toBe(true)
  })

  test("no match returns false", () => {
    expect(matchesQuery(cards[0], "devops")).toBe(false)
  })

  test("location filter is case-insensitive substring", () => {
    expect(matchesLocation(cards[0], "world")).toBe(true)
  })

  test("null location never matches", () => {
    expect(matchesLocation(cards[1], "world")).toBe(false)
  })
})

describe("idFromUrl / normalizeId / buildDetailUrl", () => {
  test("extracts the trailing numeric id from a slug URL", () => {
    expect(idFromUrl("https://remoteok.com/remote-jobs/remote-customer-support-specialist-acme-1000001")).toBe(
      "1000001",
    )
  })

  test("normalizeId accepts a bare numeric id", () => {
    expect(normalizeId("1000001")).toBe("1000001")
  })

  test("normalizeId accepts a '<slug>-<id>' fragment", () => {
    expect(normalizeId("remote-customer-support-specialist-acme-1000001")).toBe("1000001")
  })

  test("normalizeId rejects garbage input", () => {
    expect(normalizeId("not-a-valid-id")).toBeNull()
  })

  test("buildDetailUrl produces a URL idFromUrl can parse back", () => {
    const url = buildDetailUrl("1000001")
    expect(idFromUrl(url)).toBe("1000001")
  })
})

describe("withinDays", () => {
  test("a date within the window passes", () => {
    const now = new Date("2026-09-20T00:00:00Z")
    expect(withinDays("2026-09-19T08:00:34+00:00", 14, now)).toBe(true)
  })

  test("a date outside the window fails", () => {
    const now = new Date("2026-09-20T00:00:00Z")
    expect(withinDays("2026-01-01T00:00:00+00:00", 14, now)).toBe(false)
  })

  test("a null date is never excluded", () => {
    expect(withinDays(null, 14)).toBe(true)
  })
})

describe("parseJobPostingJsonLd / parseJobDetail", () => {
  test("picks the JobPosting block among several ld+json scripts", () => {
    const ld = parseJobPostingJsonLd(DETAIL_PAGE_FIXTURE)
    expect(ld?.title).toBe("Customer Support Specialist")
  })

  test("parses company, countries, salary, and benefits from the JSON-LD", () => {
    const job = parseJobDetail(DETAIL_PAGE_FIXTURE, "1000001")
    expect(job?.company).toBe("Acme Inc")
    expect(job?.applicantCountries).toEqual(["Brazil", "United States"])
    expect(job?.location).toBe("Brazil, United States")
    expect(job?.salaryMin).toBe(40000)
    expect(job?.salaryMax).toBe(60000)
    expect(job?.benefits).toEqual(["401k", "vision_insurance"])
  })

  test("strips HTML tags from the description", () => {
    const job = parseJobDetail(DETAIL_PAGE_FIXTURE, "1000001")
    expect(job?.description).not.toContain("<p>")
    expect(job?.description).toContain("We help partners scale.")
  })

  test("returns null when no JobPosting block is present", () => {
    const html = `<script type="application/ld+json">{"@type":"Organization"}</script>`
    expect(parseJobPostingJsonLd(html)).toBeNull()
    expect(parseJobDetail(html, "1")).toBeNull()
  })
})
