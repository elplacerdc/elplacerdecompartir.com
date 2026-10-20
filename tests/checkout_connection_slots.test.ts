import { describe, test, expect } from "bun:test";
import { pool } from "../src/db";
import fs from "fs";

describe("Checkout & Database Connection Pool Resilience Verification", () => {
  test("1. Concurrent DB queries resolve cleanly without connection starvation", async () => {
    // Fire 20 parallel queries through the pool to verify concurrency and automatic release
    const tasks = Array.from({ length: 20 }, (_, i) =>
      pool.query("SELECT $1::int as iteration, NOW() as current_time", [i])
    );
    const results = await Promise.all(tasks);

    expect(results.length).toBe(20);
    results.forEach((res, i) => {
      expect(res.rows[0].iteration).toBe(i);
    });
  });

  test("2. checkout/create.ts does not checkout dedicated clients for simple queries", () => {
    const filePath = `${import.meta.dir}/../src/pages/api/checkout/create.ts`;
    const content = fs.readFileSync(filePath, "utf8");

    // Must NOT call pool.connect() in create.ts (use pool.query instead)
    expect(content).not.toContain("pool.connect()");
    expect(content).toContain("pool.query(");
  });

  test("3. checkout/create.ts sanitizes PostgreSQL 53300 / SUPERUSER connection errors", () => {
    const filePath = `${import.meta.dir}/../src/pages/api/checkout/create.ts`;
    const content = fs.readFileSync(filePath, "utf8");

    // Catch block must detect 53300 / connection slots and return friendly Spanish message
    expect(content).toContain('error?.code === "53300"');
    expect(content).toContain("connection slots");
    expect(content).toContain("alta demanda en el sistema de pagos");
    expect(content).not.toContain("whth the SUPERUSER");
  });

  test("4. discountStrategy.ts uses pool.query without holding dedicated client connections", () => {
    const filePath = `${import.meta.dir}/../src/services/discountStrategy.ts`;
    const content = fs.readFileSync(filePath, "utf8");

    expect(content).not.toContain("pool.connect()");
    expect(content).toContain("pool.query(");
  });

  test("5. PostgreSQL database isolation limits prevent server-wide slot starvation", async () => {
    const res = await pool.query(
      "SELECT datname, datconnlimit FROM pg_database WHERE datname IN ('db', 'evogo_auth', 'evogo_users')"
    );

    const limits: Record<string, number> = {};
    res.rows.forEach((r: any) => {
      limits[r.datname] = r.datconnlimit;
    });

    // evogo_auth and evogo_users must be constrained to <= 15
    expect(limits.evogo_auth).toBeLessThanOrEqual(15);
    expect(limits.evogo_users).toBeLessThanOrEqual(15);
    // db must be constrained to <= 60
    expect(limits.db).toBeLessThanOrEqual(60);
  });
});
