import { useEffect, useState } from "react";
import axios from "axios";
import Icon from "./Icon";
import Skeleton from "./Skeleton";
import { API } from "../config";
import { useLanguage } from "../context/LanguageContext";

/** The month in a few sentences and three actions, written by the
 * language model from figures EnergiBox measured (backend/reports.py),
 * or by a template when no model is available. The badge says which. */
export default function ReportCard({ token, homeId, year, month }) {
  const { t, language } = useLanguage();
  const [report, setReport] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!homeId) return undefined;
    let cancelled = false;
    setReport(null);
    setError(false);
    axios
      .get(`${API}/reports/monthly?home_id=${homeId}&year=${year}&month=${month}`, {
        headers: { Authorization: `Bearer ${token}`, "Accept-Language": language },
      })
      .then((res) => !cancelled && setReport(res.data))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [homeId, year, month, language, token]);

  if (error) return null;
  if (!report) {
    return (
      <div role="status" aria-label={t("common.loading")}>
        <Skeleton className="h-44" />
      </div>
    );
  }
  const ai = report.source === "ai";
  return (
    <section className="glass rounded-2xl p-md" aria-labelledby="report-title">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 id="report-title" className="flex items-center gap-2 font-headline-md text-[20px] leading-7 font-semibold text-on-surface">
          <Icon name="summarize" className="text-secondary" />
          {t("report.title")}
        </h3>
        <span className={"chip " + (ai ? "chip-indigo" : "")}>
          <Icon name={ai ? "auto_awesome" : "description"} style={{ fontSize: "16px" }} />
          {ai ? t("report.byAI") : t("report.auto")}
        </span>
      </div>
      <p className="text-on-surface leading-7">{report.summary}</p>
      {report.actions.length > 0 && (
        <>
          <h4 className="font-label-sm text-label-sm uppercase tracking-wider text-outline mt-md mb-2">
            {t("report.actions")}
          </h4>
          <ol className="space-y-2">
            {report.actions.map((action, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="icon-orb w-7 h-7 text-[13px] font-semibold shrink-0">{i + 1}</span>
                <span className="text-on-surface-variant pt-0.5">{action}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {ai && <p className="text-[13px] text-outline mt-md">{t("report.aiNote")}</p>}
    </section>
  );
}
