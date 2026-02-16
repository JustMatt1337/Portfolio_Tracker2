import { parseCSV } from "../parseCsv";

describe("parseCSV", () => {
  it("parses rows with a date header and currency values", () => {
    const csv = `Date,Balance\n2026-01-01,"$1,000.50"\n2026-01-02,"$1,250.75"`;

    const result = parseCSV(csv);

    expect(result).toEqual([
      { date: "2026-01-01", balance: 1000.5 },
      { date: "2026-01-02", balance: 1250.75 },
    ]);
  });

  it("ignores invalid dates and non-positive balances", () => {
    const csv = `Date,Balance\ninvalid,100\n2026-01-02,0\n2026-01-03,-5\n2026-01-04,250`;

    const result = parseCSV(csv);

    expect(result).toEqual([{ date: "2026-01-04", balance: 250 }]);
  });

  it("supports dd/mm/yyyy style dates", () => {
    const csv = `Date,Balance\n31/12/2025,500`;

    const result = parseCSV(csv);

    expect(result).toEqual([{ date: "2025-12-31", balance: 500 }]);
  });
});
