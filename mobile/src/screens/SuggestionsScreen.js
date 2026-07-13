import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl
} from 'react-native';
import axios from 'axios';

const API = 'http://192.168.1.121:8000';

export default function SuggestionsScreen() {
  const [suggestions, setSuggestions] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSuggestions = async () => {
    try {
      const res = await axios.get(`${API}/suggestions`);
      setSuggestions(res.data);
    } catch (err) {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSuggestions();
    setRefreshing(false);
  };

  const accept = async (id) => {
    await axios.put(`${API}/suggestions/${id}/accept`);
    fetchSuggestions();
  };

  const ignore = async (id) => {
    await axios.put(`${API}/suggestions/${id}/ignore`);
    fetchSuggestions();
  };

  useEffect(() => { fetchSuggestions(); }, []);

  return (
    <ScrollView
      style={styles.page}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.title}>AI Suggestions</Text>
      {suggestions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>💡</Text>
          <Text style={styles.emptyText}>No suggestions yet</Text>
        </View>
      ) : (
        suggestions.map((s, i) => (
          <View key={i} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconWrap}>
                <Text style={styles.icon}>💡</Text>
              </View>
              <View style={styles.headerText}>
                <Text style={styles.appliance}>{s.appliance}</Text>
                <Text style={styles.saving}>
                  Save {s.estimated_saving_fcfa} FCFA/month
                </Text>
              </View>
              <View style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    s.status === 'accepted' ? '#e6f9f5' :
                    s.status === 'ignored' ? '#f5f5f5' : '#fff8e6'
                }
              ]}>
                <Text style={[
                  styles.statusText,
                  {
                    color:
                      s.status === 'accepted' ? '#00b09b' :
                      s.status === 'ignored' ? '#aaa' : '#f39c12'
                  }
                ]}>
                  {s.status}
                </Text>
              </View>
            </View>

            <Text style={styles.suggText}>{s.suggestion}</Text>

            {s.status === 'pending' && (
              <View style={styles.buttons}>
                <TouchableOpacity
                  style={styles.acceptBtn}
                  onPress={() => accept(s.id)}
                >
                  <Text style={styles.acceptText}>✅ Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.ignoreBtn}
                  onPress={() => ignore(s.id)}
                >
                  <Text style={styles.ignoreText}>Ignore</Text>
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
  page: { flex: 1, backgroundColor: '#f4f7f6', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', marginBottom: 16 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#aaa' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff8e6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: { fontSize: 20 },
  headerText: { flex: 1 },
  appliance: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 2 },
  saving: { fontSize: 13, color: '#00b09b', fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  suggText: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 14 },
  buttons: { flexDirection: 'row', gap: 10 },
  acceptBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#00b09b',
    alignItems: 'center',
  },
  acceptText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  ignoreBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
  },
  ignoreText: { color: '#888', fontWeight: '600', fontSize: 13 },
});