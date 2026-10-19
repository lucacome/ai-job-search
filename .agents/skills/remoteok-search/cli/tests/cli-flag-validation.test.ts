import { describe, expect, test } from "bun:test"
import { runCLI } from "./helpers"

describe("remoteok CLI error contract", () => {
  test("detail without an id fails before making a request", async () => {
    const result = await runCLI(["detail"])
    expect(result.exitCode).toBe(1)
    const err = JSON.parse(result.stderr)
    expect(err.code).toBe("NO_ID")
  })

  test("detail with an unparsable id fails with BAD_ID", async () => {
    const result = await runCLI(["detail", "not-a-valid-id"])
    expect(result.exitCode).toBe(1)
    const err = JSON.parse(result.stderr)
    expect(err.code).toBe("BAD_ID")
  })

  test("an unknown flag is rejected rather than silently ignored", async () => {
    const result = await runCLI(["search", "--bogus", "x"])
    expect(result.exitCode).toBe(1)
    const err = JSON.parse(result.stderr)
    expect(err.code).toBe("UNKNOWN_FLAG")
  })

  test("--jobage=0 is rejected", async () => {
    const result = await runCLI(["search", "--jobage", "0"])
    expect(result.exitCode).toBe(1)
    const err = JSON.parse(result.stderr)
    expect(err.code).toBe("BAD_ARG")
  })

  test("--limit=0 is rejected", async () => {
    const result = await runCLI(["search", "--limit", "0"])
    expect(result.exitCode).toBe(1)
    const err = JSON.parse(result.stderr)
    expect(err.code).toBe("BAD_ARG")
  })
})
