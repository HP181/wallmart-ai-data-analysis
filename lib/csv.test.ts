import { describe, expect, it } from "vitest";
import { escapeCsvCell, toCsvLine } from "@/lib/csv";

describe("escapeCsvCell", () => {
  it("passes plain values through", () => {
    expect(escapeCsvCell("Fashion accessories")).toBe("Fashion accessories");
    expect(escapeCsvCell(12.5)).toBe("12.5");
    expect(escapeCsvCell(0)).toBe("0");
    expect(escapeCsvCell(true)).toBe("true");
    expect(escapeCsvCell(BigInt(10))).toBe("10");
  });

  it("renders null, undefined and non-finite numbers as empty", () => {
    for (const v of [null, undefined, NaN, Infinity, -Infinity]) expect(escapeCsvCell(v)).toBe("");
  });

  it("quotes cells containing commas, quotes or line breaks, doubling quotes", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvCell("line1\r\nline2")).toBe('"line1\r\nline2"');
    expect(escapeCsvCell('"')).toBe('""""');
  });

  it("neutralizes spreadsheet formula injection in text", () => {
    expect(escapeCsvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(escapeCsvCell("+1+1")).toBe("'+1+1");
    expect(escapeCsvCell("-2+3")).toBe("'-2+3");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvCell("\tcmd")).toBe("'\tcmd");
  });

  it("does not mangle real negative numbers or dash-containing text", () => {
    expect(escapeCsvCell(-5.25)).toBe("-5.25");
    expect(escapeCsvCell("2019-01-05")).toBe("2019-01-05");
    expect(escapeCsvCell("Wal-Mart")).toBe("Wal-Mart");
  });

  it("serializes dates as ISO strings and drops invalid ones", () => {
    expect(escapeCsvCell(new Date("2020-02-03T04:05:06Z"))).toBe("2020-02-03T04:05:06.000Z");
    expect(escapeCsvCell(new Date("nope"))).toBe("");
  });
});

describe("toCsvLine", () => {
  it("joins cells with commas and ends with CRLF", () => {
    expect(toCsvLine(["a", 1, null, "b,c"])).toBe('a,1,,"b,c"\r\n');
  });
});
