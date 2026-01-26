/**
 * Store Scraping Test Screen
 * Tests if we can extract aisle data from grocery store websites
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

interface AisleData {
  item: string;
  aisle: string | null;
  section: string | null;
  inStock: boolean;
  price?: string;
}

interface TestResult {
  store: string;
  zipCode: string;
  results: AisleData[];
  timestamp: string;
}

export default function StoreScrapingTestScreen() {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const testStore = async (store: 'walmart' | 'target' | 'kroger') => {
    setIsLoading(true);
    setError(null);
    setTestResult(null);

    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/test-store-scrape`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            store,
            zipCode: '90210',
            items: ['milk', 'bread', 'eggs'],
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to scrape store');
      }

      setTestResult(data);
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <LinearGradient
        colors={['#0f172a', '#1e3a5f', '#1a1a2e']}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Store Scraping Test</Text>
        <Text style={styles.headerSubtitle}>
          Testing if we can extract aisle data from stores
        </Text>
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Store buttons */}
        <Text style={styles.sectionTitle}>SELECT A STORE TO TEST</Text>

        <TouchableOpacity
          style={styles.storeButton}
          onPress={() => testStore('walmart')}
          disabled={isLoading}
        >
          <View style={[styles.storeIcon, { backgroundColor: '#0071ce20' }]}>
            <Ionicons name="cart" size={24} color="#0071ce" />
          </View>
          <View style={styles.storeInfo}>
            <Text style={styles.storeName}>Walmart</Text>
            <Text style={styles.storeDesc}>Test aisle data extraction</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#64748b" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.storeButton}
          onPress={() => testStore('target')}
          disabled={isLoading}
        >
          <View style={[styles.storeIcon, { backgroundColor: '#cc000020' }]}>
            <Ionicons name="cart" size={24} color="#cc0000" />
          </View>
          <View style={styles.storeInfo}>
            <Text style={styles.storeName}>Target</Text>
            <Text style={styles.storeDesc}>Test aisle data extraction</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#64748b" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.storeButton}
          onPress={() => testStore('kroger')}
          disabled={isLoading}
        >
          <View style={[styles.storeIcon, { backgroundColor: '#0a69a920' }]}>
            <Ionicons name="cart" size={24} color="#0a69a9" />
          </View>
          <View style={styles.storeInfo}>
            <Text style={styles.storeName}>Kroger</Text>
            <Text style={styles.storeDesc}>Test aisle data extraction</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#64748b" />
        </TouchableOpacity>

        {/* Loading */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Scraping store data...</Text>
            <Text style={styles.loadingSubtext}>
              This may take 10-30 seconds
            </Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={32} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Results */}
        {testResult && (
          <View style={styles.resultsContainer}>
            <Text style={styles.resultsTitle}>
              Results from {testResult.store.toUpperCase()}
            </Text>
            <Text style={styles.resultsTime}>
              {new Date(testResult.timestamp).toLocaleString()}
            </Text>

            {testResult.results.map((result, index) => (
              <View key={index} style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultItem}>{result.item}</Text>
                  {result.inStock ? (
                    <View style={styles.inStockBadge}>
                      <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                      <Text style={styles.inStockText}>In Stock</Text>
                    </View>
                  ) : (
                    <View style={styles.outOfStockBadge}>
                      <Ionicons name="close-circle" size={16} color="#ef4444" />
                      <Text style={styles.outOfStockText}>Unknown</Text>
                    </View>
                  )}
                </View>

                <View style={styles.resultDetails}>
                  {result.aisle && (
                    <View style={styles.resultRow}>
                      <Ionicons name="location" size={16} color="#3b82f6" />
                      <Text style={styles.resultLabel}>Aisle:</Text>
                      <Text style={styles.resultValue}>{result.aisle}</Text>
                    </View>
                  )}

                  {result.section && (
                    <View style={styles.resultRow}>
                      <Ionicons name="apps" size={16} color="#8b5cf6" />
                      <Text style={styles.resultLabel}>Section:</Text>
                      <Text style={styles.resultValue}>{result.section}</Text>
                    </View>
                  )}

                  {result.price && (
                    <View style={styles.resultRow}>
                      <Ionicons name="pricetag" size={16} color="#f59e0b" />
                      <Text style={styles.resultLabel}>Price:</Text>
                      <Text style={styles.resultValue}>{result.price}</Text>
                    </View>
                  )}

                  {!result.aisle && !result.section && !result.price && (
                    <Text style={styles.noDataText}>
                      ⚠️ No aisle data found (scraping may be blocked)
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 1,
    marginBottom: 12,
  },
  storeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  storeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  storeInfo: {
    flex: 1,
  },
  storeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  storeDesc: {
    fontSize: 13,
    color: '#94a3b8',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 40,
    marginTop: 20,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  errorContainer: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 12,
    marginTop: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
    marginTop: 12,
    textAlign: 'center',
  },
  resultsContainer: {
    marginTop: 24,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  resultsTime: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 16,
  },
  resultCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  resultItem: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  inStockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34,197,94,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  inStockText: {
    fontSize: 12,
    color: '#22c55e',
    fontWeight: '500',
  },
  outOfStockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239,68,68,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  outOfStockText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '500',
  },
  resultDetails: {
    gap: 8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultLabel: {
    fontSize: 13,
    color: '#94a3b8',
  },
  resultValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  noDataText: {
    fontSize: 13,
    color: '#f59e0b',
    fontStyle: 'italic',
  },
});
