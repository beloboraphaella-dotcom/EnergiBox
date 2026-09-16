import { useEffect, useState } from "react";
import axios from "axios";
import Icon from "../components/Icon";
import { useLanguage } from "../context/LanguageContext";

const API = "http://localhost:8000";

// This card used to read "18:00 - 21:00 / High tariff period", mirroring
// an advisor constant. Cameroon's low-voltage tariff has no time-of-day
// pricing (see backend/tariff.py), so there is no expensive window to
// warn about. The slot now shows when the household actually draws the
// most, which is real and worth knowing.

const GAUGE_RADIUS = 45;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS; // 282.7, as in the mockup

/** Icon for a device, picked from its name. The backend only stores
 * "appliance" or "socket", so there is nothing better to key off yet. */
function deviceIcon(name = "") {
  const n = name.toLowerCase();
  if (/frig|fridge|réfrig|refrig|freezer|congel/.test(n)) return "kitchen";
  if (/clim|ac\b|air|cond/.test(n)) return "ac_unit";
  if (/heater|chauffe|boiler|ballon/.test(n)) return "water_heater";
  if (/light|lamp|lumi|ampoule/.test(n)) return "lightbulb";
  if (/tv|télé|tele|screen/.test(n)) return "tv";
  if (/fan|ventil/.test(n)) return "mode_fan";
  if (/pump|pompe/.test(n)) return "water_pump";
  return "power";
}

function formatWatts(watts) {
  if (watts >= 1000) return { value: (watts / 1000).toFixed(1), unit: "kW" };
  return { value: Math.round(watts).toString(), unit: "W" };
}

