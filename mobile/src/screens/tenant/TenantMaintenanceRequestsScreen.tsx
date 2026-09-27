import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageSquare, Plus, Wrench } from 'lucide-react-native';
import { tenantService, type TenantMaintenanceRequest } from '../../services/tenant';
import { useTheme } from '../../contexts/ThemeContext';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { colors, spacing } from '../../theme';
import { getFontSize, getButtonHeight, moderateScale } from '../../utils/responsive';
import type { TenantMaintenanceStackParamList } from '../../navigation/types';

export default function TenantMaintenanceRequestsScreen() {
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<TenantMaintenanceStackParamList>>();

  const query = useQuery({
    queryKey: ['/api/tenant/maintenance-requests'],
    queryFn: () => tenantService.getMaintenanceRequests(),
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
      <View
        style={[
          styles.centered,
          { padding: spacing.lg, paddingTop: insets.top, backgroundColor: themeColors.background },
        ]}
      >
        <Text
          style={{
            color: themeColors.text?.primary,
            fontWeight: '600',
            marginBottom: spacing.sm,
            textAlign: 'center',
          }}
        >
          We couldn't load your requests
        </Text>
        <Button title="Try again" onPress={() => void query.refetch()} />
      </View>
    );
  }

  const requests = query.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background, paddingTop: insets.top }}>
      <View style={styles.pageHeader}>
        <Text style={[styles.pageTitle, { color: themeColors.text?.primary }]}>Maintenance</Text>
        <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(13) }}>
          Requests and AI help for your tenancy
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          title="Log a request"
          icon={<Plus size={16} color="#fff" />}
          onPress={() => navigation.navigate('TenantCreateRequest')}
          style={{ flex: 1, minHeight: getButtonHeight() }}
        />
        <Button
          title="AI Help"
          variant="outline"
          icon={<MessageSquare size={16} color={themeColors.primary?.DEFAULT} />}
          onPress={() => navigation.navigate('TenantAiMaintenanceHelp')}
          style={{ flex: 1, minHeight: getButtonHeight() }}
        />
      </View>

      <FlatList
        data={requests}
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
            title="No maintenance requests yet"
            message="Log a request or ask AI Maintenance Help for guidance."
            icon={<Wrench size={moderateScale(40)} color={themeColors.text?.secondary} />}
          />
        }
        renderItem={({ item }: { item: TenantMaintenanceRequest }) => (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('TenantMaintenanceDetail', { requestId: item.id })}
          >
            <Card>
              <Text style={[styles.itemTitle, { color: themeColors.text?.primary }]}>
                {item.title || 'Maintenance request'}
              </Text>
              {item.description ? (
                <Text
                  style={{ color: themeColors.text?.secondary, marginTop: 4, fontSize: getFontSize(13) }}
                  numberOfLines={3}
                >
                  {item.description}
                </Text>
              ) : null}
              <Text style={{ color: themeColors.text?.secondary, marginTop: spacing.sm, fontSize: getFontSize(12) }}>
                Status: {String(item.status || '—').replace(/_/g, ' ')}
                {item.priority ? ` · Priority: ${item.priority}` : ''}
                {item.photoUrls && item.photoUrls.length > 0 ? ` · ${item.photoUrls.length} photo(s)` : ''}
                {item.assignedTo ? ' · Assigned' : ''}
              </Text>
              {item.createdAt ? (
                <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(12), marginTop: 2 }}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              ) : null}
            </Card>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageHeader: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  pageTitle: { fontSize: getFontSize(24), fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  itemTitle: { fontSize: getFontSize(16), fontWeight: '600' },
});
