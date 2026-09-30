import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import Icon from "../components/Icon";
import Modal from "../components/GlassModal";
import Skeleton from "../components/Skeleton";
import Switch from "../components/Switch";
import { useToast } from "../components/Toast";
import { deviceIcon } from "../utils/deviceIcon";
import { useLanguage } from "../context/LanguageContext";
import { useLiveRefresh } from "../live/LiveContext";
import { useDeviceToggle } from "../live/useDeviceToggle";

const API = "http://localhost:8000";

// This card used to read "18:00 - 21:00 / High tariff period", mirroring
// an advisor constant. Cameroon's low-voltage tariff has no time-of-day
// pricing (see backend/tariff.py), so there is no expensive window to
// warn about. The slot now shows when the household actually draws the
// most, which is real and worth knowing.

const GAUGE_RADIUS = 45;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS; // 282.7, as in the mockup

function formatWatts(watts, locale) {
  if (watts >= 1000) {
    return { value: (watts / 1000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), unit: "kW" };
  }
  return { value: Math.round(watts).toLocaleString(locale), unit: "W" };
}

export default function Overview({ token, homeId, onOpenDevices, onOpenDevice }) {
  const { t, tn, locale } = useLanguage();
  const toast = useToast();
  const [overview, setOverview] = useState(null);
  const [devices, setDevices] = useState([]);
  const [hourly, setHourly] = useState(null);
  const [range, setRange] = useState("today");
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [allOffOpen, setAllOffOpen] = useState(false);
  const [switchingAll, setSwitchingAll] = useState(false);

  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const setDeviceState = useCallback((mac, isOn) => {
    setDevices((list) => list.map((d) => (d.mac === mac ? { ...d, is_on: isOn } : d)));
  }, []);
  const { toggle, apply, busy } = useDeviceToggle(token, setDeviceState);

  const load = async () => {
    if (!homeId) return;
    const results = await Promise.allSettled([
      axios.get(`${API}/stats/overview?home_id=${homeId}`, auth),
      axios.get(`${API}/devices?home_id=${homeId}`, auth),
      axios.get(`${API}/history/hourly?home_id=${homeId}`, auth),
    ]);
    // Each card degrades on its own — one failing request must not blank
    // the whole dashboard.
    if (results[0].status === "fulfilled") setOverview(results[0].value.data);
    if (results[1].status === "fulfilled") setDevices(apply(results[1].value.data));
    if (results[2].status === "fulfilled") setHourly(results[2].value.data);
  };

  useEffect(() => {
    setOverview(null);
    load();
  }, [homeId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  useLiveRefresh(load, { topics: ["devices", "alerts"], interval: 3000 });

  const switchAllOff = async () => {
    setSwitchingAll(true);
    try {
      const res = await axios.post(`${API}/homes/${homeId}/all-off`, null, auth);
      const switched = res.data.switched || [];
      setDevices((list) => list.map((d) => (switched.includes(d.mac) ? { ...d, is_on: false } : d)));
      toast.show(tn("allOff.done", switched.length), { tone: "success" });
      if (res.data.failed?.length) toast.show(tn("allOff.partial", res.data.failed.length), { tone: "error" });
    } catch (err) {
      toast.show(err.response?.data?.detail || t("allOff.error"), { tone: "error" });
    }
    setSwitchingAll(false);
    setAllOffOpen(false);
    load();
  };

  if (!overview && devices.length === 0) {
    return (
      <div role="status" aria-label={t("common.loading")} className="max-w-7xl mx-auto py-lg space-y-lg">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <Skeleton className="h-36" />
        <div className="grid grid-cols-1 md:grid-cols-12 gap-sm">
          <Skeleton className="md:col-span-4 h-64" />
          <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-sm">
            {[0, 1].map((i) => <Skeleton key={i} className="h-64" />)}
          </div>
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const liveWatts = devices.reduce((sum, d) => sum + (d.watts || 0), 0);
  const live = formatWatts(liveWatts, locale);

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
  const budgetFcfa = overview?.month?.budget_fcfa ?? null;
  const onlineCount = overview?.devices?.online ?? 0;

  // The household's own busiest hour, from today's readings. Distinct
  // from `peakWatts` above, which is the gauge's ceiling and folds in the
  // live reading.
  const peakHour = hourly?.peak_hour ?? null;
  const peakHourWatts = hourly?.max_watts ?? 0;

  const activeDevices = devices.slice(0, 8);
  const onDevices = devices.filter((d) => d.is_on);

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
        <div className="hidden md:flex items-center space-x-2 glass-subtle px-3 py-1.5 rounded-full">
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

      {/* Money first: what the month costs, where it is heading, and how
          that compares with the household's own budget. */}
      <BudgetCard
        estimated={estimatedFcfa}
        projected={projectedFcfa}
        budget={budgetFcfa}
        onEdit={() => setBudgetOpen(true)}
      />

      {/* Hero: bento grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-sm">
        {/* Real-time consumption gauge */}
        <div className="md:col-span-4 glass rounded-2xl p-md flex flex-col items-center justify-center relative">
          <div className="absolute top-4 left-4 flex items-center space-x-1">
            <div className="w-2 h-2 rounded-full bg-error pulse-dot" />
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
              {t("overview.live")}
            </span>
          </div>
          <div className="relative w-48 h-48 mt-4">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" fill="none" r={GAUGE_RADIUS} stroke="rgba(255,255,255,0.75)" strokeWidth="8" />
              <defs>
                <linearGradient id="gaugeGradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#6bd8cb" />
                  <stop offset="100%" stopColor="#006a61" />
                </linearGradient>
              </defs>
              <circle
                className="transition-all duration-1000 ease-out"
                cx="50"
                cy="50"
                fill="none"
                r={GAUGE_RADIUS}
                stroke="url(#gaugeGradient)"
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
        <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-sm">
          {/* Today's usage */}
          <div className="glass rounded-2xl p-md flex flex-col justify-between">
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
                  {changeVsYesterday.toLocaleString(locale)}% {t("overview.vsYesterday")}
                </span>
              </div>
            </div>
          </div>

          {/* Peak window */}
          <div className="glass rounded-2xl p-md flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <span className="font-data-label text-data-label text-outline uppercase">
                {t("overview.peakTime")}
              </span>
              <Icon name="schedule" className="text-on-tertiary-container" />
            </div>
            <div>
              <div className="font-headline-md text-headline-md text-on-background">
                {peakHour === null
                  ? t("overview.peakNone")
                  : `${String(peakHour).padStart(2, "0")}:00`}
              </div>
              <div className="mt-2 text-sm text-outline flex items-center">
                <Icon name="bolt" className="text-on-tertiary-container text-sm mr-1" />
                <span>
                  {peakHour === null
                    ? t("overview.peakNoneHint")
                    : t("overview.peakDraw", {
                        watts: formatWatts(peakHourWatts, locale).value,
                        unit: formatWatts(peakHourWatts, locale).unit,
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
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h3 className="font-headline-md text-headline-md text-on-surface">
            {t("overview.activeDevices")}
          </h3>
          <div className="flex items-center gap-2">
            {onDevices.length > 0 && (
              <button type="button" onClick={() => setAllOffOpen(true)} className="btn-glass py-2">
                <Icon name="power_settings_new" style={{ fontSize: "18px" }} />
                {t("allOff.button")}
              </button>
            )}
            <button
              type="button"
              onClick={onOpenDevices}
              className="font-label-sm text-label-sm text-secondary hover:underline px-2 py-2"
            >
              {t("overview.viewAll")}
            </button>
          </div>
        </div>

        {activeDevices.length === 0 ? (
          <div className="glass rounded-2xl p-md text-center text-on-surface-variant">
            {t("overview.noDevices")}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-sm">
            {activeDevices.map((device) => {
              const draw = formatWatts(device.watts || 0, locale);
              return (
                <div
                  key={device.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenDevice?.(device.mac)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenDevice?.(device.mac);
                    }
                  }}
                  aria-label={t("overview.openDevice", { name: device.name })}
                  className={
                    "glass glass-hover rounded-2xl p-4 flex flex-col justify-between h-32 text-left cursor-pointer group focus-visible:outline-2 focus-visible:outline-secondary " +
                    (device.is_on ? "" : "opacity-70")
                  }
                >
                  <div className="flex justify-between items-start w-full">
                    <span className={"icon-orb w-9 h-9 " + (device.is_on ? "" : "text-outline shadow-none")}>
                      <Icon name={deviceIcon(device.name, device.type)} style={{ fontSize: "20px" }} />
                    </span>
                    <Switch
                      checked={device.is_on}
                      disabled={busy[device.mac]}
                      onChange={() => toggle(device)}
                      label={t(device.is_on ? "devices.turnOffNamed" : "devices.turnOnNamed", { name: device.name })}
                    />
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      {budgetOpen && (
        <BudgetModal
          token={token}
          homeId={homeId}
          current={budgetFcfa}
          projected={projectedFcfa}
          onClose={() => setBudgetOpen(false)}
          onSaved={() => {
            setBudgetOpen(false);
            load();
          }}
        />
      )}

      {allOffOpen && (
        <Modal title={t("allOff.title")} onClose={() => setAllOffOpen(false)}>
          <p className="text-on-surface-variant mb-3">{tn("allOff.confirm", onDevices.length)}</p>
          <ul className="flex flex-wrap gap-2 mb-5">
            {onDevices.map((d) => (
              <li key={d.mac} className="chip chip-teal">{d.name}</li>
            ))}
          </ul>
          <p className="text-[14px] text-outline mb-5">{t("allOff.hint")}</p>
          <div className="flex gap-3">
            <button type="button" className="btn-glass flex-1 py-3" onClick={() => setAllOffOpen(false)}>
              {t("common.cancel")}
            </button>
            <button type="button" className="btn-primary flex-1 py-3" onClick={switchAllOff} disabled={switchingAll}>
              <Icon name="power_settings_new" style={{ fontSize: "18px" }} />
              {switchingAll ? t("allOff.working") : t("allOff.button")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** The month in money: spent so far, the projection at the current pace,
 * and — once the household has set one — a bar against their budget. */
function BudgetCard({ estimated, projected, budget, onEdit }) {
  const { t, locale } = useLanguage();
  const money = (v) => Math.round(v).toLocaleString(locale);
  const ratio = budget ? Math.min(estimated / budget, 1) : 0;
  const projectedRatio = budget ? Math.min(projected / budget, 1) : 0;
  const over = budget ? projected - budget : 0;
  const tone = !budget ? null : over > 0 ? "over" : projected > budget * 0.9 ? "near" : "ok";

  return (
    <div className="glass-dark rounded-2xl p-md relative overflow-hidden">
      <div className="absolute -right-10 -top-10 w-40 h-40 bg-secondary-fixed/25 rounded-full blur-2xl" />
      <div className="relative z-10 grid gap-md md:grid-cols-[1fr_1.4fr] md:items-center">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Icon name="payments" className="text-secondary-fixed" />
            <span className="font-data-label text-data-label text-primary-fixed-dim uppercase">
              {t("budget.thisMonth")}
            </span>
          </div>
          <div className="font-display-metrics text-[40px] leading-[48px] text-inverse-on-surface">
            {money(estimated)} <span className="font-body-md text-body-md text-primary-fixed-dim">FCFA</span>
          </div>
          <p className="mt-1 text-[15px] text-primary-fixed-dim">
            {t("budget.projection", { amount: money(projected) })}
          </p>
        </div>

        <div>
          {budget ? (
            <>
              <div className="flex justify-between items-baseline mb-2 gap-3">
                <span className="font-label-sm text-label-sm text-inverse-on-surface">
                  {t("budget.of", { amount: money(budget) })}
                </span>
                <button type="button" onClick={onEdit} className="font-label-sm text-label-sm text-secondary-fixed hover:underline py-1">
                  {t("budget.edit")}
                </button>
              </div>
              <div
                className="h-3 rounded-full bg-white/15 overflow-hidden relative"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={budget}
                aria-valuenow={Math.round(estimated)}
                aria-label={t("budget.of", { amount: money(budget) })}
              >
                <div className="absolute inset-y-0 left-0 bg-white/25 rounded-full" style={{ width: `${projectedRatio * 100}%` }} />
                <div
                  className={
                    "absolute inset-y-0 left-0 rounded-full " +
                    (tone === "over" ? "bg-[#ff8a80]" : tone === "near" ? "bg-[#ffcc80]" : "bg-secondary-fixed")
                  }
                  style={{ width: `${ratio * 100}%` }}
                />
              </div>
              <p className={"mt-2 text-[14px] " + (tone === "over" ? "text-[#ffb4ab]" : tone === "near" ? "text-[#ffddb0]" : "text-primary-fixed-dim")}>
                {tone === "over"
                  ? t("budget.over", { amount: money(over) })
                  : t("budget.left", { amount: money(Math.max(budget - estimated, 0)) })}
              </p>
            </>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-[15px] text-primary-fixed-dim flex-1">{t("budget.none")}</p>
              <button type="button" onClick={onEdit} className="btn-glass py-2 bg-white/90">
                <Icon name="savings" style={{ fontSize: "18px" }} />
                {t("budget.set")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BudgetModal({ token, homeId, current, projected, onClose, onSaved }) {
  const { t, locale } = useLanguage();
  const [value, setValue] = useState(current ? String(current) : "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Round figures a household is likely to pick, around the projection.
  const base = Math.max(5000, Math.ceil((projected || 10000) / 5000) * 5000);
  const suggestions = [base, base + 5000, base + 10000];

  const save = async (amount) => {
    if (amount !== 0 && (!Number.isFinite(amount) || amount < 0)) {
      setError(t("budget.errAmount"));
      return;
    }
    setSaving(true);
    try {
      await axios.put(`${API}/homes/${homeId}/budget?amount=${amount}`, null, {
        headers: { Authorization: `Bearer ${token}` },
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || t("budget.errSave"));
      setSaving(false);
    }
  };

  return (
    <Modal title={t("budget.title")} onClose={onClose}>
      <p className="text-on-surface-variant mb-4">{t("budget.intro")}</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {suggestions.map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => setValue(String(amount))}
            aria-pressed={value === String(amount)}
            className={
              "px-3 py-2 rounded-full font-data-label text-[14px] " +
              (value === String(amount) ? "bg-white/90 text-secondary ring-1 ring-secondary/40" : "glass-subtle text-on-surface-variant")
            }
          >
            {amount.toLocaleString(locale)} FCFA
          </button>
        ))}
      </div>
      <label className="block mb-4">
        <span className="block mb-1.5 font-label-sm text-label-sm text-on-surface-variant">{t("budget.amount")}</span>
        <div className="relative">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="500"
            className="glass-input pr-16 font-data-label"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-outline font-label-sm">FCFA</span>
        </div>
      </label>
      {error && <p className="text-error text-[14px] mb-3">{error}</p>}
      <div className="flex gap-3">
        {current ? (
          <button type="button" className="btn-glass flex-1 py-3" onClick={() => save(0)} disabled={saving}>
            {t("budget.remove")}
          </button>
        ) : null}
        <button
          type="button"
          className="btn-primary flex-1 py-3"
          onClick={() => save(Math.round(Number(value)))}
          disabled={saving || !value}
        >
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </Modal>
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
    <div className="glass rounded-2xl p-md">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-headline-md text-headline-md text-on-surface">
          {t("overview.powerUsage")}
        </h3>
        <select
          value={range}
          onChange={(e) => onRangeChange(e.target.value)}
          className="glass-subtle rounded-full font-label-sm text-label-sm text-on-surface py-1 pl-3 pr-8 focus:ring-secondary focus:border-secondary"
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
