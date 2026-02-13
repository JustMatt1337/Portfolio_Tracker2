import { useState, useEffect, useMemo, useRef } from "react";
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

// --- CONSTANTS & CONFIG ---
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

const BENCHMARK_CACHE_KEY = "marketstack_benchmark_cache_v1";

function getBenchmarkRefreshKey(now = new Date()) {
  const utc = new Date(now.toISOString());
  // Use prior trading-day snapshot until after US market close (~21:00 UTC).
  if (utc.getUTCHours() < 21) {
    utc.setUTCDate(utc.getUTCDate() - 1);
  }
  return utc.toISOString().slice(0, 10);
}

async function loadBenchmarksOncePerDay() {
  const refreshKey = getBenchmarkRefreshKey();

  try {
    const cachedRaw = window.localStorage.getItem(BENCHMARK_CACHE_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached?.refreshKey === refreshKey) {
        return {
          sp500: Array.isArray(cached.sp500) ? cached.sp500 : [],
          nasdaq: Array.isArray(cached.nasdaq) ? cached.nasdaq : [],
        };
      }
    }
  } catch {
    // Ignore cache read errors and fetch fresh data.
  }

  const accessKey = "046605c85cf4732b26bff18118d43f27";
  const dateFrom = new Date();
  dateFrom.setUTCFullYear(dateFrom.getUTCFullYear() - 2);
  const dateFromStr = dateFrom.toISOString().slice(0, 10);

  const res = await fetch(
    `https://api.marketstack.com/v1/eod?access_key=${accessKey}&symbols=SPY,QQQ&sort=ASC&date_from=${dateFromStr}&limit=1000`
  );

  if (!res.ok) throw new Error("Failed benchmark fetch");
  const data = await res.json();
  const rows = Array.isArray(data?.data) ? data.data : [];

  const mapped = rows
    .map((r) => {
      const symbol = String(r?.symbol || "").toUpperCase();
      const rawDate = String(r?.date || "").slice(0, 10);
      const close = Number(r?.close);
      if (!rawDate || !Number.isFinite(close) || close <= 0) return null;
      return { symbol, date: rawDate, close };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  const sp500 = mapped
    .filter((r) => r.symbol.startsWith("SPY"))
    .map(({ date, close }) => ({ date, close }));
  const nasdaq = mapped
    .filter((r) => r.symbol.startsWith("QQQ"))
    .map(({ date, close }) => ({ date, close }));

  try {
    window.localStorage.setItem(
      BENCHMARK_CACHE_KEY,
      JSON.stringify({ refreshKey, sp500, nasdaq, fetchedAt: new Date().toISOString() })
    );
  } catch {
    // Ignore cache write errors.
  }

  return { sp500, nasdaq };
}

// --- ANIMATED NUMBER COMPONENT ---
const AnimatedNumber = ({ value, duration = 1200 }) => {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValueRef = useRef(value);

  useEffect(() => {
    let animationFrame;
    let start = prevValueRef.current;
    const end = value;
    if (start === end) {
      prevValueRef.current = value;
      return;
    }

    if (Math.abs(end - start) < 10) {
      setDisplayValue(end);
      prevValueRef.current = value;
      return;
    }

    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

      const current = start + (end - start) * ease;
      setDisplayValue(current);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    prevValueRef.current = value;
    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [value, duration]);

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
  const [metric, setMetric] = useState("value");

  // NEW: State for tooltip to ensure it renders reliably
  const [hoveredMonthStats, setHoveredMonthStats] = useState(null);
  const [scrubbedPoint, setScrubbedPoint] = useState(null);
  const [showSp500, setShowSp500] = useState(false);
  const [showNasdaq, setShowNasdaq] = useState(false);
  const [benchmarks, setBenchmarks] = useState({ sp500: [], nasdaq: [] });

  const fetchData = async () => {
    setLoading(true);
    const e = await loadFromStorage();
    if (e) setEntries(e);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const fetchBenchmarks = async () => {
      try {
        const data = await loadBenchmarksOncePerDay();
        setBenchmarks(data);
      } catch {
        setBenchmarks({ sp500: [], nasdaq: [] });
      }
    };

    fetchBenchmarks();
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

      // 1. Calculate Baselines
      const monthBaselines = {};
      MONTHS.forEach((_, mIdx) => {
        const prevMonthEntries = sortedEntries.filter((e) => {
          const d = new Date(e.date + "T00:00:00");
          return d.getMonth() === mIdx - 1;
        });

        if (prevMonthEntries.length > 0) {
          monthBaselines[mIdx] =
            prevMonthEntries[prevMonthEntries.length - 1].balance;
        } else {
          const thisMonthEntries = sortedEntries.filter(
            (e) => new Date(e.date + "T00:00:00").getMonth() === mIdx
          );
          if (thisMonthEntries.length > 0) {
            monthBaselines[mIdx] = thisMonthEntries[0].balance;
          }
        }
      });

      // 2. Initialize Day 0
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

      // 3. Process entries
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

    const mapped = dataToProcess.map((e) => {
      let val = e.balance;
      const target = effectiveStart * 100;

      if (view === "100x" && metric === "percent") {
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
        originalBalance: e.balance,
        value: val,
        isBaseline: false,
      };
    });

    if (view !== "overall" && view !== "100x" && dataToProcess.length > 0) {
      if (metric !== "value") {
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

  const viewBaseline = useMemo(() => {
    if (view === "overall" || view === "100x") return effectiveStart;
    if (view === "overlay") return effectiveStart;

    const mi = parseInt(view);
    const monthEntries = sortedEntries.filter(
      (e) => new Date(e.date + "T00:00:00").getMonth() === mi
    );
    if (!monthEntries.length) return effectiveStart;

    const firstEntryIdx = sortedEntries.indexOf(monthEntries[0]);
    const prevEntry = firstEntryIdx > 0 ? sortedEntries[firstEntryIdx - 1] : null;
    return prevEntry ? prevEntry.balance : monthEntries[0].balance;
  }, [view, sortedEntries, effectiveStart]);

  const chartDataWithBenchmarks = useMemo(() => {
    if (
      !chartData.length ||
      view === "overlay" ||
      (!showSp500 && !showNasdaq)
    )
      return chartData;

    const getCloseOnOrBefore = (series, targetDate) => {
      let lo = 0;
      let hi = series.length - 1;
      let best = null;

      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const curr = series[mid];
        if (curr.date <= targetDate) {
          best = curr;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return best?.close ?? null;
    };

    const anchorDate = chartData[0]?.date;
    if (!anchorDate) return chartData;

    const spBaseClose = getCloseOnOrBefore(benchmarks.sp500, anchorDate);
    const nqBaseClose = getCloseOnOrBefore(benchmarks.nasdaq, anchorDate);
    const target100x = effectiveStart * 100;

    const mapBenchmark = (pointDate, baseClose, series) => {
      if (!baseClose) return null;
      const pointClose = getCloseOnOrBefore(series, pointDate);
      if (!pointClose) return null;

      const benchmarkValue = viewBaseline * (pointClose / baseClose);

      if (view === "100x" && metric === "percent") {
        return (benchmarkValue / target100x) * 100;
      }
      if (metric === "profit") return benchmarkValue - viewBaseline;
      if (metric === "percent") {
        return viewBaseline > 0
          ? ((benchmarkValue - viewBaseline) / viewBaseline) * 100
          : 0;
      }
      return benchmarkValue;
    };

    return chartData.map((point) => ({
      ...point,
      sp500Compare: mapBenchmark(point.date, spBaseClose, benchmarks.sp500),
      nasdaqCompare: mapBenchmark(point.date, nqBaseClose, benchmarks.nasdaq),
    }));
  }, [
    chartData,
    view,
    showSp500,
    showNasdaq,
    benchmarks,
    metric,
    viewBaseline,
    effectiveStart,
  ]);

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

  const scrubbedHeaderStats = useMemo(() => {
    if (!scrubbedPoint?.originalBalance) return null;

    const scrubbedBalance = scrubbedPoint.originalBalance;
    const scrubbedPnl = scrubbedBalance - effectiveStart;
    const scrubbedPct =
      effectiveStart > 0 ? (scrubbedPnl / effectiveStart) * 100 : 0;

    return {
      balance: scrubbedBalance,
      pnl: scrubbedPnl,
      pct: scrubbedPct,
      date: scrubbedPoint.date,
    };
  }, [scrubbedPoint, effectiveStart]);

  const activeHeaderBalance = scrubbedHeaderStats
    ? scrubbedHeaderStats.balance
    : stats.currentBalance;
  const activeHeaderPnl = scrubbedHeaderStats
    ? scrubbedHeaderStats.pnl
    : stats.overallPnl;
  const activeHeaderPct = scrubbedHeaderStats
    ? scrubbedHeaderStats.pct
    : stats.overallPct;
  const activeHeaderMulti =
    effectiveStart > 0 ? activeHeaderBalance / effectiveStart : 0;

  // --- BUTTON HOVER STATS ---
  const allMonthFinals = useMemo(() => {
    const stats = {};
    monthsWithData.forEach((mIdx) => {
      const mStr = MONTHS[mIdx];
      const me = sortedEntries.filter(
        (e) => new Date(e.date + "T00:00:00").getMonth() === mIdx
      );
      if (!me.length) return;

      const lastEntry = me[me.length - 1];
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

  // Theme Logic
  const isWinning = activeHeaderPnl >= 0;

  const themeColors = isWinning
    ? {
        primary: "#10b981", // Emerald 500
        secondary: "#3b82f6", // Blue 500
        glow: "rgba(16, 185, 129, 0.4)",
      }
    : {
        primary: "#ef4444", // Red 500
        secondary: "#8b5cf6", // Violet 500
        glow: "rgba(239, 68, 68, 0.4)",
      };

  const semanticColors = {
    positive: "#10b981",
    negative: "#ef4444",
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
          fontFamily: "'JetBrains Mono', monospace",
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
                background: isHighlighted
                  ? "rgba(255,255,255,0.08)"
                  : "transparent",
                transition: "all 0.2s",
                border: isHighlighted
                  ? `1px solid ${entry.color}`
                  : "1px solid transparent",
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: entry.color,
                  boxShadow: isHighlighted ? `0 0 8px ${entry.color}` : "none",
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
        <div className="glass-tooltip">
          <div
            style={{
              color: "#888",
              fontSize: 11,
              marginBottom: 8,
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Day {label} Comparison
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
                  marginBottom: 4,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                <span style={{ color: p.color, marginRight: 12 }}>
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
        <div className="glass-tooltip">
          <div
            style={{
              color: "#aaa",
              fontSize: 11,
              fontStyle: "italic",
              marginBottom: 5,
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Starting Point
          </div>
          <div
            style={{
              color: "#fff",
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
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
      <div className="glass-tooltip">
        <div
          style={{
            color: "#888",
            fontSize: 11,
            marginBottom: 6,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "-0.5px",
          }}
        >
          {formatDatePretty(d.date)}
        </div>
        <div
          style={{
            color: "#fff",
            fontSize: 15,
            fontWeight: 700,
            marginBottom: 4,
            fontFamily: "'JetBrains Mono', monospace",
            textShadow: "0 2px 10px rgba(0,0,0,0.5)",
          }}
        >
          {mainValueDisplay}
        </div>
        {metric !== "value" && (
          <div
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Bal: {privacyMode ? "****" : `$${fmt(d.originalBalance)}`}
          </div>
        )}
      </div>
    );
  };

  const getAxisTickFormatter = (val) => {
    if (privacyMode && (metric === "value" || metric === "profit"))
      return "****";
    if (metric === "percent") return `${val.toFixed(0)}%`;
    if (metric === "profit") {
      return (
        (val >= 0 ? "+" : "") +
        (Math.abs(val) >= 1000 ? (val / 1000).toFixed(1) + "k" : val)
      );
    }
    return val >= 1000 ? (val / 1000).toFixed(1) + "K" : val.toLocaleString();
  };

  const get100xDomain = () => {
    if (view !== "100x") return ["auto", "auto"];
    const target = effectiveStart * 100;
    if (metric === "percent") return [0, 100];
    if (metric === "profit") return [0, target - effectiveStart];
    return [0, Math.max(target, stats.currentBalance * 1.1)];
  };

  // Check last data point for color logic
  const isPositiveValue =
    chartData.length > 0 &&
    chartData[chartData.length - 1].value >=
      (metric === "value" ? chartData[0].value : 0);
  const areaColor = isPositiveValue ? themeColors.primary : "#ef4444";

  // Is a specific month selected?
  const isMonthView = !["overall", "100x", "overlay"].includes(view);
  const selectedMonthName = isMonthView ? MONTHS[parseInt(view)] : "";

  return (
    <div
      style={{
        background: "#050505",
        minHeight: "100vh",
        fontFamily: "'Inter', sans-serif",
        color: "#e2e8f0",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* GLOBAL STYLES & FONTS */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

        /* ANIMATIONS */
        @keyframes aurora-1 {
          0% { transform: translate(0, 0) scale(1); opacity: 0.12; }
          33% { transform: translate(30px, -50px) scale(1.1); opacity: 0.15; }
          66% { transform: translate(-20px, 20px) scale(0.9); opacity: 0.12; }
          100% { transform: translate(0, 0) scale(1); opacity: 0.12; }
        }
        @keyframes aurora-2 {
          0% { transform: translate(0, 0) scale(1); opacity: 0.1; }
          50% { transform: translate(-40px, 30px) scale(1.2); opacity: 0.15; }
          100% { transform: translate(0, 0) scale(1); opacity: 0.1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse-soft { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }

        /* CLASSES */
        .animate-in {
          animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }
        
        .glass-panel {
          background: rgba(20, 20, 24, 0.6);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          /* BORDER REMOVED AS REQUESTED */
          border: none;
          box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5);
        }

        .glass-tooltip {
          background: rgba(10, 10, 12, 0.9);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 12px 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6);
          min-width: 160px;
        }

        .mono-num { font-family: 'JetBrains Mono', monospace; }
        
        .toggle-btn {
          background: rgba(255,255,255,0.03);
          border: none;
          color: #64748b;
          padding: 6px 14px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: 'Inter', sans-serif;
          letter-spacing: 0.5px;
        }
        .toggle-btn:hover { color: #94a3b8; background: rgba(255,255,255,0.06); }
        .toggle-btn.active {
          background: rgba(255,255,255,0.1);
          color: #f8fafc;
        }

        .nav-btn {
            position: relative;
            background: rgba(20, 20, 24, 0.4);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 8px;
            padding: 6px 12px;
            font-size: 12px;
            font-weight: 500;
            color: #94a3b8;
            cursor: pointer;
            transition: all 0.2s;
        }
        .nav-btn:hover {
            background: rgba(255,255,255,0.08);
            color: #fff;
            border-color: rgba(255,255,255,0.1);
        }
        .nav-btn.active {
            background: rgba(255,255,255,0.12);
            color: #fff;
            border-color: rgba(255,255,255,0.15);
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }

        /* SCROLLBAR */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        body { 
          margin: 0;
        }
      `}</style>

      {/* --- AURORA BACKGROUND --- */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-10%",
            left: "10%",
            width: "50vw",
            height: "50vw",
            background: `radial-gradient(circle, ${themeColors.primary} 0%, transparent 70%)`,
            filter: "blur(120px)",
            opacity: 0.12,
            animation: "aurora-1 20s ease-in-out infinite alternate",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "10%",
            right: "-10%",
            width: "40vw",
            height: "40vw",
            background: `radial-gradient(circle, ${themeColors.secondary} 0%, transparent 70%)`,
            filter: "blur(100px)",
            opacity: 0.1,
            animation: "aurora-2 15s ease-in-out infinite alternate",
          }}
        />
      </div>

      {/* --- CONTENT CONTAINER --- */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 1200,
          margin: "0 auto",
          padding: "40px 20px",
        }}
      >
        {/* HEADER AREA */}
        <div
          className="animate-in"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: 30,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: themeColors.primary,
                  border: `1px solid ${themeColors.primary}`,
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                LIVE
              </span>
              <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>
                100x Challenge
              </span>
            </div>
            <h1
              className="mono-num"
              style={{
                fontSize: 48,
                fontWeight: 600,
                margin: 0,
                letterSpacing: "-1.5px",
                color: "#fff",
                lineHeight: 1,
              }}
            >
              {privacyMode ? (
                "****"
              ) : (
                <>
                  <span
                    style={{
                      fontSize: 28,
                      verticalAlign: "top",
                      marginRight: 4,
                      opacity: 0.6,
                    }}
                  >
                    $
                  </span>
                  <AnimatedNumber
                    value={activeHeaderBalance}
                    duration={scrubbedHeaderStats ? 180 : 1200}
                  />
                </>
              )}
            </h1>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 12,
            }}
          >
            {/* STATS ROW */}
            <div style={{ display: "flex", gap: 24, alignItems: "flex-end" }}>
              {isMonthView && (
                <div
                  style={{
                    textAlign: "right",
                    borderRight: "1px solid rgba(255,255,255,0.1)",
                    paddingRight: 24,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "#64748b",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {selectedMonthName}
                  </div>
                  <div
                    className="mono-num"
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color:
                        stats.monthPnl >= 0
                          ? semanticColors.positive
                          : semanticColors.negative,
                    }}
                  >
                    {stats.monthPnl >= 0 ? "+" : ""}
                    {privacyMode ? "****" : fmt(stats.monthPnl)}
                    <span style={{ fontSize: 12, opacity: 0.8, marginLeft: 6 }}>
                      ({stats.monthPct.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              )}

              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#64748b",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Total P&L
                </div>
                <div
                  className="mono-num"
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: isWinning
                      ? semanticColors.positive
                      : semanticColors.negative,
                  }}
                >
                  {activeHeaderPnl >= 0 ? "+" : ""}
                  {privacyMode ? (
                    "****"
                  ) : (
                    <AnimatedNumber
                      value={Math.abs(activeHeaderPnl)}
                      duration={scrubbedHeaderStats ? 180 : 1200}
                    />
                  )}
                  <span style={{ fontSize: 12, opacity: 0.8, marginLeft: 6 }}>
                    ({activeHeaderPct >= 0 ? "+" : ""}
                    <AnimatedNumber
                      value={Math.abs(activeHeaderPct)}
                      duration={scrubbedHeaderStats ? 180 : 1200}
                    />
                    %)
                  </span>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#64748b",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Multiple
                </div>
                <div
                  className="mono-num"
                  style={{ fontSize: 16, fontWeight: 600, color: "#e2e8f0" }}
                >
                  <AnimatedNumber
                    value={activeHeaderMulti}
                    duration={scrubbedHeaderStats ? 180 : 1200}
                  />
                  x
                </div>
              </div>
            </div>

            {/* CONTROLS */}
            <div
              className="glass-panel"
              style={{ display: "flex", padding: 4, borderRadius: 8, gap: 4 }}
            >
              <div
                style={{ display: "flex", borderRadius: 4, overflow: "hidden" }}
              >
                <button
                  className={`toggle-btn ${metric === "value" ? "active" : ""}`}
                  onClick={() => setMetric("value")}
                >
                  Value
                </button>
                <button
                  className={`toggle-btn ${
                    metric === "profit" ? "active" : ""
                  }`}
                  onClick={() => setMetric("profit")}
                >
                  Profit
                </button>
                <button
                  className={`toggle-btn ${
                    metric === "percent" ? "active" : ""
                  }`}
                  onClick={() => setMetric("percent")}
                >
                  %
                </button>
              </div>
              <div
                style={{
                  width: 1,
                  background: "rgba(255,255,255,0.1)",
                  margin: "2px 0",
                }}
              />
              <button
                onClick={() => setPrivacyMode(!privacyMode)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: privacyMode ? themeColors.primary : "#64748b",
                  cursor: "pointer",
                  padding: "0 8px",
                  fontSize: 14,
                }}
              >
                {privacyMode ? "👁️‍🗨️" : "👁️"}
              </button>
              <button
                onClick={fetchData}
                disabled={loading}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#64748b",
                  cursor: "pointer",
                  padding: "0 8px",
                  fontSize: 14,
                }}
              >
                {loading ? "↻" : "⟳"}
              </button>
            </div>
          </div>
        </div>

        {/* PROGRESS HUD */}
        {effectiveStart > 0 && stats.currentBalance > 0 && (
          <div
            className="glass-panel animate-in"
            style={{
              marginBottom: 30,
              padding: "16px 20px",
              borderRadius: 16,
              animationDelay: "0.1s",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
                fontSize: 12,
              }}
            >
              <span style={{ color: "#94a3b8" }}>
                Progress to Target (
                {privacyMode ? "$****" : `$${fmt(effectiveStart * 100)}`})
              </span>
              <span
                className="mono-num"
                style={{ color: themeColors.secondary, fontWeight: 600 }}
              >
                {((stats.overallMulti / 100) * 100).toFixed(3)}%
              </span>
            </div>

            <div
              style={{
                height: 8,
                background: "rgba(255,255,255,0.05)",
                borderRadius: 4,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(100, (stats.overallMulti / 100) * 100)}%`,
                  background: `linear-gradient(90deg, ${themeColors.primary}, ${themeColors.secondary})`,
                  boxShadow: `0 0 10px ${themeColors.glow}`,
                  borderRadius: 4,
                  transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            </div>

            {stats.projectedDate && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: "#64748b",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: themeColors.secondary,
                    animation: "pulse-soft 2s infinite",
                  }}
                />
                {/* TEXT REVERTED HERE */}
                Target hit by{" "}
                <span style={{ color: "#e2e8f0" }}>
                  {stats.projectedDate}
                </span>{" "}
                based on current velocity.
              </div>
            )}
          </div>
        )}

        {/* VIEW NAVIGATION WITH RELIABLE STATE-BASED HOVER */}
        <div
          className="animate-in"
          style={{
            marginBottom: 16,
            animationDelay: "0.2s",
            overflowX: "auto",
            paddingBottom: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              minWidth: "min-content",
              alignItems: "center",
            }}
          >
            <button
              onClick={() => setView("overall")}
              className={`nav-btn ${view === "overall" ? "active" : ""}`}
            >
              Overall
            </button>
            <button
              onClick={() => setView("100x")}
              className={`nav-btn ${view === "100x" ? "active" : ""}`}
            >
              100x Progress
            </button>
            <button
              onClick={() => setView("overlay")}
              className={`nav-btn ${view === "overlay" ? "active" : ""}`}
            >
              Month Overlay
            </button>

            <div
              style={{
                width: 1,
                height: 24,
                background: "rgba(255,255,255,0.1)",
                margin: "0 8px",
              }}
            />

            {MONTHS.map((m, i) => {
              const has = monthsWithData.has(i);
              const active = view === String(i);
              const stats = allMonthFinals[m];

              return (
                <div key={m} style={{ position: "relative" }}>
                  <button
                    onClick={() => has && setView(String(i))}
                    onMouseEnter={() =>
                      has &&
                      setHoveredMonthStats(stats ? { name: m, ...stats } : null)
                    }
                    onMouseLeave={() => setHoveredMonthStats(null)}
                    disabled={!has}
                    className={`nav-btn ${active ? "active" : ""}`}
                    style={{
                      opacity: has ? 1 : 0.3,
                      cursor: has ? "pointer" : "default",
                    }}
                  >
                    {m}
                    {has && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: -4,
                          left: "50%",
                          transform: "translateX(-50%)",
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: themeColors.primary,
                          opacity: 0.6,
                        }}
                      />
                    )}
                  </button>

                  {/* STATE-BASED TOOLTIP FOR RELIABILITY */}
                  {hoveredMonthStats && hoveredMonthStats.name === m && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: "135%",
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "rgba(10, 10, 14, 0.95)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        padding: "8px 12px",
                        borderRadius: 6,
                        whiteSpace: "nowrap",
                        zIndex: 100,
                        pointerEvents: "none",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                      }}
                    >
                      <div
                        style={{
                          color: "#94a3b8",
                          fontSize: 10,
                          fontWeight: 600,
                          marginBottom: 2,
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        {m} Summary
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 11,
                        }}
                      >
                        <span
                          style={{
                            color:
                              hoveredMonthStats.profit >= 0
                                ? semanticColors.positive
                                : semanticColors.negative,
                            fontWeight: 600,
                          }}
                        >
                          {hoveredMonthStats.profit >= 0 ? "+" : ""}$
                          {fmt(hoveredMonthStats.profit)}
                        </span>
                        <span
                          style={{
                            color:
                              hoveredMonthStats.percent >= 0
                                ? semanticColors.positive
                                : semanticColors.negative,
                          }}
                        >
                          ({hoveredMonthStats.percent >= 0 ? "+" : ""}
                          {hoveredMonthStats.percent.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {view !== "overlay" && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              justifyContent: "center",
              marginBottom: 12,
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {[
              { key: "sp500", label: "S&P", color: "#f59e0b", enabled: showSp500 },
              {
                key: "nasdaq",
                label: "Nasdaq",
                color: "#22d3ee",
                enabled: showNasdaq,
              },
            ].map((benchmark) => (
              <div
                key={benchmark.key}
                onClick={() =>
                  benchmark.key === "sp500"
                    ? setShowSp500((prev) => !prev)
                    : setShowNasdaq((prev) => !prev)
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  opacity: benchmark.enabled ? 1 : 0.3,
                  padding: "4px 8px",
                  borderRadius: 4,
                  transition: "all 0.2s",
                  border: benchmark.enabled
                    ? `1px solid ${benchmark.color}`
                    : "1px solid transparent",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: benchmark.color,
                    boxShadow: benchmark.enabled
                      ? `0 0 8px ${benchmark.color}`
                      : "none",
                  }}
                />
                <span
                  style={{
                    color: benchmark.enabled ? "#fff" : "#888",
                    fontWeight: benchmark.enabled ? 600 : 400,
                    transition: "color 0.2s",
                  }}
                >
                  {benchmark.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* CHART CONTAINER */}
        <div
          className="glass-panel animate-in"
          style={{
            padding: "20px 20px 10px 0",
            borderRadius: 16,
            minHeight: 420,
            animationDelay: "0.3s",
          }}
        >
          {loading ? (
            <div
              style={{
                height: 380,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.1)",
                  borderTopColor: themeColors.primary,
                  animation: "spin 1s linear infinite",
                }}
              />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart
                data={chartDataWithBenchmarks}
                margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                onMouseMove={(state) => {
                  if (view === "overlay") return;
                  const activeIndex = state?.activeTooltipIndex;
                  if (activeIndex == null) {
                    setScrubbedPoint(null);
                    return;
                  }

                  const point = chartData[activeIndex];
                  if (!point || point.isBaseline) {
                    setScrubbedPoint(null);
                    return;
                  }

                  setScrubbedPoint(point);
                }}
                onMouseLeave={() => setScrubbedPoint(null)}
              >
                <defs>
                  <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={areaColor} stopOpacity={0.4} />
                    <stop
                      offset="100%"
                      stopColor={areaColor}
                      stopOpacity={0.0}
                    />
                  </linearGradient>
                  {/* SOFTENED GLOW FILTER */}
                  <filter
                    id="glow"
                    x="-50%"
                    y="-50%"
                    width="200%"
                    height="200%"
                  >
                    <feGaussianBlur
                      in="SourceGraphic"
                      stdDeviation="12"
                      result="blur"
                    />
                    <feComponentTransfer in="blur" result="softBlur">
                      <feFuncA type="linear" slope="0.5" />
                    </feComponentTransfer>
                    <feMerge>
                      <feMergeNode in="softBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{
                    fill: "#64748b",
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                  interval={view === "overlay" ? 2 : "preserveStartEnd"}
                />
                <YAxis
                  domain={get100xDomain()}
                  tickFormatter={getAxisTickFormatter}
                  tick={{
                    fill: "#64748b",
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                  axisLine={false}
                  tickLine={false}
                  dx={-10}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{
                    stroke: "rgba(255,255,255,0.1)",
                    strokeWidth: 1,
                    strokeDasharray: "4 4",
                  }}
                />

                {metric !== "value" && view !== "100x" && (
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
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
                          : 0.1
                        : isHidden
                        ? 0
                        : 0.8;

                      return (
                        <Line
                          key={m}
                          type="monotone"
                          dataKey={m}
                          stroke={OVERLAY_COLORS[i % OVERLAY_COLORS.length]}
                          strokeWidth={isHighlighted ? 3 : 1.5}
                          strokeOpacity={opacity}
                          dot={false}
                          activeDot={{ r: 6, strokeWidth: 0 }}
                          connectNulls
                          animationDuration={1000}
                          filter="url(#glow)"
                        />
                      );
                    })}
                    <Legend content={<CustomLegend />} />
                  </>
                ) : (
                  <>
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={areaColor}
                      strokeWidth={3}
                      fill="url(#gArea)"
                      animationDuration={1500}
                      filter="url(#glow)"
                      dot={(props) => {
                        const isLast = props.index === chartDataWithBenchmarks.length - 1;
                        if (!isLast)
                          return <circle cx={props.cx} cy={props.cy} r={0} />;
                        return (
                          <g>
                            <circle
                              cx={props.cx}
                              cy={props.cy}
                              r={10}
                              fill={areaColor}
                              opacity={0.2}
                              style={{ animation: "pulse-soft 2s infinite" }}
                            />
                            <circle
                              cx={props.cx}
                              cy={props.cy}
                              r={4}
                              fill="#fff"
                            />
                          </g>
                        );
                      }}
                    />
                    {(showSp500 || showNasdaq) && (
                      <>
                        {showSp500 && (
                          <Line
                            type="monotone"
                            dataKey="sp500Compare"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            strokeDasharray="5 4"
                            dot={false}
                            connectNulls
                            animationDuration={1200}
                          />
                        )}
                        {showNasdaq && (
                          <Line
                            type="monotone"
                            dataKey="nasdaqCompare"
                            stroke="#22d3ee"
                            strokeWidth={2}
                            strokeDasharray="2 4"
                            dot={false}
                            connectNulls
                            animationDuration={1200}
                          />
                        )}
                      </>
                    )}
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* RECENT ACTIVITY LIST */}
        {sortedEntries.length > 0 && (
          <div
            className="animate-in"
            style={{ marginTop: 30, animationDelay: "0.4s" }}
          >
            <div
              style={{
                fontSize: 12,
                color: "#94a3b8",
                marginBottom: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Recent Ledger
            </div>
            <div
              className="glass-panel"
              style={{
                maxHeight: 250,
                overflowY: "auto",
                borderRadius: 12,
                padding: "0 4px",
              }}
            >
              {[...sortedEntries]
                .reverse()
                .slice(0, 20)
                .map((e, i) => {
                  const idx = sortedEntries.findIndex((x) => x.date === e.date);
                  const prev = idx > 0 ? sortedEntries[idx - 1] : null;
                  const change = prev ? e.balance - prev.balance : 0;
                  const isPos = change >= 0;

                  return (
                    <div
                      key={e.date}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "12px 16px",
                        borderBottom: "1px solid rgba(255,255,255,0.03)",
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
                        className="mono-num"
                        style={{ color: "#94a3b8", fontSize: 12 }}
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
                        {prev && (
                          <span
                            className="mono-num"
                            style={{
                              fontSize: 12,
                              color: isPos
                                ? semanticColors.positive
                                : semanticColors.negative,
                            }}
                          >
                            {isPos ? "+" : ""}
                            {privacyMode ? "$****" : `$${fmt(change)}`}
                          </span>
                        )}
                        <span
                          className="mono-num"
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#e2e8f0",
                            minWidth: 80,
                            textAlign: "right",
                          }}
                        >
                          {privacyMode ? "$****" : `$${fmt(e.balance)}`}
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
