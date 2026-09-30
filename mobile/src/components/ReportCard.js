import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import Skeleton from "./Skeleton";
import { Chip, Orb } from "./GlassUI";
import { colors, glass, spacing, type } from "../theme";
import { useLanguage } from "../context/LanguageContext";

/** The month in a few sentences and three actions — the web's
 * ReportCard.jsx. Written by the language model from figures EnergiBox
 * measured (backend/reports.py), or by a template; the chip says which. */
export default function ReportCard({ homeId, year, month }) {
  const { t, language } = useLanguage();
  const [report, setReport] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!homeId) return undefined;
    let cancelled = false;
    setReport(null);
    setError(false);
    api
      .get(`/reports/monthly?home_id=${homeId}&year=${year}&month=${month}`, {
        headers: { "Accept-Language": language },
      })
      .then((res) => !cancelled && setReport(res.data))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [homeId, year, month, language]);

  if (error) return null;
  if (!report) return <Skeleton height={180} />;
  const ai = report.source === "ai";

  return (
    <View style={[glass.card, styles.card]}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">{t("report.title")}</Text>
        <Chip tone={ai ? "indigo" : null} icon={ai ? "auto_awesome" : "description"}>
          {ai ? t("report.byAI") : t("report.auto")}
        </Chip>
      </View>
      <Text style={styles.summary}>{report.summary}</Text>
      {report.actions.length > 0 && (
        <>
          <Text style={styles.label}>{t("report.actions").toUpperCase()}</Text>
          {report.actions.map((action, i) => (
            <View key={i} style={styles.action}>
              <Orb size={28}>
                <Text style={styles.number}>{i + 1}</Text>
              </Orb>
              <Text style={styles.actionText}>{action}</Text>
            </View>
          ))}
        </>
      )}
      {ai && <Text style={styles.note}>{t("report.aiNote")}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, gap: spacing.xs },
  head: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { ...type.headlineMd, fontSize: 20, lineHeight: 28, color: colors.onSurface },
  summary: { ...type.bodyMd, lineHeight: 24, color: colors.onSurface },
  label: { ...type.labelSm, color: colors.outline, letterSpacing: 1, marginTop: spacing.xs },
  action: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  number: { ...type.labelSm, color: colors.secondary },
  actionText: { ...type.bodyMd, fontSize: 15, lineHeight: 22, color: colors.onSurfaceVariant, flex: 1, paddingTop: 2 },
  note: { ...type.bodyMd, fontSize: 13, lineHeight: 18, color: colors.outline, marginTop: spacing.xs },
});
