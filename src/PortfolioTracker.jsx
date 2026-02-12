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
  ReferenceLine,
} from "recharts";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const OVERLAY_COLORS = [
  "#ef5350",
  "#ec407a",
  "#ab47bc",
  "#7e57c2",
  "#5c6bc0",
  "#42a5f5",
  "#29b6f6",
  "#26c6da",
  "#26a69a",
  "#66bb6a",
  "#9ccc65",
  "#d4e157",
];

// --- UTILS ---
const fmt = (n) =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDatePretty = (dateStr) => {
  if (!dateStr || dateStr.includes("Start") || dateStr === "0") return dateStr;
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

async function loadFromStorage() {
  const res = await fetch(
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vR0RCmN9uf0TXrcan5bx33Yp-M_SP4KGF1mXBU_q_pc1YCjZMlFI30GjnPrP-fSJbKtY8vUZFRmqaZx/pub?gid=148955930&single=true&output=csv&t=" +
      Date.now()
  );
  const text = await res.text();
  return parseCSV(text);
}

function parseCSV(text) {
  const lines = text
    .trim()
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const splitRow = (line) => {
    const cols = [];
    let current = "",
      inQuotes = false;
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

// --- ANIMATED NUMBER COMPONENT ---
const AnimatedNumber = ({ value }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) return;

    const duration = 800; // 0.8s animation
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out expo function for smooth landing
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

      const current = start + (end - start) * ease;
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return fmt(displayValue);
};

export default function PortfolioTracker() {
  const [entries, setEntries] = useState([]);
  const [view, setView] = useState("overall");
  const [loading, setLoading] = useState(true);

  // NEW STATES
  const [privacyMode, setPrivacyMode] = useState(false);
  const [hiddenMonths, setHiddenMonths] = useState(new Set());
  const [highlightedMonth, setHighlightedMonth] = useState(null);
  // metric: 'value' | 'profit' | 'percent'
  const [metric, setMetric] = useState("value");

  const fetchData = async () => {
    setLoading(true);
    const e = await loadFromStorage();
    if (e) setEntries(e);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.date.localeCompare(b.date)),
    [entries]
  );

  const monthsWithData = useMemo(() => {
    const s = new Set();
    sortedEntries.forEach((e) =>
      s.add(new Date(e.date + "T00:00:00").getMonth())
    );
    return s;
  }, [sortedEntries]);

  // Keyboard Navigation
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "ArrowLeft") {
        if (view === "overall") return;
        if (view === "100x") {
          setView("overall");
          return;
        }
        if (view === "overlay") {
          setView("100x");
          return;
        }

        const currentMonth = parseInt(view);
        if (!isNaN(currentMonth)) {
          for (let i = currentMonth - 1; i >= 0; i--) {
            if (monthsWithData.has(i)) {
              setView(String(i));
              return;
            }
          }
          setView("overlay");
        }
      }
      if (e.key === "ArrowRight") {
        if (view === "overall") {
          setView("100x");
          return;
        }
        if (view === "100x") {
          setView("overlay");
          return;
        }
        if (view === "overlay") {
          for (let i = 0; i < 12; i++) {
            if (monthsWithData.has(i)) {
              setView(String(i));
              return;
            }
          }
          return;
        }

        const currentMonth = parseInt(view);
        if (!isNaN(currentMonth)) {
          for (let i = currentMonth + 1; i < 12; i++) {
            if (monthsWithData.has(i)) {
              setView(String(i));
              return;
            }
          }
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [view, monthsWithData]);

  const effectiveStart = useMemo(
    () => (sortedEntries.length ? sortedEntries[0].balance : 0),
    [sortedEntries]
  );

  const chartData = useMemo(() => {
    if (!sortedEntries.length) return [];

    // --- OVERLAY MODE ---
    if (view === "overlay") {
      const dayMap = new Map();

      // 1. Calculate Baselines (Start of month = End of prev month)
      const monthBaselines = {};
      MONTHS.forEach((_, mIdx) => {
        // Find last entry of previous month
        const prevMonthEntries = sortedEntries.filter((e) => {
          const d = new Date(e.date + "T00:00:00");
          return d.getMonth() === mIdx - 1;
        });

        if (prevMonthEntries.length > 0) {
          monthBaselines[mIdx] =
            prevMonthEntries[prevMonthEntries.length - 1].balance;
        } else {
          // Fallback for very first month data point
          const thisMonthEntries = sortedEntries.filter(
            (e) => new Date(e.date + "T00:00:00").getMonth() === mIdx
          );
          if (thisMonthEntries.length > 0) {
            monthBaselines[mIdx] = thisMonthEntries[0].balance;
          }
        }
      });

      // 2. Initialize Day 0 for all active months with baseline
      const day0 = { label: "0" };
      monthsWithData.forEach((mIdx) => {
        const monthName = MONTHS[mIdx];
        const base = monthBaselines[mIdx];
        if (base !== undefined) {
          if (metric === "value") day0[monthName] = base;
          if (metric === "profit") day0[monthName] = 0;
          if (metric === "percent") day0[monthName] = 0;
        }
      });
      dayMap.set("0", day0);

      // 3. Process actual entries
      sortedEntries.forEach((e) => {
        const dObj = new Date(e.date + "T00:00:00");
        const dayKey = String(dObj.getDate()).padStart(2, "0");
        const mIdx = dObj.getMonth();
        const monthName = MONTHS[mIdx];
        const base = monthBaselines[mIdx];

        if (base === undefined) return;

        if (!dayMap.has(dayKey)) {
          dayMap.set(dayKey, { label: dayKey });
        }

        const entry = dayMap.get(dayKey);
        let val = e.balance;

        if (metric === "profit") val = e.balance - base;
        if (metric === "percent") val = ((e.balance - base) / base) * 100;

        entry[monthName] = val;
      });

      return Array.from(dayMap.values()).sort(
        (a, b) => parseInt(a.label) - parseInt(b.label)
      );
    }

    // --- OVERALL / 100x / SINGLE MONTH ---
    let dataToProcess = [];
    let baseline = effectiveStart;

    if (view === "overall" || view === "100x") {
      dataToProcess = sortedEntries;
      baseline = effectiveStart;
    } else {
      // Single Month
      const mi = parseInt(view);
      dataToProcess = sortedEntries.filter(
        (e) => new Date(e.date + "T00:00:00").getMonth() === mi
      );

      if (dataToProcess.length) {
        const firstEntryIdx = sortedEntries.indexOf(dataToProcess[0]);
        const prevEntry =
          firstEntryIdx > 0 ? sortedEntries[firstEntryIdx - 1] : null;
        baseline = prevEntry ? prevEntry.balance : dataToProcess[0].balance;
      }
    }

    if (!dataToProcess.length) return [];

    // Map entries based on view and metric
    const mapped = dataToProcess.map((e) => {
      let val = e.balance;
      const target = effectiveStart * 100;

      if (view === "100x" && metric === "percent") {
        // Special case: 100x view percentage is based on Goal target
        val = (e.balance / target) * 100;
      } else if (metric === "profit") {
        val = e.balance - baseline;
      } else if (metric === "percent") {
        val = ((e.balance - baseline) / baseline) * 100;
      }

      return {
        label:
          view === "overall" || view === "100x"
            ? formatDatePretty(e.date)
            : e.date.slice(8),
        date: e.date,
        originalBalance: e.balance, // Keep for tooltips
        value: val,
        isBaseline: false,
      };
    });

    // Prepend "Start" point logic
    if (view !== "overall" && view !== "100x" && dataToProcess.length > 0) {
      if (metric !== "value") {
        // Profit/Percent mode

        // FIX: Only prepend a "Start" point if the first data point is significantly different from 0.
        // If the first point is effectively 0 (the start of the month/challenge),
        // prepending another 0 point creates an ugly flat line.
        if (Math.abs(mapped[0].value) > 0.0001) {
          const firstDate = new Date(dataToProcess[0].date);
          const prevDate = new Date(firstDate);
          prevDate.setDate(prevDate.getDate() - 1);

          mapped.unshift({
            label: "Start",
            date: prevDate.toISOString().split("T")[0],
            originalBalance: baseline,
            value: 0,
            isBaseline: true,
          });
        }
      } else {
        // Value mode: prepend previous balance
        const firstEntryIdx = sortedEntries.indexOf(dataToProcess[0]);
        const prevEntry =
          firstEntryIdx > 0 ? sortedEntries[firstEntryIdx - 1] : null;

        if (prevEntry) {
          mapped.unshift({
            label: "Start",
            date: prevEntry.date,
            originalBalance: prevEntry.balance,
            value: prevEntry.balance,
            isBaseline: true,
          });
        }
      }
    }

    return mapped;
  }, [sortedEntries, view, effectiveStart, metric, monthsWithData]);

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

    // ORACLE PREDICTION
    let projectedDate = null;
    let avgDailyGrowth = 0;

    if (sortedEntries.length > 1) {
      const first = sortedEntries[0];
      const lastEntry = sortedEntries[sortedEntries.length - 1];
      const daysTotal =
        (new Date(lastEntry.date) - new Date(first.date)) /
        (1000 * 60 * 60 * 24);

      if (daysTotal > 0 && lastEntry.balance > first.balance) {
        avgDailyGrowth =
          Math.pow(lastEntry.balance / first.balance, 1 / daysTotal) - 1;
        const target = effectiveStart * 100;
        if (lastEntry.balance < target && avgDailyGrowth > 0) {
          const daysRemaining =
            Math.log(target / lastEntry.balance) / Math.log(1 + avgDailyGrowth);
          const finish = new Date();
          finish.setDate(finish.getDate() + daysRemaining);
          projectedDate = finish.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
        }
      }
    }

    return {
      overallPnl,
      overallPct,
      overallMulti,
      monthPnl,
      monthPct,
      currentBalance: last?.balance ?? 0,
      projectedDate,
      avgDailyGrowth,
    };
  }, [sortedEntries, effectiveStart, view]);

  // --- BUTTON HOVER STATS (Pre-calculate for all months) ---
  const allMonthFinals = useMemo(() => {
    const stats = {};

    // We only care about months that actually have data
    monthsWithData.forEach((mIdx) => {
      const mStr = MONTHS[mIdx];
      const me = sortedEntries.filter(
        (e) => new Date(e.date + "T00:00:00").getMonth() === mIdx
      );
      if (!me.length) return;

      const lastEntry = me[me.length - 1];

      // Calculate baseline for this month (same logic as before)
      const prevMonthEntries = sortedEntries.filter(
        (e) => new Date(e.date + "T00:00:00").getMonth() === mIdx - 1
      );
      let base = 0;
      if (prevMonthEntries.length > 0) {
        base = prevMonthEntries[prevMonthEntries.length - 1].balance;
      } else {
        base = me[0].balance;
      }

      stats[mStr] = {
        value: lastEntry.balance,
        profit: lastEntry.balance - base,
        percent: base > 0 ? ((lastEntry.balance - base) / base) * 100 : 0,
      };
    });

    return stats;
  }, [sortedEntries, monthsWithData]);

  // Determine line color based on logic
  const isPositive =
    chartData.length > 0 && chartData[chartData.length - 1].value >= 0;
  // If in 'value' mode, we compare to first point, otherwise compare to 0
  const isPositiveValue =
    chartData.length > 0 &&
    chartData[chartData.length - 1].value >=
      (metric === "value" ? chartData[0].value : 0);

  const areaColor = isPositiveValue ? "#4caf7c" : "#e05555";

  const copyStats = () => {
    const text = `🎯 100x Update\nCurrent: $${fmt(
      stats.currentBalance
    )}\nP&L: ${stats.overallPnl >= 0 ? "+" : ""}$${fmt(
      stats.overallPnl
    )} (${stats.overallPct.toFixed(2)}%)\nProgress: ${(
      (stats.overallMulti / 100) *
      100
    ).toFixed(2)}% to 100x`;
    navigator.clipboard.writeText(text).then(() => alert("Stats copied!"));
  };

  const CustomLegend = ({ payload }) => {
    return (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
          padding: "10px 0 0",
          fontSize: 11,
        }}
      >
        {payload.map((entry) => {
          const isHidden = hiddenMonths.has(entry.value);
          const isHighlighted = highlightedMonth === entry.value;
          return (
            <div
              key={entry.value}
              onClick={() => {
                const newHidden = new Set(hiddenMonths);
                if (isHidden) newHidden.delete(entry.value);
                else newHidden.add(entry.value);
                setHiddenMonths(newHidden);
              }}
              onMouseEnter={() => setHighlightedMonth(entry.value)}
              onMouseLeave={() => setHighlightedMonth(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                opacity: isHidden ? 0.3 : 1,
                padding: "4px 8px",
                borderRadius: 4,
                background: isHighlighted ? "#ffffff08" : "transparent",
                transition: "all 0.2s",
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: entry.color,
                  border: isHighlighted ? "2px solid white" : "none",
                }}
              />
              <span
                style={{
                  color: isHighlighted ? "#fff" : "#888",
                  fontWeight: isHighlighted ? 600 : 400,
                  transition: "color 0.2s",
                }}
              >
                {entry.value}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;

    if (view === "overlay") {
      const validPayload = payload.filter(
        (p) => p.value != null && !hiddenMonths.has(p.name)
      );
      if (!validPayload.length) return null;

      return (
        <div
          style={{
            background: "rgba(14,14,20,0.9)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: "10px",
            minWidth: 150,
          }}
        >
          <div style={{ color: "#888", fontSize: 11, marginBottom: 5 }}>
            Day {label}
          </div>
          {validPayload
            .sort((a, b) => b.value - a.value)
            .map((p) => (
              <div
                key={p.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  marginBottom: 3,
                }}
              >
                <span style={{ color: p.color, marginRight: 10 }}>
                  {p.name}:
                </span>
                <span style={{ color: "#e8e8e8", fontWeight: 600 }}>
                  {metric === "percent" && "+"}
                  {fmt(p.value)}
                  {metric === "percent" ? "%" : metric === "profit" ? "$" : ""}
                </span>
              </div>
            ))}
        </div>
      );
    }

    const d = payload[0]?.payload;
    if (!d) return null;

    if (d.isBaseline) {
      return (
        <div
          style={{
            background: "rgba(14,14,20,0.9)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: "10px 14px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
            minWidth: 175,
          }}
        >
          <div
            style={{
              color: "#666",
              fontSize: 11,
              fontStyle: "italic",
              marginBottom: 5,
            }}
          >
            Starting Point
          </div>
          <div style={{ color: "#888", fontSize: 13 }}>
            {privacyMode ? "$ ****" : `$${fmt(d.originalBalance)}`}
          </div>
        </div>
      );
    }

    const is100xPercent = view === "100x" && metric === "percent";
    let mainValueDisplay;
    if (is100xPercent) {
      mainValueDisplay = `${fmt(d.value)}% of Goal`;
    } else if (metric === "percent") {
      mainValueDisplay = `${d.value >= 0 ? "+" : ""}${fmt(d.value)}%`;
    } else if (metric === "profit") {
      mainValueDisplay = `${d.value >= 0 ? "+" : ""}$${fmt(d.value)}`;
    } else {
      mainValueDisplay = privacyMode ? "$ ****" : `$${fmt(d.value)}`;
    }

    return (
      <div
        style={{
          background: "rgba(14,14,20,0.9)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          padding: "10px 14px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
          minWidth: 175,
        }}
      >
        <div
          style={{
            color: "#555",
            fontSize: 11,
            marginBottom: 5,
            fontFamily: "'Courier New',monospace",
          }}
        >
          {formatDatePretty(d.date)}
        </div>
        <div
          style={{
            color: "#e8e8e8",
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 3,
          }}
        >
          {mainValueDisplay}
        </div>
        {metric !== "value" && (
          <div style={{ color: "#666", fontSize: 11 }}>
            Bal: {privacyMode ? "****" : `$${fmt(d.originalBalance)}`}
          </div>
        )}
      </div>
    );
  };

  const getAxisTickFormatter = (val) => {
    if (privacyMode && metric === "value") return "****";
    if (metric === "percent") return `${val.toFixed(0)}%`;
    if (metric === "profit") {
      return (
        (val >= 0 ? "+" : "") +
        (Math.abs(val) >= 1000 ? (val / 1000).toFixed(1) + "k" : val)
      );
    }
    // Value mode
    return val >= 1000 ? (val / 1000).toFixed(1) + "K" : val.toLocaleString();
  };

  // Calculate domain for 100x view based on metric
  const get100xDomain = () => {
    if (view !== "100x") return ["auto", "auto"];
    const target = effectiveStart * 100;
    if (metric === "percent") return [0, 100];
    if (metric === "profit") return [0, target - effectiveStart];
    // value mode
    return [0, Math.max(target, stats.currentBalance * 1.1)];
  };

  return (
    <div
      style={{
        background: "#0e0e14",
        minHeight: "100vh",
        padding: "28px 16px 24px",
        fontFamily: "'Segoe UI',sans-serif",
        color: "#ccc",
      }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0% { stroke-width: 0px; stroke-opacity: 1; }
          50% { stroke-width: 8px; stroke-opacity: 0.5; }
          100% { stroke-width: 0px; stroke-opacity: 1; }
        }
        /* ENTRY ANIMATION */
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-in {
          animation: fadeIn 0.6s ease-out forwards;
          opacity: 0; 
        }
        
        /* LEGEND ANIMATION */
        .legend-val {
          animation: slideRight 0.2s ease-out forwards;
          display: inline-block;
        }
        @keyframes slideRight {
          from { opacity: 0; transform: translateX(-5px); }
          to { opacity: 1; transform: translateX(0); }
        }

        /* Custom Scrollbar */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0e0e14; }
        ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #444; }
        
        /* Mobile Scrollable Buttons */
        @media (max-width: 768px) {
          .month-buttons-container { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; scrollbar-width: thin; padding-bottom: 5px; }
          .month-buttons { flex-wrap: nowrap !important; min-width: min-content; }
        }

        /* GLASS & GRADIENT STYLES */
        .glass-panel {
          background: rgba(17, 17, 24, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        .gradient-text {
          background: linear-gradient(90deg, #4caf7c, #22c55e);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .gradient-text-red {
          background: linear-gradient(90deg, #ef5350, #f43f5e);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
         .toggle-btn {
             background: #1a1a24; border: 1px solid #2a2a3a; color: #666; padding: 5px 12px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s;
        }
        .toggle-btn.active {
            background: #2a2a3a; color: #fff; border-color: #555;
        }
        .toggle-group {
            display: flex; border-radius: 6px; overflow: hidden; border: 1px solid #2a2a3a;
        }
        .toggle-group .toggle-btn { border: none; border-right: 1px solid #2a2a3a; border-radius: 0; }
        .toggle-group .toggle-btn:last-child { border-right: none; }
      `}</style>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* HEADER */}
        <div
          className="animate-in"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 6,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#e8e8e8",
                margin: 0,
                letterSpacing: "-0.5px",
              }}
            >
              100x Challenge
            </h1>
            <span style={{ fontSize: 11, color: "#444" }}>
              {effectiveStart > 0 ? (
                <span>
                  Starting: {privacyMode ? "$ ****" : `$${fmt(effectiveStart)}`}{" "}
                  · Target:{" "}
                  {privacyMode ? "$ ****" : `$${fmt(effectiveStart * 100)}`}
                </span>
              ) : (
                "Loading..."
              )}
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {/* METRIC TOGGLE */}
            <div className="toggle-group">
              <button
                className={`toggle-btn ${metric === "value" ? "active" : ""}`}
                onClick={() => setMetric("value")}
              >
                Value $
              </button>
              <button
                className={`toggle-btn ${metric === "profit" ? "active" : ""}`}
                onClick={() => setMetric("profit")}
              >
                Profit $
              </button>
              <button
                className={`toggle-btn ${metric === "percent" ? "active" : ""}`}
                onClick={() => setMetric("percent")}
              >
                Growth %
              </button>
            </div>

            <button
              onClick={() => setPrivacyMode(!privacyMode)}
              style={{
                background: "transparent",
                border: "none",
                color: privacyMode ? "#4caf7c" : "#555",
                cursor: "pointer",
                fontSize: 16,
              }}
            >
              {privacyMode ? "👁️‍🗨️" : "👁️"}
            </button>
            <button
              onClick={copyStats}
              style={{
                background: "#1a1a24",
                border: "1px solid #2a2a3a",
                borderRadius: 6,
                color: "#666",
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              📋
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              style={{
                background: "#1a1a24",
                border: "1px solid #2a2a3a",
                borderRadius: 6,
                color: loading ? "#444" : "#5b9bd5",
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {loading ? (
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    border: "2px solid #444",
                    borderTopColor: "#5b9bd5",
                    animation: "spin 1s linear infinite",
                  }}
                />
              ) : (
                "↻"
              )}
            </button>
          </div>
        </div>

        {/* TOP STATS */}
        <div
          className="animate-in"
          style={{
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 14,
            marginTop: 10,
            animationDelay: "0.1s",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 11, color: "#444" }}>Current:</span>
            <span
              style={{ fontSize: 13, fontWeight: 600 }}
              className={
                stats.overallPnl >= 0 ? "gradient-text" : "gradient-text-red"
              }
            >
              {privacyMode ? (
                "$ ****"
              ) : (
                <>
                  $<AnimatedNumber value={stats.currentBalance} />
                </>
              )}
            </span>
            <span
              style={{
                fontSize: 12,
                color: stats.overallPnl >= 0 ? "#4caf7c" : "#e05555",
                fontWeight: 600,
              }}
            >
              {stats.overallPnl >= 0 ? "+" : ""}
              {privacyMode ? "$ ****" : `$${fmt(stats.overallPnl)}`}(
              {stats.overallPnl >= 0 ? "+" : ""}
              {stats.overallPct.toFixed(2)}%)
            </span>
            <span style={{ fontSize: 11, color: "#555" }}>
              {stats.overallMulti.toFixed(2)}x
            </span>
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
                  {stats.monthPnl >= 0 ? "+" : ""}
                  {privacyMode ? "$ ****" : `$${fmt(stats.monthPnl)}`}(
                  {stats.monthPnl >= 0 ? "+" : ""}
                  {stats.monthPct.toFixed(2)}%)
                </span>
              </div>
            </>
          )}
        </div>

        {/* PROGRESS BAR */}
        {effectiveStart > 0 && stats.currentBalance > 0 && (
          <div
            className="glass-panel animate-in"
            style={{
              marginBottom: 24,
              padding: "12px 16px",
              borderRadius: 8,
              animationDelay: "0.2s",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginBottom: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 600, color: "#ccc" }}>
                  Progress to 100x
                </span>
                {stats.projectedDate && (
                  <span
                    style={{
                      color: "#5b9bd5",
                      background: "#5b9bd515",
                      padding: "2px 6px",
                      borderRadius: 4,
                      fontSize: 10.5,
                    }}
                  >
                    🚀 ETA: {stats.projectedDate}
                  </span>
                )}
                {stats.avgDailyGrowth > 0 && (
                  <span style={{ color: "#555", fontSize: 10.5 }}>
                    (Avg: +{(stats.avgDailyGrowth * 100).toFixed(2)}% / day)
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "#ccc" }}>
                {stats.overallMulti.toFixed(2)}x{" "}
                <span style={{ color: "#555" }}>/</span> 100x
              </div>
            </div>

            <div
              style={{
                height: 6,
                background: "#1a1a24",
                borderRadius: 3,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: 3,
                  width: `${Math.min(100, (stats.overallMulti / 100) * 100)}%`,
                  background: "linear-gradient(90deg,#4caf7c,#5b9bd5)",
                  transition: "width 0.6s ease",
                }}
              />
            </div>

            <div
              style={{
                textAlign: "right",
                fontSize: 10,
                color: "#5b9bd5",
                marginTop: 4,
                fontWeight: 600,
              }}
            >
              {((stats.overallMulti / 100) * 100).toFixed(2)}% Complete
            </div>
          </div>
        )}

        {/* VIEW CONTROLS */}
        <div
          className="month-buttons-container animate-in"
          style={{ marginBottom: 16, animationDelay: "0.3s" }}
        >
          <div
            className="month-buttons"
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              onClick={() => setView("overall")}
              style={{
                background: view === "overall" ? "#5b9bd520" : "#1a1a24",
                border: `1px solid ${
                  view === "overall" ? "#5b9bd5" : "#2a2a3a"
                }`,
                borderRadius: 6,
                color: view === "overall" ? "#5b9bd5" : "#666",
                padding: "5px 13px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Overall
            </button>

            <button
              onClick={() => setView("100x")}
              style={{
                background: view === "100x" ? "#ab47bc20" : "#1a1a24",
                border: `1px solid ${view === "100x" ? "#ab47bc" : "#2a2a3a"}`,
                borderRadius: 6,
                color: view === "100x" ? "#ab47bc" : "#666",
                padding: "5px 13px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              100x Progress
            </button>

            <button
              onClick={() => setView("overlay")}
              style={{
                background: view === "overlay" ? "#f0a05020" : "#1a1a24",
                border: `1px solid ${
                  view === "overlay" ? "#f0a050" : "#2a2a3a"
                }`,
                borderRadius: 6,
                color: view === "overlay" ? "#f0a050" : "#666",
                padding: "5px 13px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Overlay
            </button>

            <div
              style={{
                width: 1,
                height: 22,
                background: "#2a2a3a",
                margin: "0 4px",
              }}
            />

            {MONTHS.map((m, i) => {
              const has = monthsWithData.has(i),
                active = view === String(i);

              // New Hover Logic
              const isHovered = highlightedMonth === m;
              const stats = allMonthFinals[m];

              return (
                <button
                  key={m}
                  onClick={() => has && setView(String(i))}
                  onMouseEnter={() => setHighlightedMonth(m)}
                  onMouseLeave={() => setHighlightedMonth(null)}
                  style={{
                    background: active ? "#ccc2" : has ? "#1a1a24" : "#141418",
                    border: `1px solid ${
                      active ? "#ccc" : has ? "#2a2a3a" : "#1a1a22"
                    }`,
                    borderRadius: 6,
                    color: active ? "#fff" : has ? "#888" : "#333",
                    padding: "5px 10px",
                    fontSize: 11.5,
                    fontWeight: 500,
                    cursor: has ? "pointer" : "default",
                    opacity: has ? 1 : 0.4,
                    position: "relative",
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {m}
                  {has && (
                    <span
                      style={{
                        position: "absolute",
                        top: -3,
                        right: -3,
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#4caf7c",
                      }}
                    />
                  )}

                  {/* The Super Slick Hover Effect */}
                  {has && isHovered && stats && (
                    <span
                      className="legend-val"
                      style={{
                        color: stats.profit >= 0 ? "#4caf7c" : "#e05555",
                        fontWeight: 600,
                        fontSize: 11,
                      }}
                    >
                      {privacyMode
                        ? "****"
                        : metric === "percent"
                        ? `${stats.profit >= 0 ? "+" : ""}${fmt(
                            stats.percent
                          )}%`
                        : metric === "profit"
                        ? `${stats.profit >= 0 ? "+" : ""}$${fmt(stats.profit)}`
                        : `$${fmt(stats.value)}`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* CHART AREA */}
        <div
          className="glass-panel animate-in"
          style={{
            padding: "14px 6px 6px 2px",
            borderRadius: 12,
            minHeight: 380,
            animationDelay: "0.4s",
          }}
        >
          {loading ? (
            <div
              style={{
                height: 340,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  border: "3px solid #333",
                  borderTopColor: "#5b9bd5",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <div style={{ color: "#444", fontSize: 14 }}>Syncing...</div>
            </div>
          ) : chartData.length === 0 ? (
            <div
              style={{
                height: 340,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ color: "#333", fontSize: 40 }}>📈</div>
              <div style={{ color: "#444", fontSize: 14 }}>
                Loading data from sheet...
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 16, left: 8, bottom: 8 }}
              >
                <defs>
                  <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={areaColor}
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="100%"
                      stopColor={areaColor}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  type="category"
                  tick={{ fill: "#555", fontSize: 11 }}
                  axisLine={{ stroke: "#2a2a3a" }}
                  tickLine={false}
                  interval={view === "overlay" ? 2 : "preserveStartEnd"}
                />
                <YAxis
                  orientation="left"
                  domain={get100xDomain()}
                  tickFormatter={getAxisTickFormatter}
                  tick={{ fill: "#888", fontSize: 11 }}
                  axisLine={{ stroke: "#2a2a3a" }}
                  tickLine={false}
                  width={68}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ stroke: "#2a2a3a", strokeWidth: 1 }}
                />

                {metric !== "value" && view !== "100x" && (
                  <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
                )}

                {view === "overlay" ? (
                  <>
                    {MONTHS.map((m, i) => {
                      if (!monthsWithData.has(i)) return null;
                      const isHidden = hiddenMonths.has(m);
                      const isHighlighted = highlightedMonth === m;
                      const opacity = highlightedMonth
                        ? isHighlighted
                          ? 1
                          : 0.15
                        : isHidden
                        ? 0
                        : 1;
                      return (
                        <Line
                          key={m}
                          type="monotone"
                          dataKey={m}
                          stroke={OVERLAY_COLORS[i % OVERLAY_COLORS.length]}
                          strokeWidth={isHighlighted ? 3 : 2}
                          strokeOpacity={opacity}
                          dot={{ r: 3, opacity }}
                          activeDot={{ r: 5 }}
                          connectNulls={true}
                        />
                      );
                    })}
                    <Legend content={<CustomLegend />} />
                  </>
                ) : (
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={areaColor}
                    strokeWidth={3}
                    style={{ filter: `drop-shadow(0 0 6px ${areaColor})` }}
                    fill="url(#gArea)"
                    isAnimationActive={false}
                    dot={(props) => {
                      const isLast = props.index === chartData.length - 1;
                      if (chartData.length >= 60 && !isLast) return null;

                      const isBaseline = props.payload?.isBaseline;

                      if (isLast) {
                        return (
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={4}
                            fill="#fff"
                            stroke={areaColor}
                            style={{
                              animation: "pulse 2s infinite",
                              transformBox: "fill-box",
                              transformOrigin: "center",
                            }}
                          />
                        );
                      }

                      return (
                        <circle
                          cx={props.cx}
                          cy={props.cy}
                          r={isBaseline ? 3 : 2.5}
                          fill={isBaseline ? "#666" : areaColor}
                          stroke={isBaseline ? "#888" : "none"}
                          strokeWidth={isBaseline ? 1 : 0}
                          opacity={isBaseline ? 0.6 : 1}
                        />
                      );
                    }}
                    connectNulls
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* RECENT ENTRIES LIST */}
        {sortedEntries.length > 0 && (
          <div
            className="animate-in"
            style={{ marginTop: 20, animationDelay: "0.5s" }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#444",
                marginBottom: 8,
                fontWeight: 600,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
              }}
            >
              Recent Entries{" "}
              <span style={{ fontWeight: 400, color: "#333" }}>
                ({sortedEntries.length} total)
              </span>
            </div>
            <div
              className="glass-panel"
              style={{ maxHeight: 180, overflowY: "auto", borderRadius: 8 }}
            >
              {[...sortedEntries]
                .reverse()
                .slice(0, 20)
                .map((e, i) => {
                  const idx = sortedEntries.findIndex((x) => x.date === e.date);
                  const prev = idx > 0 ? sortedEntries[idx - 1] : null;
                  const change = prev ? e.balance - prev.balance : null;
                  const pos = change !== null && change >= 0;
                  return (
                    <div
                      key={e.date}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "7px 12px",
                        borderBottom:
                          i < 19 ? "1px solid rgba(255,255,255,0.05)" : "none",
                        transition: "background 0.2s",
                      }}
                      onMouseEnter={(ev) =>
                        (ev.currentTarget.style.background =
                          "rgba(255,255,255,0.03)")
                      }
                      onMouseLeave={(ev) =>
                        (ev.currentTarget.style.background = "transparent")
                      }
                    >
                      <span
                        style={{
                          color: "#666",
                          fontSize: 12,
                          fontFamily: "'Courier New',monospace",
                        }}
                      >
                        {formatDatePretty(e.date)}
                      </span>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 16,
                        }}
                      >
                        {change !== null && (
                          <span
                            style={{
                              fontSize: 11,
                              color: pos ? "#4caf7c" : "#e05555",
                            }}
                          >
                            {pos ? "+" : ""}
                            {privacyMode ? "$ ****" : `$${fmt(change)}`}
                          </span>
                        )}
                        <span
                          style={{
                            color: "#e8e8e8",
                            fontSize: 13,
                            fontWeight: 600,
                            minWidth: 90,
                            textAlign: "right",
                          }}
                        >
                          {privacyMode ? "$ ****" : `$${fmt(e.balance)}`}
                        </span>
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

