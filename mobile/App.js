import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import SuggestionsScreen from './src/screens/SuggestionsScreen';

export default function App() {
  const [token, setToken] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  if (!token) {
    return <LoginScreen onLogin={setToken} />;
  }

  return (
    <View style={styles.container}>
      {/* Content */}
      <View style={styles.content}>
        {activeTab === 'dashboard' && <DashboardScreen />}
        {activeTab === 'alerts' && <AlertsScreen />}
        {activeTab === 'suggestions' && <SuggestionsScreen />}
      </View>

      {/* Bottom tab bar */}
      <View style={styles.tabBar}>
        {[
          { id: 'dashboard', icon: '⚡', label: 'Dashboard' },
          { id: 'alerts',    icon: '🔔', label: 'Alerts' },
          { id: 'suggestions', icon: '💡', label: 'Suggestions' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={styles.tabItem}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={[
              styles.tabLabel,
              { color: activeTab === tab.id ? '#00b09b' : '#aaa' }
            ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f6' },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingBottom: 24,
    paddingTop: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  tabIcon: { fontSize: 22 },
  tabLabel: { fontSize: 11, fontWeight: '600' },
});