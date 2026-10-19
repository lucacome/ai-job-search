import { describe, expect, test } from "bun:test"
import { runCLI } from "./helpers"

describe("weworkremotely CLI error contract", () => {
  test("search without --category fails with JSON on stderr", async () => {
    const result = await runCLI(["search"])
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe("")
    const err = JSON.parse(result.stderr)
    expect(err.code).toBe("NO_CATEGORY")
  })

  test("search with an unknown category is rejected before any request", async () => {
    const result = await runCLI(["search", "--category", "not-a-real-category"])
    expect(result.exitCode).toBe(1)
    const err = JSON.parse(result.stderr)
    expect(err.code).toBe("BAD_CATEGORY")
  })

  test("detail without an id fails before making a request", async () => {
    const result = await runCLI(["detail"])
    expect(result.exitCode).toBe(1)
    const err = JSON.parse(result.stderr)
    expect(err.code).toBe("NO_ID")
  })

  test("an unknown flag is rejected rather than silently ignored", async () => {
    const result = await runCLI(["search", "--category", "customer-support", "--bogus", "x"])
    expect(result.exitCode).toBe(1)
    const err = JSON.parse(result.stderr)
    expect(err.code).toBe("UNKNOWN_FLAG")
  })

  test("--jobage=0 is rejected", async () => {
    const result = await runCLI(["search", "--category", "customer-support", "--jobage", "0"])
    expect(result.exitCode).toBe(1)
    const err = JSON.parse(result.stderr)
    expect(err.code).toBe("BAD_ARG")
  })
})
