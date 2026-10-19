import {
  CATEGORIES,
  CATEGORY_MAP,
  RSS_BASE,
  findItemBySlug,
  parseItemDetail,
  slugFromUrl,
  splitCompoundId,
  textFetch,
  writeError,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/**
 * Individual posting pages on weworkremotely.com return 403 (Cloudflare
 * challenge), so detail works by re-reading a category RSS feed and finding
 * the matching item - the same source `search` already read. A compound id
 * ("<category>/<slug>", as returned by `search`) fetches only that one
 * category. A bare slug or full URL doesn't carry a category, so this tries
 * each known category's feed in turn until it finds a match (bounded to the
 * ~10 categories in CATEGORY_MAP) - slower, but still a handful of requests,
 * not a crawl.
 */
export async function runDetail(opts: DetailOpts): Promise<number> {
  const compound = splitCompoundId(opts.id)
  let slug: string | null = null
  let categoriesToTry: string[]

  if (compound) {
    slug = compound.slug
    categoriesToTry = [compound.category]
  } else {
    slug = slugFromUrl(opts.id) ?? (opts.id.includes("/") ? null : opts.id)
    if (!slug) {
      writeError(
        `Could not parse a job slug from "${opts.id}" - pass a full posting URL, a bare slug, or a "<category>/<slug>" id from search results`,
        "BAD_ID",
      )
      return 1
    }
    categoriesToTry = CATEGORIES
  }

  try {
    for (const categoryKey of categoriesToTry) {
      const feedSlug = CATEGORY_MAP[categoryKey]
      const xml = await textFetch(`${RSS_BASE}/${feedSlug}.rss`)
      if (!xml) continue
      const block = findItemBySlug(xml, slug)
      if (!block) continue
      const job = parseItemDetail(block, categoryKey)
      if (!job) continue

      if (opts.format === "plain") {
        const lines = [
          job.title,
          `${job.company || "—"} · ${job.location || "—"}`,
          "",
          job.employmentType ? `Employment: ${job.employmentType}` : "",
          job.category ? `Category: ${job.category}` : "",
          job.date ? `Posted: ${job.date}` : "",
          job.expiresAt ? `Expires: ${job.expiresAt}` : "",
          "",
          job.description || "(no description)",
          "",
          `URL: ${job.url}`,
        ].filter((l) => l !== "")
        process.stdout.write(lines.join("\n") + "\n")
      } else {
        process.stdout.write(JSON.stringify(job, null, 2) + "\n")
      }
      return 0
    }

    writeError(
      "Posting not found in the current RSS feed window (it may have expired or fallen off the list - only the ~20-30 most recent postings per category are available)",
      "NOT_FOUND",
    )
    return 1
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
