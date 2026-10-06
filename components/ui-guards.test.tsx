import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChartPanel } from "@/components/chart-panel";
import { statusBadge } from "@/components/Header";

describe("ChartPanel guard", () => {
  const rows = [
    { category: "A", revenue: 10 },
    { category: "B", revenue: 20 },
  ];

  it("renders nothing for keys that are not in the rows", () => {
    const html = renderToStaticMarkup(
      <ChartPanel rows={rows} chartConfig={{ type: "bar", xKey: "category", yKey: "profit", title: "t" }} />,
    );
    expect(html).toBe("");
  });

  it("renders nothing when y values are not numeric", () => {
    const html = renderToStaticMarkup(
      <ChartPanel
        rows={[{ category: "A", revenue: "n/a" }]}
        chartConfig={{ type: "bar", xKey: "category", yKey: "revenue", title: "t" }}
      />,
    );
    expect(html).toBe("");
  });

  it("renders the title and legend for a valid chart", () => {
    const html = renderToStaticMarkup(
      <ChartPanel rows={rows} chartConfig={{ type: "bar", xKey: "category", yKey: "revenue", title: "Revenue" }} />,
    );
    expect(html).toContain("Revenue");
    expect(html).toContain(">A<");
  });
});

describe("header status badge", () => {
  it("derives the row count from the backend", () => {
    expect(statusBadge({ kind: "ready", status: "ok", dataset: { rows: 9969, database: "neondb" } })).toEqual({
      label: "9,969 rows",
      tone: "ok",
    });
  });
  it("flags degraded, error and unreachable states", () => {
    expect(statusBadge({ kind: "ready", status: "degraded", dataset: { rows: 5, database: null } }).tone).toBe("warn");
    expect(statusBadge({ kind: "ready", status: "error" }).tone).toBe("bad");
    expect(statusBadge({ kind: "unreachable" }).tone).toBe("bad");
    expect(statusBadge({ kind: "loading" }).tone).toBe("idle");
  });
});
