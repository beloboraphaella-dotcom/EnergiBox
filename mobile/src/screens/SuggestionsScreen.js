import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { api } from "../api";
import Icon from "../components/Icon";
import { colors, spacing, type, glass } from "../theme";
import { Chip, EmptyCard, Orb } from "../components/GlassUI";

const STATUS_TONE = { accepted: "teal", ignored: null, pending: "amber" };

export default function SuggestionsScreen({ homeId }) {
  const [suggestions, setSuggestions] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSuggestions = async () => {
    try {
      const res = await api.get(`/suggestions?home_id=${homeId}`);
      setSuggestions(res.data);
    } catch (err) {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSuggestions();
    setRefreshing(false);
  };

  const accept = async (id) => {
    await api.put(`/suggestions/${id}/accept`);
    fetchSuggestions();
  };

  const ignore = async (id) => {
    await api.put(`/suggestions/${id}/ignore`);
    fetchSuggestions();
  };

  useEffect(() => { fetchSuggestions(); }, []);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />}
    >
      <Text style={styles.title}>AI Suggestions</Text>
      {suggestions.length === 0 ? (
        <EmptyCard icon="lightbulb">No suggestions yet</EmptyCard>
      ) : (
        suggestions.map((s, i) => (
          <View key={i} style={[glass.card, styles.card, s.status === "ignored" && styles.cardMuted]}>
            <View style={styles.cardHeader}>
              <Orb icon="lightbulb" size={40} color={colors.onTertiaryFixedVariant} background="rgba(255, 221, 184, 0.75)" />
              <View style={styles.headerText}>
                <Text style={styles.appliance} numberOfLines={1}>{s.appliance}</Text>
                <Chip tone="teal" icon="savings" style={styles.savingChip}>
                  Save {s.estimated_saving_fcfa} FCFA/month
                </Chip>
              </View>
              <Chip tone={STATUS_TONE[s.status]}>{s.status}</Chip>
            </View>

            <Text style={styles.suggText}>{s.suggestion}</Text>

            {s.status === "pending" && (
              <View style={styles.buttons}>
                <TouchableOpacity style={[glass.ghostButton, styles.flex]} onPress={() => ignore(s.id)} activeOpacity={0.8}>
                  <Text style={glass.ghostButtonText}>Ignore</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[glass.primaryButton, styles.flex]} onPress={() => accept(s.id)} activeOpacity={0.85}>
                  <Icon name="check" size={18} color="#ffffff" />
                  <Text style={glass.primaryButtonText}>Accept</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "transparent" },
  pageContent: { padding: spacing.marginMobile, paddingBottom: spacing.xl, gap: spacing.sm },
  title: { ...type.headlineLg, color: colors.onSurface, marginBottom: spacing.xs },
  card: { padding: spacing.sm, gap: spacing.sm },
  cardMuted: { opacity: 0.7 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerText: { flex: 1, gap: 4, alignItems: "flex-start" },
  appliance: { ...type.bodyMd, fontFamily: type.labelSm.fontFamily, color: colors.onSurface },
  savingChip: { alignSelf: "flex-start" },
  suggText: { ...type.bodyMd, fontSize: 14, lineHeight: 21, color: colors.onSurfaceVariant },
  buttons: { flexDirection: "row", gap: spacing.xs },
  flex: { flex: 1 },
});
