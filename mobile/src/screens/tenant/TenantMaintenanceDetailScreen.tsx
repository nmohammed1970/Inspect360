import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { tenantService, type TenantMaintenanceRequest } from '../../services/tenant';
import { useTheme } from '../../contexts/ThemeContext';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import { colors, spacing, borderRadius } from '../../theme';
import { getFontSize, moderateScale } from '../../utils/responsive';
import { getAPI_URL } from '../../services/api';
import type { TenantMaintenanceStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<TenantMaintenanceStackParamList, 'TenantMaintenanceDetail'>;

function resolveUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  if (path.startsWith('/')) return `${getAPI_URL()}${path}`;
  return `${getAPI_URL()}/objects/${path}`;
}

export default function TenantMaintenanceDetailScreen({ navigation, route }: Props) {
  const { requestId } = route.params;
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets();

  const query = useQuery({
    queryKey: ['/api/tenant/maintenance-requests'],
    queryFn: () => tenantService.getMaintenanceRequests(),
  });

  const request: TenantMaintenanceRequest | undefined = (query.data ?? []).find((r) => r.id === requestId);

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
        <Text style={{ color: themeColors.text?.primary, fontWeight: '600', marginBottom: spacing.sm }}>
          We couldn't load this request
        </Text>
        <Button title="Try again" onPress={() => void query.refetch()} />
      </View>
    );
  }

  if (!request) {
    return (
      <View style={[styles.centered, { padding: spacing.lg, paddingTop: insets.top, backgroundColor: themeColors.background }]}>
        <Text style={{ color: themeColors.text?.primary, fontWeight: '600', marginBottom: spacing.sm }}>
          Request not found
        </Text>
        <Button title="Go back" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  const photos = request.photoUrls ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + spacing.sm, borderBottomColor: themeColors.border?.DEFAULT ?? '#e5e5e5' },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
          <ArrowLeft size={moderateScale(22)} color={themeColors.text?.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text?.primary }]}>Request details</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        <Card>
          <Text style={[styles.title, { color: themeColors.text?.primary }]}>
            {request.title || 'Maintenance request'}
          </Text>
          <Text style={{ color: themeColors.text?.secondary, marginTop: 6, fontSize: getFontSize(13) }}>
            Status: {String(request.status || '—').replace(/_/g, ' ')}
            {request.priority ? ` · Priority: ${request.priority}` : ''}
          </Text>
          {request.assignedTo ? (
            <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(12), marginTop: 4 }}>
              Assigned to{' '}
              {typeof request.assignedTo === 'string'
                ? 'maintenance team'
                : [request.assignedTo.firstName, request.assignedTo.lastName].filter(Boolean).join(' ') ||
                  'maintenance team'}
            </Text>
          ) : null}
          {request.createdAt ? (
            <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(12), marginTop: 4 }}>
              Logged {new Date(request.createdAt).toLocaleString()}
            </Text>
          ) : null}
        </Card>

        {request.description ? (
          <Card>
            <Text style={[styles.label, { color: themeColors.text?.secondary }]}>Description</Text>
            <Text style={{ color: themeColors.text?.primary, fontSize: getFontSize(14), lineHeight: getFontSize(20) }}>
              {request.description}
            </Text>
          </Card>
        ) : null}

        {request.aiSuggestedFixes ? (
          <Card>
            <Text style={[styles.label, { color: themeColors.text?.secondary }]}>AI suggested fixes</Text>
            <Text style={{ color: themeColors.text?.primary, fontSize: getFontSize(14), lineHeight: getFontSize(20) }}>
              {request.aiSuggestedFixes}
            </Text>
          </Card>
        ) : null}

        {photos.length > 0 ? (
          <Card>
            <Text style={[styles.label, { color: themeColors.text?.secondary }]}>Photos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
              {photos.map((p, i) => (
                <Image key={`${p}-${i}`} source={{ uri: resolveUrl(p) }} style={styles.photo} />
              ))}
            </ScrollView>
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: getFontSize(17), fontWeight: '600', flex: 1, textAlign: 'center' },
  title: { fontSize: getFontSize(18), fontWeight: '700' },
  label: { fontSize: getFontSize(12), marginBottom: 4, fontWeight: '600' },
  photo: {
    width: moderateScale(120),
    height: moderateScale(120),
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    backgroundColor: '#e5e5e5',
  },
});
