import { useState, useEffect, useMemo } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Distinct colors for the 'Overlay' view
const OVERLAY_COLORS = [
  "#ef5350", "#ec407a", "#ab47bc", "#7e57c2", "#5c6bc0", "#42a5f5",
  "#29b6f6", "#26c6da", "#26a69a", "#66bb6a", "#9ccc65", "#d4e157",
];

async function loadFromStorage() {
  const res = await fetch(
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vR0RCmN9uf0TXrcan5bx33Yp-M_SP4KGF1mXBU_q_pc1YCjZMlFI30GjnPrP-fSJbKtY8vUZFRmqaZx/pub?gid=148955930&single=true&output=csv"
  );
  const text = await res.text();
  return parseCSV(text);
}

function parseCSV(text) {
  const lines = text.trim().split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  
  const splitRow = (line) => {
    const cols = [];
    let current = "", inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { cols.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    cols.push(current.trim());
    return cols;
  };

  const header = lines[0].toLowerCase();
  const startIdx = (header.includes("date") || header.includes("week") || header.includes("day")) ? 1 : 0;
  const entries = [];

  for (let i = startIdx; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    if (cols.length < 2) continue;
    
    let dateStr = cols[0].replace(/"/g, "").trim();
    let date = new Date(dateStr);
    
    if (isNaN(date.getTime())) {
      const parts = dateStr.split(/[\/\-\.]/);
      if (parts.length === 3) {
        const [a, b, c] = parts.map(Number);
        if (a > 31) date = new Date(a, b - 1, c);
        else if (a > 12) date = new Date(c, b - 1, a);
        else date = new Date(c, a - 1, b);
      }
    }
    if (isNaN(date.getTime())) continue;

    const balance = parseFloat(cols[1].replace(/[$£€,\s]/g, ""));
    if (isNaN(balance) || balance <= 0) continue;

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    entries.push({ date: y + "-" + m + "-" + d, balance });
  }
  return entries;
}

function fmt(n) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// NEW: Helper to format date nicely (e.g. "Jan 31")
function formatDatePretty(dateStr) {
  if (!dateStr || dateStr.includes("Start")) return dateStr;
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PortfolioTracker() {
  const [entries, setEntries] = useState([]);
  const [view, setView] = useState("overall"); 

  useEffect(() => {
    (async () => {
      const e = await loadFromStorage();
      if (e) setEntries(e);
    })();
  }, []);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.date.localeCompare(b.date)),
    [entries]
  );

  const effectiveStart = useMemo(
    () => (sortedEntries.length ? sortedEntries[0].balance : 0),
    [sortedEntries]
  );

  // --- CHART DATA GENERATION ---
  const chartData = useMemo(() => {
    if (!sortedEntries.length) return [];

    // 1. OVERLAY VIEW
    if (view === "overlay") {
      const dayMap = new Map();
      sortedEntries.forEach((e) => {
        const dObj = new Date(e.date + "T00:00:00");
        const dayKey = String(dObj.getDate()).padStart(2, "0");
        const monthName = MONTHS[dObj.getMonth()];

        if (!dayMap.has(dayKey)) {
          dayMap.set(dayKey, { label: dayKey });
        }
        dayMap.get(dayKey)[monthName] = e.balance;
      });
      return Array.from(dayMap.values()).sort((a, b) =>
        a.label.localeCompare(b.label)
      );
    }

    // 2. OVERALL & 100X VIEW
    if (view === "overall" || view === "100x") {
      return sortedEntries.map((e) => ({
        label: formatDatePretty(e.date), // UPDATED: Cleaner Date
        date: e.date,
        balance: e.balance,
        profit:
          effectiveStart > 0
            ? ((e.balance - effectiveStart) / effectiveStart) * 100
            : 0,
        multiplier: effectiveStart > 0 ? e.balance / effectiveStart : 1,
      }));
    }

    // 3. SINGLE MONTH VIEW (With Ghost Entry)
    const mi = parseInt(view);
    const me = sortedEntries.filter(
      (e) => new Date(e.date + "T00:00:00").getMonth() === mi
    );
    if (!me.length) return [];

    const firstEntryIdx = sortedEntries.indexOf(me[0]);
    const prevEntry =
      firstEntryIdx > 0 ? sortedEntries[firstEntryIdx - 1] : null;
    
    const baseline = prevEntry ? prevEntry.balance : me[0].balance;

    const data = me.map((e) => ({
      label: e.date.slice(8), // Just Day number for month view
      date: e.date,
      balance: e.balance,
      profit: baseline > 0 ? ((e.balance - baseline) / baseline) * 100 : 0,
      multiplier: baseline > 0 ? e.balance / baseline : 1,
    }));

    if (prevEntry) {
      data.unshift({
        label: "Start", 
        date: prevEntry.date,
        balance: prevEntry.balance,
        profit: 0,
        multiplier: 1,
      });
    }

    return data;
  }, [sortedEntries, view, effectiveStart]);

  // --- STATISTICS ---
  const stats = useMemo(() => {
    const last = sortedEntries.length
      ? sortedEntries[sortedEntries.length - 1]
      : null;
    const overallPnl =
      last && effectiveStart ? last.balance - effectiveStart : 0;
    const overallPct =
      effectiveStart > 0 ? (overallPnl / effectiveStart) * 100 : 0;
    const overallMulti =
      effectiveStart > 0 && last ? last.balance / effectiveStart : 0;

    let monthPnl = 0,
      monthPct = 0;
    
    if (view !== "overall" && view !== "100x" && view !== "overlay") {
      const mi = parseInt(view);
      const me = sortedEntries.filter(
        (e) => new Date(e.date + "T00:00:00").getMonth() === mi
      );
      if (me.length) {
        const firstEntryIdx = sortedEntries.indexOf(me[0]);
        const prevEntry =
          firstEntryIdx > 0 ? sortedEntries[firstEntryIdx - 1] : null;
        const startBalance = prevEntry ? prevEntry.balance : me[0].balance;

        monthPnl = me[me.length - 1].balance - startBalance;
        monthPct = startBalance > 0 ? (monthPnl / startBalance) * 100 : 0;
      }
    }
    return {
      overallPnl,
      overallPct,
      overallMulti,
      monthPnl,
      monthPct,
      currentBalance: last?.balance ?? 0,
    };
  }, [sortedEntries, effectiveStart, view]);

  const monthsWithData = useMemo(() => {
    const s = new Set();
    sortedEntries.forEach((e) => s.add(new Date(e.date + "T00:00:00").getMonth()));
    return s;
  }, [sortedEntries]);

  const lastProfit = chartData.length && view !== 'overlay' ? chartData[chartData.length - 1].profit : 0;
  const areaColor = lastProfit >= 0 ? "#4caf7c" : "#e05555";

  // --- TOOLTIP ---
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;

    if (view === "overlay") {
      return (
        <div style={{
          background: "rgba(14,14,20,0.96)",
          border: "1px solid #2a2a3a", borderRadius: 8, padding: "10px", minWidth: 150
        }}>
          <div style={{ color: "#888", fontSize: 11, marginBottom: 5 }}>Day {label}</div>
          {payload.sort((a,b) => b.value - a.value).map((p) => (
            <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: p.color, marginRight: 10 }}>{p.name}:</span>
              <span style={{ color: "#e8e8e8", fontWeight: 600 }}>${fmt(p.value)}</span>
            </div>
          ))}
        </div>
      );
    }

    const d = payload[0]?.payload;
    if (!d) return null;
    
    let base;
    if (view === 'overall' || view === '100x') {
       base = effectiveStart;
    } else {
       base = chartData[0]?.balance || d.balance; 
    }

    const pnl = d.balance - base;
    const pos = pnl >= 0;
    
    return (
      <div style={{
        background: "rgba(14,14,20,0.96)",
        border: "1px solid #2a2a3a", borderRadius: 8, padding: "10px 14px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.6)", minWidth: 175,
      }}>
        <div style={{ color: "#555", fontSize: 11, marginBottom: 5, fontFamily: "'Courier New',monospace" }}>{formatDatePretty(d.date)}</div>
        <div style={{ color: "#e8e8e8", fontSize: 14, fontWeight: 600, marginBottom: 3 }}>${fmt(d.balance)}</div>
        <div style={{ color: pos ? "#4caf7c" : "#e05555", fontSize: 12 }}>
          {pos ? "+" : ""}${fmt(pnl)} ({pos ? "+" : ""}{d.profit.toFixed(2)}%)
        </div>
        <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>{d.multiplier.toFixed(2)}x</div>
      </div>
    );
  };

  return (
    <div style={{ background: "#0e0e14", minHeight: "100vh", padding: "28px 16px 24px", fontFamily: "'Segoe UI',sans-serif", color: "#ccc" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        
        {/* HEADER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e8e8e8", margin: 0, letterSpacing: "-0.5px" }}>100x Challenge</h1>
            <span style={{ fontSize: 11, color: "#444" }}>
              {effectiveStart > 0 ? `Starting: $${fmt(effectiveStart)} · Target: $${fmt(effectiveStart * 100)}` : "Loading..."}
            </span>
          </div>
        </div>

        {/* TOP STATS */}
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center", marginBottom: 14, marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 11, color: "#444" }}>Current:</span>
            <span style={{ fontSize: 13, color: "#e8e8e8", fontWeight: 600 }}>${fmt(stats.currentBalance)}</span>
            <span style={{ fontSize: 12, color: stats.overallPnl >= 0 ? "#4caf7c" : "#e05555", fontWeight: 600 }}>
              {stats.overallPnl >= 0 ? "+" : ""}${fmt(stats.overallPnl)} ({stats.overallPnl >= 0 ? "+" : ""}{stats.overallPct.toFixed(2)}%)
            </span>
            <span style={{ fontSize: 11, color: "#555" }}>{stats.overallMulti.toFixed(2)}x</span>
          </div>
          
           {/* Month Stats */}
           {view !== "overall" && view !== "100x" && view !== "overlay" && (
            <>
              <div style={{ width: 1, height: 18, background: "#2a2a3a" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, color: "#444" }}>
                  {MONTHS[parseInt(view)]}:
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: stats.monthPnl >= 0 ? "#4caf7c" : "#e05555",
                    fontWeight: 600,
                  }}
                >
                  {stats.monthPnl >= 0 ? "+" : ""}${fmt(stats.monthPnl)} (
                  {stats.monthPnl >= 0 ? "+" : ""}
                  {stats.monthPct.toFixed(2)}%)
                </span>
              </div>
            </>
          )}
        </div>

        {/* PROGRESS BAR */}
        {effectiveStart > 0 && stats.currentBalance > 0 && (
          <div style={{ marginBottom: 24, background: "#111118", padding: "12px 16px", borderRadius: 8, border: "1px solid #1e1e2a" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#888", marginBottom: 6 }}>
              <span style={{ fontWeight: 600, color: "#ccc"}}>Progress to 100x</span>
              <span>{stats.overallMulti.toFixed(2)}x <span style={{color:'#555'}}>/</span> 100x</span>
            </div>
            <div style={{ height: 6, background: "#1a1a24", borderRadius: 3, overflow: "hidden", position: "relative" }}>
              <div style={{
                height: "100%", borderRadius: 3,
                width: `${Math.min(100, (stats.overallMulti / 100) * 100)}%`,
                background: "linear-gradient(90deg,#4caf7c,#5b9bd5)",
                transition: "width 0.6s ease"
              }} />
            </div>
            <div style={{ textAlign: "right", fontSize: 10, color: "#5b9bd5", marginTop: 4, fontWeight: 600 }}>
              {((stats.overallMulti / 100) * 100).toFixed(2)}% Complete
            </div>
          </div>
        )}

        {/* VIEW CONTROLS */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
          <button onClick={() => setView("overall")}
            style={{
              background: view === "overall" ? "#5b9bd520" : "#1a1a24",
              border: `1px solid ${view === "overall" ? "#5b9bd5" : "#2a2a3a"}`,
              borderRadius: 6, color: view === "overall" ? "#5b9bd5" : "#666",
              padding: "5px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer"
            }}>Overall</button>

           <button onClick={() => setView("100x")}
            style={{
              background: view === "100x" ? "#ab47bc20" : "#1a1a24",
              border: `1px solid ${view === "100x" ? "#ab47bc" : "#2a2a3a"}`,
              borderRadius: 6, color: view === "100x" ? "#ab47bc" : "#666",
              padding: "5px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer"
            }}>100x Progress</button>

            <button onClick={() => setView("overlay")}
            style={{
              background: view === "overlay" ? "#f0a05020" : "#1a1a24",
              border: `1px solid ${view === "overlay" ? "#f0a050" : "#2a2a3a"}`,
              borderRadius: 6, color: view === "overlay" ? "#f0a050" : "#666",
              padding: "5px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer"
            }}>Overlay</button>

          <div style={{ width: 1, height: 22, background: "#2a2a3a", margin: "0 4px" }} />

          {MONTHS.map((m, i) => {
            const has = monthsWithData.has(i), active = view === String(i);
            return (
              <button key={m} onClick={() => has && setView(String(i))}
                style={{
                  background: active ? "#ccc2" : has ? "#1a1a24" : "#141418",
                  border: `1px solid ${active ? "#ccc" : has ? "#2a2a3a" : "#1a1a22"}`,
                  borderRadius: 6, color: active ? "#fff" : has ? "#888" : "#333",
                  padding: "5px 10px", fontSize: 11.5, fontWeight: 500,
                  cursor: has ? "pointer" : "default", opacity: has ? 1 : 0.4, position: "relative"
                }}>
                {m}
                {has && <span style={{ position: "absolute", top: -3, right: -3, width: 6, height: 6, borderRadius: "50%", background: "#4caf7c" }} />}
              </button>
            );
          })}
        </div>

        {/* CHART AREA */}
        <div style={{
          background: "#111118", borderRadius: 12, border: "1px solid #1e1e2a",
          padding: "14px 6px 6px 2px", boxShadow: "0 8px 40px rgba(0,0,0,0.4)", minHeight: 380
        }}>
          {chartData.length === 0 ? (
            <div style={{ height: 340, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
              <div style={{ color: "#333", fontSize: 40 }}>📈</div>
              <div style={{ color: "#444", fontSize: 14 }}>Loading data from sheet...</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
                <defs>
                  <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={areaColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={areaColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a26" vertical={false} />
                <XAxis
                  dataKey="label"
                  type="category"
                  tick={{ fill: "#555", fontSize: 11 }}
                  axisLine={{ stroke: "#2a2a3a" }}
                  tickLine={false}
                  interval={view === 'overlay' ? 2 : 'preserveStartEnd'}
                />
                <YAxis
                  orientation="left"
                  domain={view === '100x' ? [0, 79000] : ["auto", "auto"]}
                  tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + "K" : v.toLocaleString()}`}
                  tick={{ fill: "#888", fontSize: 11 }}
                  axisLine={{ stroke: "#2a2a3a" }}
                  tickLine={false}
                  width={68}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#2a2a3a", strokeWidth: 1 }} />
                
                {view === 'overlay' ? (
                  MONTHS.map((m, i) => (
                     monthsWithData.has(i) && (
                      <Line
                        key={m}
                        type="monotone"
                        dataKey={m}
                        stroke={OVERLAY_COLORS[i % OVERLAY_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                     )
                  ))
                ) : (
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke={areaColor}
                    strokeWidth={2}
                    fill="url(#gArea)"
                    isAnimationActive={false}
                    dot={chartData.length < 60 ? { r: 2.5, fill: areaColor, strokeWidth: 0 } : false}
                    connectNulls
                  />
                )}
                {view === 'overlay' && <Legend iconType="circle" wrapperStyle={{fontSize: 11, paddingTop: 10}}/>}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* RECENT ENTRIES LIST */}
        {sortedEntries.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, color: "#444", marginBottom: 8, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
              Recent Entries <span style={{ fontWeight: 400, color: "#333" }}>({sortedEntries.length} total)</span>
            </div>
            <div style={{ maxHeight: 180, overflowY: "auto", borderRadius: 8, border: "1px solid #1e1e2a" }}>
              {[...sortedEntries].reverse().slice(0, 20).map((e, i) => {
                const idx = sortedEntries.findIndex((x) => x.date === e.date);
                const prev = idx > 0 ? sortedEntries[idx - 1] : null;
                const change = prev ? e.balance - prev.balance : null;
                const pos = change !== null && change >= 0;
                return (
                  <div key={e.date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", borderBottom: i < 19 ? "1px solid #1a1a24" : "none", background: i % 2 === 0 ? "#111118" : "#0e0e14" }}>
                    <span style={{ color: "#666", fontSize: 12, fontFamily: "'Courier New',monospace" }}>{formatDatePretty(e.date)}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      {change !== null && (
                        <span style={{ fontSize: 11, color: pos ? "#4caf7c" : "#e05555" }}>
                          {pos ? "+" : ""}${fmt(change)}
                        </span>
                      )}
                      <span style={{ color: "#e8e8e8", fontSize: 13, fontWeight: 600, minWidth: 90, textAlign: "right" }}>${fmt(e.balance)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
