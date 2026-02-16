export function getBenchmarkRefreshKey(now = new Date()) {
  const utc = new Date(now.toISOString());

  // Use prior trading-day snapshot until after US market close (~21:00 UTC).
  if (utc.getUTCHours() < 21) {
    utc.setUTCDate(utc.getUTCDate() - 1);
  }

  return utc.toISOString().slice(0, 10);
}
