#!/usr/bin/env bun
// Self-contained CLI for searching job postings on RemoteOK (remoteok.com). No
// external CLI framework, so it runs anywhere `bun` is available with zero
// install beyond the repo clone.
//
// `search` reads the site's public /api feed - a fixed rolling window of the
// ~100 most recent postings across every category, no deeper pagination
// possible (confirmed live: the `page` param is a no-op). All filtering
// (query/location/jobage) happens client-side over that window. `detail`
// fetches the actual posting page (also public) and parses its schema.org
// JobPosting JSON-LD for the full picture, including salary and the real
// accepted-countries list.
//
// RemoteOK's API terms require attribution: link back to the posting on
// RemoteOK and credit "Remote OK" as the source wherever results are used.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", n: "limit", l: "location" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `remoteok-cli — search job postings on RemoteOK (remoteok.com)

Reads the site's public /api feed for search - a fixed rolling window of the
~100 most recent postings, no deeper pagination available - and the actual
posting page for detail (salary, accepted countries, employment type).

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Client-side keyword filter against title, company,
                           and tags (case-insensitive substring).
  --location, -l <text>   Client-side filter against the location field.
                           Most postings are "Worldwide" or blank (no stated
                           geo restriction) - see url-reference.md.
  --jobage <days>         Posted within N days (filters on the feed's date).
  --page <n>              1-indexed page over the filtered results (20/page).
  --limit, -n <n>         Cap results emitted (client-side, after filtering).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "customer support" --jobage 14 --format table
  bun run src/cli.ts search -q "operations" -l worldwide --format table
  bun run src/cli.ts detail 1137408 --format plain
  bun run src/cli.ts detail https://remoteok.com/remote-jobs/remote-software-deployment-engineer-kpi-solutions-1137408

Attribution required by RemoteOK's API terms: link back to the posting on
RemoteOK and credit "Remote OK" as the source wherever results are used.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "jobage", "page", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      process.stderr.write(
        JSON.stringify({
          error: `unknown flag --${key} for '${cmd}' - flags are never silently ignored, because a discarded filter changes what the search returns; see --help for the supported flags`,
          code: "UNKNOWN_FLAG",
        }) + "\n",
      )
      return 1
    }
  }

  const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
    const val = typeof raw === "string" ? Number(raw.trim()) : NaN
    if (!Number.isInteger(val) || val < 1) {
      process.stderr.write(
        JSON.stringify({ error: `--${name} must be a whole number of at least 1, got "${raw}"`, code: "BAD_ARG" }) + "\n",
      )
      return null
    }
    return val
  }

  if (cmd === "search") {
    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
      flags.jobage = String(v)
    }
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      flags.page = String(v)
    }
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      flags.limit = String(v)
    }

    const fmt = (flags.format as string) || "json"
    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : undefined,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
