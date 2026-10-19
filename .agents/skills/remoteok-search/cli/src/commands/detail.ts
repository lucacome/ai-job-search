import { buildDetailUrl, normalizeId, parseJobDetail, textFetch, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(
      `Could not parse a job id from "${opts.id}" - pass a full posting URL or the bare numeric id from search results`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const url = buildDetailUrl(id)
    const html = await textFetch(url)
    if (!html) {
      writeError("Posting not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id)
    if (!job) {
      writeError(
        "Could not find a JobPosting JSON-LD block on that page - the posting may have been taken down or the page markup changed",
        "PARSE_FAILED",
      )
      return 1
    }

    if (opts.format === "plain") {
      const salary =
        job.salaryMin !== null || job.salaryMax !== null
          ? `$${job.salaryMin ?? "?"} - $${job.salaryMax ?? "?"}`
          : null
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.industry ? `Industry: ${job.industry}` : "",
        job.jobLocationType ? `Location type: ${job.jobLocationType}` : "",
        salary ? `Salary: ${salary}` : "",
        job.workHours ? `Work hours: ${job.workHours}` : "",
        job.benefits && job.benefits.length > 0 ? `Benefits: ${job.benefits.join(", ")}` : "",
        job.date ? `Posted: ${job.date}` : "",
        job.validThrough ? `Valid through: ${job.validThrough}` : "",
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
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
