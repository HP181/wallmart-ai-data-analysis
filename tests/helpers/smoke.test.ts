import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWalmartDb, readCsvRows, type TestDb } from "./walmart-db";

describe("test database", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createWalmartDb();
  });
  afterAll(() => db.close());

  it("loads the full dataset and the typed columns", async () => {
    const csv = readCsvRows();
    const [row] = await db.run({
      text: "SELECT COUNT(*)::int AS n, COUNT(sale_date)::int AS d, COUNT(sale_time)::int AS t FROM walmart",
      params: [],
    });
    expect(row).toEqual({ n: csv.length, d: csv.length, t: csv.length });
    expect(csv.length).toBe(9969);
  });
});
