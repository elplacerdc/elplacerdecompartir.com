import { describe, expect, test } from "bun:test";
import {
  CULTURAL_EVENTS,
  getUpcomingEvents,
  getPastEvents,
} from "../src/data/events";

describe("Dynamic SSR Events Segregation Invariant", () => {
  test("CULTURAL_EVENTS has defined events with valid ISO dates and titles", () => {
    expect(CULTURAL_EVENTS.length).toBeGreaterThanOrEqual(4);
    for (const ev of CULTURAL_EVENTS) {
      expect(ev.id).toBeTruthy();
      expect(ev.title).toBeTruthy();
      expect(ev.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(ev.image).toBeTruthy();
    }
  });

  test("Event 9 Oct is past on Oct 10 2026", () => {
    const oct10 = new Date("2026-10-10T12:00:00-05:00");
    const past = getPastEvents(oct10);
    const pastIds = past.map((e) => e.id);
    expect(pastIds).toContain("sitio-9-oct");
    expect(pastIds).toContain("apertura-3-oct");
  });

  test("Event 10 Oct is active on Oct 10 and moves to past on Oct 11", () => {
    const oct10 = new Date("2026-10-10T12:00:00-05:00");
    const upcomingOct10 = getUpcomingEvents(oct10);
    expect(upcomingOct10.map((e) => e.id)).toContain("impacto-10-oct");

    const oct11 = new Date("2026-10-11T00:00:01-05:00");
    const pastOct11 = getPastEvents(oct11);
    expect(pastOct11.map((e) => e.id)).toContain("impacto-10-oct");
    const upcomingOct11 = getUpcomingEvents(oct11);
    expect(upcomingOct11.map((e) => e.id)).not.toContain("impacto-10-oct");
  });

  test("Event Luna Llena (Oct 31) remains upcoming throughout October", () => {
    const oct20 = new Date("2026-10-20T12:00:00-05:00");
    const upcoming = getUpcomingEvents(oct20);
    expect(upcoming.map((e) => e.id)).toContain("luna-llena");
  });
});
