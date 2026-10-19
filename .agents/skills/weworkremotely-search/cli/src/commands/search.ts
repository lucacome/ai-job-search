import {
  CATEGORY_MAP,
  RSS_BASE,
  textFetch,
  parseCategoryFeed,
  withinDays,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  category: string
  query?: string
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function matchesQuery(card: JobCard, query: string): boolean {
  const needle = query.toLowerCase()
  return (
    card.title.toLowerCase().includes(needle) ||
    (card.company || "").toLowerCase().includes(needle)
  )
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const id = c.id.slice(0, 40).padEnd(40)
    const title = (c.title || "").slice(0, 34).padEnd(34)
    const company = (c.company || "—").slice(0, 20).padEnd(20)
    const date = (c.date || "—").slice(0, 16)
    return `${id} ${title} ${company} ${date}`
  })
  const header =
    "ID".padEnd(40) + " " + "TITLE".padEnd(34) + " " + "COMPANY".padEnd(20) + " " + "DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const feedSlug = CATEGORY_MAP[opts.category]
    const xml = await textFetch(`${RSS_BASE}/${feedSlug}.rss`)
    let cards = parseCategoryFeed(xml, opts.category)

    if (opts.query) cards = cards.filter((c) => matchesQuery(c, opts.query!))
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
          .map((c) => `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`)
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: paged.length, page: opts.page, totalInCategory: cards.length }, results: paged },
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
