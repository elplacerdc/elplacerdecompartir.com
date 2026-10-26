import { describe, it, expect } from "bun:test";
import { sendTransactionalEmail } from "../src/services/email";

describe("Transactional Email Multi-Tier Transport Invariants", () => {
  it("successfully dispatches transactional email using live SMTP provider", async () => {
    const res = await sendTransactionalEmail({
      to: "web@elplacerdecompartir.com",
      subject: "Test Automated Suite Delivery Verification",
      html: "<p>Automated test verification of multi-tier transport</p>",
      fromName: "Test Suite Invariants",
    });

    expect(res.success).toBe(true);
    expect(["aws_ses", "spacemail", "zeptomail"]).toContain(res.provider);
    expect(res.messageId).toBeDefined();
    expect(res.error).toBeUndefined();
  });

  it("handles missing recipient gracefully without throwing unhandled rejection", async () => {
    const res = await sendTransactionalEmail({
      to: "",
      subject: "Invalid recipient test",
      html: "<p>Invalid</p>",
    });

    expect(res.success).toBe(false);
    expect(res.provider).toBe("failed");
  }, 15000);
});
