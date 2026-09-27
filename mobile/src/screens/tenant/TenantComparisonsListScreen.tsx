import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileCheck } from 'lucide-react-native';
import { tenantService, type TenantComparisonReport } from '../../services/tenant';
import { useTheme } from '../../contexts/ThemeContext';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { colors, spacing } from '../../theme';
import { getFontSize, moderateScale } from '../../utils/responsive';
import type { TenantComparisonsStackParamList } from '../../navigation/types';

function statusLabel(status?: string | null): string {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ');
}

export default function TenantComparisonsListScreen() {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<TenantComparisonsStackParamList>>();

  const query = useQuery({
    queryKey: ['/api/tenant/comparison-reports'],
    queryFn: () => tenantService.getComparisonReports(),
  });

  const onRefresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  if (query.isLoading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
        <LoadingSpinner />
      </View>
    );
  }

  if (query.isError) {
    return (
      <View style={[styles.centered, { padding: spacing.lg, paddingTop: insets.top, backgroundColor: themeColors.background }]}>
        <Text style={{ color: themeColors.text?.primary, fontWeight: '600', marginBottom: spacing.sm, textAlign: 'center' }}>
          We couldn't load your comparison reports
        </Text>
        <Button title="Try again" onPress={() => void query.refetch()} />
      </View>
    );
  }

  const reports = query.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background, paddingTop: insets.top }}>
      <View style={styles.pageHeader}>
        <Text style={[styles.pageTitle, { color: themeColors.text?.primary }]}>Comparison reports</Text>
        <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(13) }}>
          Check-in vs check-out comparisons for your tenancy
        </Text>
      </View>

      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          flexGrow: 1,
          gap: spacing.sm,
        }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState
            title="No comparison reports"
            message="When a check-out comparison is ready, it will appear here."
            icon={<FileCheck size={moderateScale(40)} color={themeColors.text?.secondary} />}
          />
        }
        renderItem={({ item }: { item: TenantComparisonReport }) => {
          const needsSign =
            (item.status === 'under_review' || item.status === 'awaiting_signatures') && !item.tenantSignature;
          const title = item.property?.name || item.propertyName || 'Comparison report';
          const total = item.totalEstimatedCost != null ? String(item.totalEstimatedCost) : null;
          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('TenantComparisonPreview', { reportId: item.id })}
            >
              <Card>
                <Text style={[styles.itemTitle, { color: themeColors.text?.primary }]}>{title}</Text>
                {item.property?.address ? (
                  <Text
                    style={{ color: themeColors.text?.secondary, marginTop: 2, fontSize: getFontSize(12) }}
                    numberOfLines={2}
                  >
                    {item.property.address}
                  </Text>
                ) : null}
                <Text style={{ color: themeColors.text?.secondary, marginTop: 4, fontSize: getFontSize(13) }}>
                  Status: {statusLabel(item.status)}
                  {total != null ? ` · Est. ${total}` : ''}
                </Text>
                {item.createdAt ? (
                  <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(12), marginTop: 2 }}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                ) : null}
                {needsSign ? (
                  <Text style={{ color: '#ea580c', fontWeight: '600', marginTop: spacing.sm, fontSize: getFontSize(13) }}>
                    Signature required
                  </Text>
                ) : item.tenantSignature ? (
                  <Text
                    style={{
                      color: themeColors.status?.online ?? '#22c55e',
                      fontWeight: '600',
                      marginTop: spacing.sm,
                      fontSize: getFontSize(13),
                    }}
                  >
                    Signed
                  </Text>
                ) : null}
              </Card>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageHeader: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  pageTitle: { fontSize: getFontSize(24), fontWeight: '700' },
  itemTitle: { fontSize: getFontSize(16), fontWeight: '600' },
});
