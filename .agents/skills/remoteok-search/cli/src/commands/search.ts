import {
  API_URL,
  textFetch,
  parseApiFeed,
  matchesQuery,
  matchesLocation,
  withinDays,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const id = c.id.padEnd(10)
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const location = (c.location || "—").slice(0, 15)
    return `${id} ${title} ${company} ${location}`
  })
  const header = "ID".padEnd(10) + " " + "TITLE".padEnd(40) + " " + "COMPANY".padEnd(22) + " " + "LOCATION"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const raw = await textFetch(API_URL)
    let cards = parseApiFeed(raw)

    if (opts.query) cards = cards.filter((c) => matchesQuery(c, opts.query!))
    if (opts.location) cards = cards.filter((c) => matchesLocation(c, opts.location!))
    if (opts.jobage !== undefined) cards = cards.filter((c) => withinDays(c.date, opts.jobage!))

    const pageSize = 20
    const start = (opts.page - 1) * pageSize
    let paged = cards.slice(start, start + pageSize)
    if (opts.limit !== undefined && opts.limit >= 0) paged = paged.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(paged) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        paged
          .map((c) => `${c.title} — ${c.company || "—"}\n  ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`)
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: paged.length, page: opts.page, totalFetched: cards.length }, results: paged },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
