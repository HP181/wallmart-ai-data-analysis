import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWalmartDb, readCsvRows, type CsvRow, type TestDb } from "@/tests/helpers/walmart-db";
import { runAnalysis } from "@/lib/analysis";
import { createLogger } from "@/lib/logger";
import { CHART_TYPES } from "@/lib/query/chart";
import { DIMENSION_IDS, FILTER_ONLY_FIELDS, METRIC_IDS } from "@/lib/query/catalog";
import { FILTER_OPS } from "@/lib/query/spec";

/**
 * The instructions are part of the contract with the model. These tests keep
 * them honest: every catalog ID is documented, nothing undocumented is
 * advertised, the data facts match the dataset, and every worked example
 * actually runs against the real data and draws the chart it claims.
 */

const instructions = readFileSync(path.resolve(__dirname, "instructions.md"), "utf8");

function section(heading: string): string {
  const start = instructions.indexOf(`## ${heading}`);
  expect(start, `section "${heading}" exists`).toBeGreaterThanOrEqual(0);
  const next = instructions.indexOf("\n## ", start + 1);
  return instructions.slice(start, next === -1 ? undefined : next);
}

function tableIds(sectionText: string): string[] {
  return [...sectionText.matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]);
}

describe("agent/instructions.md vs the catalog", () => {
  it("documents every dimension and metric, and nothing else", () => {
    expect(tableIds(section("Dimensions (group by)")).sort()).toEqual([...DIMENSION_IDS].sort());
    expect(tableIds(section("Metrics (measures)")).sort()).toEqual([...METRIC_IDS].sort());
  });

  it("mentions every filter-only field, filter operator and chart type", () => {
    for (const id of Object.keys(FILTER_ONLY_FIELDS)) expect(instructions).toContain(`\`${id}\``);
    for (const op of FILTER_OPS) expect(instructions).toContain(`\`${op}\``);
    for (const type of CHART_TYPES) expect(instructions).toContain(`\`${type}\``);
  });

  it("no longer forces wide, supporting-column queries", () => {
    expect(instructions).not.toMatch(/at least 5 columns|fewer than 5 columns|ALWAYS SELECT AT LEAST/i);
    expect(instructions).not.toMatch(/ALWAYS INCLUDE THESE SUPPORTING COLUMNS/i);
    expect(instructions).toMatch(/simple question deserves a simple result/);
  });

  it("does not ask the model to write SQL", () => {
    expect(instructions).toMatch(/never write SQL/i);
    expect(instructions).not.toMatch(/```sql/i);
  });

  it("uses plain hyphens, not em or en dashes", () => {
    expect(instructions).not.toMatch(/[–—]/);
  });
});

describe("agent/instructions.md vs the dataset", () => {
  const csv: CsvRow[] = readCsvRows();

  it("states the real size and date range", () => {
    expect(instructions).toContain(csv.length.toLocaleString("en-US"));
    const iso = csv.map((r) => {
      const [d, m, y] = r.date.split("/");
      return `${2000 + Number(y)}-${m}-${d}`;
    });
    expect(instructions).toContain(`${[...iso].sort()[0]} to ${[...iso].sort().at(-1)}`);
  });

  it("states the real number of branches and cities", () => {
    expect(instructions).toContain(`${new Set(csv.map((r) => r.branch)).size} branches`);
    expect(instructions).toContain(`${new Set(csv.map((r) => r.city)).size} cities`);
  });

  it("lists the exact categorical values present in the data", () => {
    for (const field of ["category", "payment_method"] as const) {
      for (const value of new Set(csv.map((r) => r[field]))) expect(instructions).toContain(`'${value}'`);
    }
    for (const value of new Set(csv.map((r) => r.shift))) expect(instructions).toContain(`'${value}'`);
  });

  it("warns that 2019 is only a partial year, which is true of the data", () => {
    const months2019 = new Set(csv.filter((r) => r.year === "2019").map((r) => Number(r.month)));
    expect([...months2019].sort()).toEqual([1, 2, 3]);
    expect(instructions).toMatch(/2019 covers only January to March/);
  });
});

describe("agent/instructions.md worked examples run for real", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createWalmartDb();
  });
  afterAll(() => db.close());

  const examples = [...instructions.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1]));

  it("has examples to check", () => {
    expect(examples.length).toBeGreaterThanOrEqual(5);
  });

  it.each(examples.map((e, i) => [i + 1, e.chartConfig.title as string, e] as const))(
    "example %i (%s) succeeds and draws the chart it asks for",
    async (_n, _title, example) => {
      const result = await runAnalysis(example, {
        run: db.run,
        maxRows: 500,
        log: createLogger({ app: "t" }, () => undefined),
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      expect(result.rowCount).toBeGreaterThan(0);
      expect(result.chartWarnings).toEqual([]);
      expect(result.chartConfig.type).toBe(example.chartConfig.type);
    },
  );
});
