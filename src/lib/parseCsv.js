export function parseCSV(text) {
  const lines = text
    .trim()
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const splitRow = (line) => {
    const cols = [];
    let current = "";
    let inQuotes = false;

    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        cols.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    cols.push(current.trim());
    return cols;
  };

  const header = lines[0].toLowerCase();
  const startIdx =
    header.includes("date") || header.includes("week") || header.includes("day")
      ? 1
      : 0;
  const entries = [];

  for (let i = startIdx; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    if (cols.length < 2) continue;

    const dateStr = cols[0].replace(/"/g, "").trim();
    let date = new Date(dateStr);

    if (Number.isNaN(date.getTime())) {
      const parts = dateStr.split(/[/.-]/);
      if (parts.length === 3) {
        const [a, b, c] = parts.map(Number);
        if (a > 31) date = new Date(a, b - 1, c);
        else if (a > 12) date = new Date(c, b - 1, a);
        else date = new Date(c, a - 1, b);
      }
    }
    if (Number.isNaN(date.getTime())) continue;

    const balance = parseFloat(cols[1].replace(/[$£€,\s]/g, ""));
    if (Number.isNaN(balance) || balance <= 0) continue;

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    entries.push({ date: `${y}-${m}-${d}`, balance });
  }

  return entries;
}
