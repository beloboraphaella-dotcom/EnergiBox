import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, TouchableOpacity
} from 'react-native';
import axios from 'axios';

const API = 'http://192.168.1.121:8000';

export default function DashboardScreen() {
  const [dashboard, setDashboard] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = async () => {
    try {
      const res = await axios.get(`${API}/dashboard`);
      setDashboard(res.data);
    } catch (err) {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboard();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 2000);
    return () => clearInterval(interval);
  }, []);

  if (!dashboard) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.page}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Bill card */}
      <View style={styles.billCard}>
        <Text style={styles.billLabel}>Estimated Bill This Month</Text>
        <Text style={styles.billAmount}>
          {dashboard.bill.estimated_fcfa.toLocaleString()} FCFA
        </Text>
        <Text style={styles.billSub}>
          {dashboard.bill.kwh_consumed} kWh consumed
        </Text>
        {dashboard.unread_alerts > 0 && (
          <View style={styles.alertBadge}>
            <Text style={styles.alertBadgeText}>
              🔔 {dashboard.unread_alerts} unread alert(s)
            </Text>
          </View>
        )}
      </View>

      {/* Appliance cards */}
      <Text style={styles.sectionTitle}>Live Consumption</Text>
      {dashboard.appliances.map((a, i) => (
        <View key={i} style={styles.appCard}>
          <View style={styles.appLeft}>
            <View style={styles.appIconWrap}>
              <Text style={styles.appIcon}>🔌</Text>
            </View>
            <View>
              <Text style={styles.appName}>{a.name}</Text>
              <Text style={styles.appTime}>
                {new Date(a.timestamp).toLocaleTimeString()}
              </Text>
            </View>
          </View>
          <View style={styles.appRight}>
            <Text style={styles.appWatts}>{a.watts.toFixed(1)}W</Text>
            <View style={[
              styles.statusBadge,
              { backgroundColor: a.watts > 10 ? '#e6f9f5' : '#f5f5f5' }
            ]}>
              <Text style={[
                styles.statusText,
                { color: a.watts > 10 ? '#00b09b' : '#aaa' }
              ]}>
                {a.watts > 10 ? 'ON' : 'OFF'}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f4f7f6', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loading: { color: '#aaa', fontSize: 16 },
  billCard: {
    backgroundColor: '#00b09b',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#00b09b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  billLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 8 },
  billAmount: { color: '#fff', fontSize: 36, fontWeight: '700', marginBottom: 4 },
  billSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  alertBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    padding: 8,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  alertBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  appCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  appLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  appIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#e6f9f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  appIcon: { fontSize: 20 },
  appName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', marginBottom: 2 },
  appTime: { fontSize: 11, color: '#bbb' },
  appRight: { alignItems: 'flex-end', gap: 6 },
  appWatts: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '700' },
});