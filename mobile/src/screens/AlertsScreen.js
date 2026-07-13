import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl
} from 'react-native';
import axios from 'axios';

const API = 'http://192.168.1.121:8000';

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = async () => {
    try {
      const res = await axios.get(`${API}/alerts`);
      setAlerts(res.data);
    } catch (err) {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAlerts();
    setRefreshing(false);
  };

  useEffect(() => { fetchAlerts(); }, []);

  const getAlertColor = (type) => {
    if (type === 'spike') return { bg: '#fff0f0', color: '#e74c3c' };
    if (type === 'extended_runtime') return { bg: '#fff8e6', color: '#f39c12' };
    return { bg: '#f0f8ff', color: '#3498db' };
  };

  return (
    <ScrollView
      style={styles.page}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.title}>Alerts</Text>
      {alerts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.emptyText}>No alerts — everything is normal</Text>
        </View>
      ) : (
        alerts.map((a, i) => {
          const colors = getAlertColor(a.type);
          return (
            <View key={i} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.appliance}>{a.appliance}</Text>
                <View style={[styles.typeBadge, { backgroundColor: colors.bg }]}>
                  <Text style={[styles.typeText, { color: colors.color }]}>
                    {a.type.replace('_', ' ')}
                  </Text>
                </View>
              </View>
              <Text style={styles.message}>{a.message}</Text>
              <Text style={styles.time}>{a.created_at}</Text>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f4f7f6', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', marginBottom: 16 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#aaa' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#e74c3c',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  appliance: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  typeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  message: { fontSize: 13, color: '#666', marginBottom: 8, lineHeight: 18 },
  time: { fontSize: 11, color: '#bbb' },
});