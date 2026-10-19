import { describe, test, expect } from "bun:test";
import { normalizeDeadline, type DateSource } from "../src/helpers";

describe("normalizeDeadline", () => {
  test("accepts a bare ISO date", () => {
    expect(normalizeDeadline("2026-11-06")).toBe("2026-11-06");
  });

  test("accepts an ISO timestamp and truncates to the date", () => {
    expect(normalizeDeadline("2026-11-06T15:32:16.256Z")).toBe("2026-11-06");
    expect(normalizeDeadline("2026-08-21T21:32:54-04:00")).toBe("2026-08-21");
  });

  test("rejects impossible calendar dates a regex alone would accept", () => {
    expect(normalizeDeadline("2026-02-30")).toBeNull();
    expect(normalizeDeadline("2026-13-01")).toBeNull();
  });

  test("never guesses: unparsable shapes degrade to null, not a coerced date", () => {
    // These are shapes real portals have shipped into stored data. Guessing a
    // date from any of them would retire or ignore a live posting on a date
    // nobody set.
    expect(normalizeDeadline("ASAP")).toBeNull();
    expect(normalizeDeadline("06.11.2026")).toBeNull();
    expect(normalizeDeadline("rolling")).toBeNull();
    expect(normalizeDeadline("2026-11")).toBeNull();
  });

  test("absent stays absent — null means 'no deadline published', not 'unknown'", () => {
    expect(normalizeDeadline(null)).toBeNull();
    expect(normalizeDeadline(undefined)).toBeNull();
    expect(normalizeDeadline("")).toBeNull();
    expect(normalizeDeadline("   ")).toBeNull();
  });

  test("a non-string is not coerced", () => {
    expect(normalizeDeadline(20261106 as unknown as string)).toBeNull();
    expect(normalizeDeadline({} as unknown as string)).toBeNull();
  });
});

describe("DateSource semantics", () => {
  // Greenhouse's public board API exposes no creation date at all — only
  // `updated_at`. That distinction is the whole reason this type exists: a req
  // last touched today can be years old, so anything reading `posted` as a
  // publication date without checking `date_source` will mis-age it.
  test("updated_at is a distinct value from a real publication date", () => {
    const updatedAt: DateSource = "updated_at";
    const created: DateSource = "created";
    const published: DateSource = "published";
    const released: DateSource = "released";

    expect(updatedAt).not.toBe(created);
    expect(updatedAt).not.toBe(published);
    expect(updatedAt).not.toBe(released);
  });

  test("null is a legal DateSource, for ATSes that publish no date at all", () => {
    // ats=generic scrapes tags out of HTML and recovers no date, so there is
    // nothing to disambiguate — recorded as null rather than guessed.
    const none: DateSource = null;
    expect(none).toBeNull();
  });
});
