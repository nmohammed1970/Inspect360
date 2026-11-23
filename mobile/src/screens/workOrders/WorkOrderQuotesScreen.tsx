import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, FileText, Plus } from 'lucide-react-native';
import { quotesService, type MaintenanceQuote } from '../../services/quotes';
import {
  isQuoteEditable,
  MAINTENANCE_QUOTE_STATUS_LABELS,
} from '../../../../shared/maintenanceQuoteConstants';
import { useTheme } from '../../contexts/ThemeContext';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { getFontSize } from '../../utils/responsive';
import type { WorkOrdersStackParamList } from '../../navigation/types';

function formatMoneyMinor(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

function statusLabel(status: string): string {
  return MAINTENANCE_QUOTE_STATUS_LABELS[status] || status.replace(/_/g, ' ');
}

export default function WorkOrderQuotesScreen() {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const isDark = !!theme?.isDark;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<WorkOrdersStackParamList>>();
  const route = useRoute<RouteProp<WorkOrdersStackParamList, 'WorkOrderQuotes'>>();
  const { workOrderId } = route.params;
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const query = useQuery({
    queryKey: ['work-order-quotes', workOrderId],
    queryFn: () => quotesService.listQuotes(workOrderId),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const list = query.data ?? (await quotesService.listQuotes(workOrderId));
      const draft = list.find(
        (q) => q.status === 'draft' || q.status === 'owner_changes_requested',
      );
      if (draft) return draft;
      return quotesService.createQuote(workOrderId);
    },
    onSuccess: (quote) => {
      queryClient.invalidateQueries({ queryKey: ['work-order-quotes', workOrderId] });
      navigation.navigate('WorkOrderQuoteBuilder', {
        workOrderId,
        quoteId: quote.id,
      });
    },
    onError: (err: Error) => {
      Alert.alert('Could not create quotation', err.message || 'Please try again');
    },
    onSettled: () => setCreating(false),
  });

  const handleNew = useCallback(() => {
    setCreating(true);
    createMutation.mutate();
  }, [createMutation]);

  const openQuote = useCallback(
    (quote: MaintenanceQuote) => {
      navigation.navigate('WorkOrderQuoteBuilder', {
        workOrderId,
        quoteId: quote.id,
      });
    },
    [navigation, workOrderId],
  );

  const renderItem = useCallback(
    ({ item }: { item: MaintenanceQuote }) => {
      const editable = isQuoteEditable(item.status);
      return (
        <TouchableOpacity onPress={() => openQuote(item)} activeOpacity={0.7}>
          <Card style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.cardMain}>
                <Text
                  style={[styles.ref, { color: themeColors.text.primary }]}
                  numberOfLines={1}
                >
                  {item.quoteReference}
                </Text>
                <View style={styles.metaRow}>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: isDark
                          ? themeColors.primary.light
                          : editable
                            ? '#DBEAFE'
                            : '#F3F4F6',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        {
                          color: editable
                            ? themeColors.primary.DEFAULT
                            : themeColors.text.secondary,
                        },
                      ]}
                    >
                      {statusLabel(item.status)}
                    </Text>
                  </View>
                  {item.versionNumber > 1 ? (
                    <Text style={[styles.version, { color: themeColors.text.secondary }]}>
                      v{item.versionNumber}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.cardRight}>
                <Text style={[styles.total, { color: themeColors.text.primary }]}>
                  {formatMoneyMinor(item.totalMinor ?? 0, item.currency || 'GBP')}
                </Text>
                <ChevronRight size={18} color={themeColors.text.secondary} />
              </View>
            </View>
          </Card>
        </TouchableOpacity>
      );
    },
    [isDark, openQuote, themeColors],
  );

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing[2],
            backgroundColor: themeColors.card.DEFAULT,
            borderBottomColor: themeColors.border.DEFAULT,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ArrowLeft size={22} color={themeColors.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: themeColors.text.primary }]}>Quotations</Text>
          <Text style={[styles.subtitle, { color: themeColors.text.secondary }]}>
            Create and submit drafts for owner approval
          </Text>
        </View>
      </View>

      {query.isLoading ? (
        <View style={styles.centered}>
          <LoadingSpinner />
        </View>
      ) : query.isError ? (
        <View style={styles.centered}>
          <Text style={{ color: themeColors.text.primary, marginBottom: spacing[3] }}>
            Failed to load quotations
          </Text>
          <Button title="Retry" onPress={() => query.refetch()} />
        </View>
      ) : (
        <FlatList
          data={query.data ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + spacing[24] },
            !(query.data?.length) && styles.listEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching && !query.isLoading}
              onRefresh={() => query.refetch()}
              tintColor={themeColors.primary.DEFAULT}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<FileText size={40} color={themeColors.text.secondary} />}
              title="No quotations yet"
              message="Create a draft quotation for this work order."
            />
          }
        />
      )}

      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + spacing[3],
            backgroundColor: themeColors.card.DEFAULT,
            borderTopColor: themeColors.border.DEFAULT,
          },
        ]}
      >
        <Button
          title={creating || createMutation.isPending ? 'Opening…' : 'New quotation'}
          onPress={handleNew}
          disabled={creating || createMutation.isPending}
          icon={<Plus size={16} color="#fff" />}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
  },
  backBtn: { paddingTop: spacing[1], paddingRight: spacing[1] },
  headerText: { flex: 1 },
  title: {
    fontSize: getFontSize(20),
    fontWeight: '700',
  },
  subtitle: {
    fontSize: getFontSize(13),
    marginTop: 2,
  },
  list: {
    padding: spacing[4],
    gap: spacing[3],
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    marginBottom: spacing[3],
    ...shadows.sm,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  cardMain: { flex: 1, gap: spacing[2] },
  cardRight: {
    alignItems: 'flex-end',
    gap: spacing[1],
  },
  ref: {
    fontSize: getFontSize(16),
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  badge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  badgeText: {
    fontSize: getFontSize(12),
    fontWeight: '600',
  },
  version: {
    fontSize: getFontSize(12),
  },
  total: {
    fontSize: getFontSize(15),
    fontWeight: '700',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  footer: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
