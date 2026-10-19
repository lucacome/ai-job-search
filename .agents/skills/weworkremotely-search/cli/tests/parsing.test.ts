import { describe, expect, test } from "bun:test"
import {
  parseCategoryFeed,
  parseItemDetail,
  findItemBySlug,
  slugFromUrl,
  buildCompoundId,
  splitCompoundId,
  withinDays,
  contractDate,
} from "../src/helpers.js"

const FEED_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss">
  <channel>
    <title>We Work Remotely: Customer Support Jobs</title>
    <link>https://weworkremotely.com/categories/remote-customer-support-jobs.rss</link>
    <description>We Work Remotely: Customer Support Jobs</description>
    <item>
      <title>Wrike: Account Manager L4</title>
      <region>Anywhere in the World</region>
      <country></country>
      <state></state>
      <skills></skills>
      <category>Customer Support</category>
      <type>Full-Time</type>
      <description>

&lt;p&gt;
  &lt;strong&gt;Headquarters:&lt;/strong&gt; US - Remote
&lt;/p&gt;
&lt;div&gt;Some role text.&amp;nbsp;More text.&lt;/div&gt;
</description>
      <pubDate>Sat, 19 Sep 2026 07:31:10 +0000</pubDate>
      <expires_at>Mon, 19 Oct 2026 07:31:10 +0000</expires_at>
      <guid>https://weworkremotely.com/remote-jobs/wrike-account-manager-l4</guid>
      <link>https://weworkremotely.com/remote-jobs/wrike-account-manager-l4</link>
    </item>
    <item>
      <title>No Colon Title Here</title>
      <region>US Only</region>
      <country></country>
      <state></state>
      <type>Contract</type>
      <description>&lt;p&gt;Short.&lt;/p&gt;</description>
      <pubDate>Thu, 10 Sep 2026 00:00:00 +0000</pubDate>
      <guid>https://weworkremotely.com/remote-jobs/no-colon-title-here</guid>
      <link>https://weworkremotely.com/remote-jobs/no-colon-title-here</link>
    </item>
  </channel>
</rss>`

describe("parseCategoryFeed", () => {
  test("parses items into job cards with compound ids", () => {
    const cards = parseCategoryFeed(FEED_FIXTURE, "customer-support")
    expect(cards.length).toBe(2)
    expect(cards[0].id).toBe("customer-support/wrike-account-manager-l4")
  })

  test("splits title into company and job title on the first ': '", () => {
    const cards = parseCategoryFeed(FEED_FIXTURE, "customer-support")
    expect(cards[0].company).toBe("Wrike")
    expect(cards[0].title).toBe("Account Manager L4")
  })

  test("falls back to null company when the title has no ': ' separator", () => {
    const cards = parseCategoryFeed(FEED_FIXTURE, "customer-support")
    expect(cards[1].company).toBeNull()
    expect(cards[1].title).toBe("No Colon Title Here")
  })

  test("combines region/country/state into a single location string", () => {
    const cards = parseCategoryFeed(FEED_FIXTURE, "customer-support")
    expect(cards[0].location).toBe("Anywhere in the World")
  })

  test("emits the contract YYYY-MM-DD date, not the raw RFC-822 pubDate", () => {
    const cards = parseCategoryFeed(FEED_FIXTURE, "customer-support")
    expect(cards[0].date).toBe("2026-09-19")
    expect(cards[1].date).toBe("2026-09-10")
  })
})

describe("parseItemDetail / findItemBySlug", () => {
  test("finds the matching item block by slug and parses full detail", () => {
    const block = findItemBySlug(FEED_FIXTURE, "wrike-account-manager-l4")
    expect(block).not.toBeNull()
    const job = parseItemDetail(block!, "customer-support")
    expect(job?.company).toBe("Wrike")
    expect(job?.employmentType).toBe("Full-Time")
    expect(job?.expiresAt).toBe("2026-10-19")
    expect(job?.date).toBe("2026-09-19")
  })

  test("double-decodes and strips the escaped HTML description", () => {
    const block = findItemBySlug(FEED_FIXTURE, "wrike-account-manager-l4")
    const job = parseItemDetail(block!, "customer-support")
    expect(job?.description).toContain("Headquarters: US - Remote")
    expect(job?.description).toContain("Some role text. More text.")
    expect(job?.description).not.toContain("&lt;")
    expect(job?.description).not.toContain("<p>")
  })

  test("returns null for a slug not present in the feed", () => {
    expect(findItemBySlug(FEED_FIXTURE, "does-not-exist")).toBeNull()
  })
})

describe("slug/id helpers", () => {
  test("slugFromUrl extracts the job slug", () => {
    expect(slugFromUrl("https://weworkremotely.com/remote-jobs/wrike-account-manager-l4")).toBe(
      "wrike-account-manager-l4",
    )
  })

  test("buildCompoundId / splitCompoundId round-trip", () => {
    const id = buildCompoundId("customer-support", "wrike-account-manager-l4")
    expect(splitCompoundId(id)).toEqual({ category: "customer-support", slug: "wrike-account-manager-l4" })
  })

  test("splitCompoundId rejects an unrecognized category prefix", () => {
    expect(splitCompoundId("not-a-category/some-slug")).toBeNull()
  })
})

describe("withinDays", () => {
  test("a date within the window passes", () => {
    const now = new Date("2026-09-20T00:00:00Z")
    expect(withinDays("Sat, 19 Sep 2026 07:31:10 +0000", 14, now)).toBe(true)
  })

  test("a date outside the window fails", () => {
    const now = new Date("2026-09-20T00:00:00Z")
    expect(withinDays("Thu, 01 Jan 2026 00:00:00 +0000", 14, now)).toBe(false)
  })

  test("a null date is never excluded", () => {
    expect(withinDays(null, 14)).toBe(true)
  })
})

describe("contractDate", () => {
  test("converts an RFC-822 pubDate to the contract YYYY-MM-DD", () => {
    expect(contractDate("Thu, 08 Oct 2026 07:31:21 +0000")).toBe("2026-10-08")
    expect(contractDate("Sat, 19 Sep 2026 07:31:10 +0000")).toBe("2026-09-19")
  })

  test("keeps the publisher's calendar day instead of shifting across timezones", () => {
    expect(contractDate("Fri, 16 Oct 2026 23:30:00 -0400")).toBe("2026-10-16")
  })

  test("pads a single-digit day", () => {
    expect(contractDate("Sun, 01 Feb 2026 00:00:00 +0000")).toBe("2026-02-01")
  })

  test("passes an already-ISO date through", () => {
    expect(contractDate("2026-10-08")).toBe("2026-10-08")
    expect(contractDate("2026-10-08T07:31:21Z")).toBe("2026-10-08")
  })

  test("returns null for absent or unparseable input instead of guessing", () => {
    expect(contractDate(null)).toBeNull()
    expect(contractDate(undefined)).toBeNull()
    expect(contractDate("")).toBeNull()
    expect(contractDate("ASAP")).toBeNull()
    expect(contractDate("08.10.2026")).toBeNull()
    expect(contractDate("Thu, 32 Oct 2026 07:31:21 +0000")).toBeNull()
  })
})