export default function Overview({ token, homeId, onOpenDevices }) {
  const { t, language } = useLanguage();
  const [overview, setOverview] = useState(null);
  const [devices, setDevices] = useState([]);
  const [hourly, setHourly] = useState(null);
  const [range, setRange] = useState("today");

  const locale = language === "fr" ? "fr-FR" : "en-US";
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    if (!homeId) return;
    let cancelled = false;

    const load = async () => {
      const results = await Promise.allSettled([
        axios.get(`${API}/stats/overview?home_id=${homeId}`, auth),
        axios.get(`${API}/devices?home_id=${homeId}`, auth),
        axios.get(`${API}/history/hourly?home_id=${homeId}`, auth),
      ]);
      if (cancelled) return;
      // Each card degrades on its own — one failing request must not blank
      // the whole dashboard.
      if (results[0].status === "fulfilled") setOverview(results[0].value.data);
      if (results[1].status === "fulfilled") setDevices(results[1].value.data);
      if (results[2].status === "fulfilled") setHourly(results[2].value.data);
    };

    load();
    const interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [homeId, token]);

  const liveWatts = devices.reduce((sum, d) => sum + (d.watts || 0), 0);
  const live = formatWatts(liveWatts);

  // The mockup's gauge has no stated maximum. Scaling against today's peak
  // makes it read as "current draw against the busiest the house has been
  // today", which is the only reference the data actually supplies.
  const peakWatts = Math.max(hourly?.max_watts || 0, liveWatts, 1);
  const gaugeRatio = Math.min(liveWatts / peakWatts, 1);
  const dashOffset = GAUGE_CIRCUMFERENCE * (1 - gaugeRatio);

  const todayKwh = overview?.today?.kwh ?? 0;
  const changeVsYesterday = overview?.today?.change_vs_yesterday ?? 0;
  const estimatedFcfa = overview?.month?.estimated_fcfa ?? 0;
  const projectedFcfa = overview?.month?.projected_fcfa ?? 0;
  const onlineCount = overview?.devices?.online ?? 0;

  // The household's own busiest hour, from today's readings. Distinct
  // from `peakWatts` above, which is the gauge's ceiling and folds in the
  // live reading.
  const peakHour = hourly?.peak_hour ?? null;
  const peakHourWatts = hourly?.max_watts ?? 0;

  const activeDevices = devices.slice(0, 8);

  return (
    <div className="max-w-7xl mx-auto py-lg space-y-lg">
      {/* Dashboard Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-background">
            {t("overview.title")}
          </h2>
          <p className="text-on-surface-variant mt-1">{t("overview.subtitle")}</p>
        </div>
        <div className="hidden md:flex items-center space-x-2 bg-surface-container px-3 py-1.5 rounded-full border border-outline-variant/50">
          <div
            className={`w-2 h-2 rounded-full ${onlineCount > 0 ? "bg-secondary pulse-dot" : "bg-outline"}`}
          />
          <span className="font-data-label text-data-label text-on-surface">
            {onlineCount > 0 ? t("overview.online") : t("overview.offline")}
          </span>
          <Icon
            name="wifi"
            className={onlineCount > 0 ? "text-secondary" : "text-outline"}
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      {/* Hero: bento grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-sm">
        {/* Real-time consumption gauge */}
        <div className="md:col-span-4 bg-surface rounded-xl border border-outline-variant/30 p-md flex flex-col items-center justify-center relative glass-card shadow-sm">
          <div className="absolute top-4 left-4 flex items-center space-x-1">
            <div className="w-2 h-2 rounded-full bg-error pulse-dot" />
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
              {t("overview.live")}
            </span>
          </div>
          <div className="relative w-48 h-48 mt-4">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" fill="none" r={GAUGE_RADIUS} stroke="#eff4ff" strokeWidth="8" />
              <circle
                className="transition-all duration-1000 ease-out"
                cx="50"
                cy="50"
                fill="none"
                r={GAUGE_RADIUS}
                stroke="#006a61"
                strokeDasharray={GAUGE_CIRCUMFERENCE.toFixed(1)}
                strokeDashoffset={dashOffset.toFixed(1)}
                strokeLinecap="round"
                strokeWidth="8"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display-metrics text-display-metrics text-on-surface">
                {live.value}
              </span>
              <span className="font-data-label text-data-label text-secondary mt-1">
                {live.unit} {t("overview.current")}
              </span>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-sm">
          {/* Today's usage */}
          <div className="bg-surface rounded-xl border border-outline-variant/30 p-md flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <span className="font-data-label text-data-label text-outline uppercase">
                {t("overview.todayUsage")}
              </span>
              <Icon name="electric_meter" className="text-secondary" />
            </div>
            <div>
              <div className="font-headline-lg text-headline-lg text-on-background">
                {todayKwh.toLocaleString(locale, { maximumFractionDigits: 1 })}{" "}
                <span className="font-body-md text-body-md text-outline">kWh</span>
              </div>
              <div className="mt-2 text-sm text-outline flex items-center">
                <Icon
                  name={changeVsYesterday <= 0 ? "trending_down" : "trending_up"}
                  className={`${changeVsYesterday <= 0 ? "text-secondary" : "text-error"} text-sm mr-1`}
                />
                <span>
                  {changeVsYesterday > 0 ? "+" : ""}
                  {changeVsYesterday}% {t("overview.vsYesterday")}
                </span>
              </div>
            </div>
          </div>

          {/* Estimated cost */}
          <div className="bg-primary-container text-on-primary-container rounded-xl p-md flex flex-col justify-between relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/5 rounded-full blur-xl" />
            <div className="flex justify-between items-start mb-4 relative z-10">
              <span className="font-data-label text-data-label text-primary-fixed-dim uppercase">
                {t("overview.estCost")}
              </span>
              <Icon name="payments" className="text-secondary-fixed" />
            </div>
            <div className="relative z-10">
              <div className="font-headline-lg text-headline-lg text-inverse-on-surface">
                {estimatedFcfa.toLocaleString(locale)}{" "}
                <span className="font-body-md text-body-md text-primary-fixed-dim">FCFA</span>
              </div>
              <div className="mt-2 text-sm text-primary-fixed-dim">
                {t("overview.projected")}: {projectedFcfa.toLocaleString(locale)} FCFA/
                {t("overview.perMonth")}
              </div>
            </div>
          </div>

          {/* Peak window */}
          <div className="bg-surface rounded-xl border border-outline-variant/30 p-md flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <span className="font-data-label text-data-label text-outline uppercase">
                {t("overview.peakTime")}
              </span>
              <Icon name="schedule" className="text-tertiary-container" />
            </div>
            <div>
              <div className="font-headline-md text-headline-md text-on-background">
                {peakHour === null
                  ? t("overview.peakNone")
                  : `${String(peakHour).padStart(2, "0")}:00`}
              </div>
              <div className="mt-2 text-sm text-outline flex items-center">
                <Icon name="bolt" className="text-tertiary-container text-sm mr-1" />
                <span>
                  {peakHour === null
                    ? t("overview.peakNoneHint")
                    : t("overview.peakDraw", {
                        watts: formatWatts(peakHourWatts).value,
                        unit: formatWatts(peakHourWatts).unit,
                      })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Power usage chart */}
      <PowerChart hourly={hourly} range={range} onRangeChange={setRange} />

      {/* Active devices */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-headline-md text-headline-md text-on-surface">
            {t("overview.activeDevices")}
          </h3>
          <button
            type="button"
            onClick={onOpenDevices}
            className="font-label-sm text-label-sm text-secondary hover:underline"
          >
            {t("overview.viewAll")}
          </button>
        </div>

        {activeDevices.length === 0 ? (
          <div className="bg-surface rounded-xl border border-outline-variant/30 p-md text-center text-on-surface-variant">
            {t("overview.noDevices")}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-sm">
            {activeDevices.map((device) => {
              const draw = formatWatts(device.watts || 0);
              return (
                <button
                  key={device.id}
                  type="button"
                  onClick={onOpenDevices}
                  className={
                    "bg-surface rounded-xl border border-outline-variant/30 p-4 flex flex-col justify-between h-32 text-left " +
                    "hover:border-secondary/50 transition-colors cursor-pointer group " +
                    (device.is_on ? "" : "opacity-60")
                  }
                >
                  <div className="flex justify-between items-start w-full">
                    <Icon
                      name={deviceIcon(device.name)}
                      weight={200}
                      className={
                        "text-on-surface-variant transition-colors " +
                        (device.is_on ? "group-hover:text-secondary" : "")
                      }
                    />
                    <div
                      className={
                        "w-8 h-4 rounded-full relative " +
                        (device.is_on ? "bg-secondary" : "bg-outline-variant/50")
                      }
                    >
                      <div
                        className={
                          "w-3 h-3 bg-white rounded-full absolute top-0.5 shadow-sm transition-all " +
                          (device.is_on ? "right-0.5" : "left-0.5")
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <div className="font-body-md text-body-md text-on-surface font-medium truncate">
                      {device.name}
                    </div>
                    <div
                      className={
                        "font-data-label text-data-label text-xs mt-1 " +
                        (device.is_on ? "text-secondary" : "text-outline")
                      }
                    >
                      {device.is_on ? `${draw.value} ${draw.unit}` : t("overview.off")}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** The 24-hour power curve. The mockup draws a hand-authored cubic path;
 * this builds the same shape from real points with a Catmull-Rom spline
 * converted to cubic Béziers, so the curve keeps the mockup's soft look
 * instead of turning into a polyline. */
function PowerChart({ hourly, range, onRangeChange }) {
  const { t } = useLanguage();
  const WIDTH = 1000;
  const HEIGHT = 200;

  const points = hourly?.points ?? [];
  const measured = points.filter((p) => p.watts !== null);
  const maxWatts = Math.max(hourly?.max_watts || 0, 1);

  const coords = measured.map((p) => ({
    x: (p.hour / 23) * WIDTH,
    y: HEIGHT - (p.watts / maxWatts) * (HEIGHT - 20) - 10,
  }));

  const linePath = buildSpline(coords);
  const areaPath = linePath
    ? `${linePath} L${coords[coords.length - 1].x},${HEIGHT} L${coords[0].x},${HEIGHT} Z`
    : null;

  const peak = measured.reduce(
    (best, p) => (best === null || p.watts > best.watts ? p : best),
    null
  );
  const peakCoord =
    peak && coords.length
      ? coords[measured.findIndex((p) => p.hour === peak.hour)]
      : null;

  return (
    <div className="bg-surface rounded-xl border border-outline-variant/30 p-md shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-headline-md text-headline-md text-on-surface">
          {t("overview.powerUsage")}
        </h3>
        <select
          value={range}
          onChange={(e) => onRangeChange(e.target.value)}
          className="bg-surface-container-lowest border border-outline-variant rounded font-label-sm text-label-sm text-on-surface py-1 px-2 focus:ring-secondary focus:border-secondary"
        >
          <option value="today">{t("overview.today")}</option>
          <option value="week">{t("overview.thisWeek")}</option>
        </select>
      </div>

      <div className="w-full h-64 relative">
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="border-b border-outline w-full h-0" />
          ))}
        </div>

        {linePath ? (
          <svg
            className="w-full h-full overflow-visible"
            preserveAspectRatio="none"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          >
            <defs>
              <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#006a61" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#006a61" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#chartGradient)" />
            <path
              d={linePath}
              fill="none"
              stroke="#006a61"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
            {peakCoord && (
              <circle
                cx={peakCoord.x}
                cy={peakCoord.y}
                fill="#ffffff"
                r="4"
                stroke="#006a61"
                strokeWidth="2"
              />
            )}
          </svg>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-on-surface-variant font-label-sm text-label-sm">
            {t("overview.noData")}
          </div>
        )}

        <div className="absolute bottom-0 w-full flex justify-between transform translate-y-6 px-2 font-data-label text-data-label text-outline text-xs">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:59</span>
        </div>
      </div>
    </div>
  );
}

/** Catmull-Rom through every point, emitted as cubic Béziers. */
function buildSpline(pts) {
  if (pts.length === 0) return null;
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;

  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}
