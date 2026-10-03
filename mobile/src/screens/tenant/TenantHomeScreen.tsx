import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, Calendar, FileText, Home, MapPin } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useTenantPortalFlags } from '../../hooks/useTenantPortalFlags';
import { useTenantEntitlement } from '../../hooks/useTenantEntitlement';
import {
  tenantService,
  type TenantCheckInInspection,
  type TenantComparisonReport,
} from '../../services/tenant';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import { colors, spacing, borderRadius } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import { getFontSize, moderateScale } from '../../utils/responsive';
import { getAPI_URL } from '../../services/api';
import { formatCurrency } from '../../lib/formatCurrency';
import type { TenantHomeStackParamList } from '../../navigation/types';

function formatDate(value?: string | null): string {
  if (!value) return 'Not specified';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Not specified';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatMoney(value?: string | null): string | null {
  return formatCurrency(value);
}

function resolveLogoUrl(logoUrl: string | null | undefined): string {
  if (logoUrl) {
    if (logoUrl.startsWith('http')) return logoUrl;
    return `${getAPI_URL()}${logoUrl.startsWith('/') ? logoUrl : `/${logoUrl}`}`;
  }
  return `${getAPI_URL()}/logo.png`;
}

function sanitizeNotes(notes?: string | null): string | null {
  if (!notes) return null;
  try {
    if (typeof notes === 'string' && notes.trim().startsWith('{')) {
      const parsed = JSON.parse(notes);
      const sensitive = ['_originalPassword', 'password', 'originalPassword', 'hashedPassword'];
      const filtered: Record<string, unknown> = {};
      Object.keys(parsed).forEach((key) => {
        if (!sensitive.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
          filtered[key] = parsed[key];
        }
      });
      const keys = Object.keys(filtered);
      if (keys.length === 0) return null;
      return keys.map((k) => `${k}: ${String(filtered[k])}`).join('\n');
    }
  } catch {
    // plain text
  }
  return notes;
}

export default function TenantHomeScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const insets = useSafeAreaInsets();
  const { isSmall, getFontSize, moderateScale } = useResponsive();
  const flags = useTenantPortalFlags();
  const { locked: entitlementLocked, code: entitlementCode } = useTenantEntitlement();
  const navigation = useNavigation<NativeStackNavigationProp<TenantHomeStackParamList>>();
  const gridItemWidth = isSmall ? '100%' : '45%';

  const showLockedAlert = () => {
    Alert.alert(
      entitlementCode === 'CREDITS_EXPIRED' ? 'Your credits have expired' : 'Your trial has ended',
      'Please contact your administration (property manager) to buy credits and unlock the app again.',
    );
  };

  const tenancyQuery = useQuery({
    queryKey: ['/api/tenant/tenancy'],
    queryFn: () => tenantService.getTenancy(),
  });

  const checkInsQuery = useQuery({
    queryKey: ['/api/tenant/check-ins'],
    queryFn: () => tenantService.getCheckIns(),
    refetchInterval: 60_000,
  });

  const comparisonsQuery = useQuery({
    queryKey: ['/api/tenant/comparison-reports'],
    queryFn: () => tenantService.getComparisonReports(),
    enabled: flags.comparisonEnabled,
  });

  const pendingReviews = useMemo(
    () =>
      (checkInsQuery.data ?? []).filter(
        (i: TenantCheckInInspection) => i.tenantApprovalStatus === 'pending',
      ),
    [checkInsQuery.data],
  );

  const reportsNeedingSignature = useMemo(
    () =>
      (comparisonsQuery.data ?? []).filter(
        (r: TenantComparisonReport) =>
          (r.status === 'under_review' || r.status === 'awaiting_signatures') && !r.tenantSignature,
      ),
    [comparisonsQuery.data],
  );

  const onRefresh = useCallback(() => {
    void tenancyQuery.refetch();
    void checkInsQuery.refetch();
    if (flags.comparisonEnabled) void comparisonsQuery.refetch();
    flags.refetch();
  }, [tenancyQuery, checkInsQuery, comparisonsQuery, flags]);

  const refreshing =
    tenancyQuery.isRefetching || checkInsQuery.isRefetching || comparisonsQuery.isRefetching;

  if (tenancyQuery.isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: themeColors.background, paddingTop: insets.top }]}>
        <LoadingSpinner />
      </View>
    );
  }

  if (tenancyQuery.isError) {
    return (
      <View style={[styles.centered, { backgroundColor: themeColors.background, paddingTop: insets.top, padding: spacing.lg }]}>
        <Text style={[styles.errorTitle, { color: themeColors.text?.primary }]}>We couldn't load your home</Text>
        <Text style={{ color: themeColors.text?.secondary, textAlign: 'center', marginBottom: spacing.md }}>
          Check your connection and try again.
        </Text>
        <Button title="Try again" onPress={() => void tenancyQuery.refetch()} />
      </View>
    );
  }

  if (!tenancyQuery.data) {
    return (
      <View style={[styles.centered, { backgroundColor: themeColors.background, paddingTop: insets.top, padding: spacing.lg }]}>
        <Text style={[styles.errorTitle, { color: themeColors.text?.primary }]}>No tenancy found</Text>
        <Text style={{ color: themeColors.text?.secondary, textAlign: 'center' }}>
          You don't have an active tenancy assigned. Please contact your property manager.
        </Text>
      </View>
    );
  }

  const { tenancy, property, block } = tenancyQuery.data;
  const notes = sanitizeNotes(tenancy.notes);
  const rent = formatMoney(tenancy.monthlyRent);
  const deposit = formatMoney(tenancy.depositAmount);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: themeColors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.md,
        paddingBottom: insets.bottom + spacing.xl,
        paddingHorizontal: spacing.md,
        gap: spacing.md,
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.brandRow}>
        <Image
          source={{ uri: resolveLogoUrl(flags.logoUrl) }}
          style={styles.brandLogo}
          resizeMode="contain"
          accessibilityLabel={`${flags.brandingName} logo`}
        />
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.welcome,
              {
                color: flags.brandingPrimaryColor || themeColors.text?.primary,
              },
            ]}
          >
            Welcome Home
          </Text>
          <Text style={{ color: themeColors.text?.secondary, fontSize: getFontSize(14) }}>
            {flags.brandingName}
            {user?.firstName ? ` · Hi, ${user.firstName}` : ''}
          </Text>
        </View>
      </View>

      {(pendingReviews.length > 0 || reportsNeedingSignature.length > 0) && (
        <View style={{ gap: spacing.sm }}>
          {pendingReviews.map((inspection) => {
            const typeLabel = inspection.type === 'check_out' ? 'check-out' : 'check-in';
            return (
              <TouchableOpacity
                key={inspection.id}
                activeOpacity={0.85}
                onPress={() => {
                  if (entitlementLocked) {
                    showLockedAlert();
                    return;
                  }
                  navigation.navigate('TenantInspectionPreview', { inspectionId: inspection.id });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Review ${typeLabel} inspection`}
              >
                <Card style={[styles.actionCard, { borderColor: '#f97316' }]}>
                  <View style={styles.actionRow}>
                    <FileText size={moderateScale(20)} color="#ea580c" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.actionTitle}>Action required</Text>
                      <Text style={styles.actionBody}>
                        A {typeLabel} inspection requires your review and signature.
                      </Text>
                      <Text style={styles.actionCta}>Review</Text>
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}

          {flags.comparisonEnabled &&
            reportsNeedingSignature.map((report) => (
              <TouchableOpacity
                key={report.id}
                activeOpacity={0.85}
                onPress={() => {
                  if (entitlementLocked) {
                    showLockedAlert();
                    return;
                  }
                  navigation.navigate('TenantComparisonPreview', { reportId: report.id });
                }}
                accessibilityRole="button"
                accessibilityLabel="Review comparison report"
              >
                <Card style={[styles.actionCard, { borderColor: '#f97316' }]}>
                  <View style={styles.actionRow}>
                    <FileText size={moderateScale(20)} color="#ea580c" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.actionTitle}>Action required</Text>
                      <Text style={styles.actionBody}>
                        A comparison report requires your review and signature.
                      </Text>
                      <Text style={styles.actionCta}>Review & sign</Text>
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
        </View>
      )}

      <Card>
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: themeColors.primary?.light ?? '#E0F7FA' }]}>
            <Home size={moderateScale(18)} color={themeColors.primary?.DEFAULT ?? colors.primary.DEFAULT} />
          </View>
          <Text style={[styles.cardTitle, { color: themeColors.text?.primary }]}>Your property</Text>
        </View>
        <Text style={[styles.label, { color: themeColors.text?.secondary }]}>Property name</Text>
        <Text style={[styles.value, { color: themeColors.text?.primary }]}>{property?.name || '—'}</Text>
        <Text style={[styles.label, { color: themeColors.text?.secondary, marginTop: spacing.sm }]}>
          <MapPin size={12} color={themeColors.text?.secondary} /> Address
        </Text>
        <Text style={[styles.value, { color: themeColors.text?.primary }]}>{property?.address || '—'}</Text>
        {property?.sqft != null && (
          <>
            <Text style={[styles.label, { color: themeColors.text?.secondary, marginTop: spacing.sm }]}>
              Square footage
            </Text>
            <Text style={[styles.value, { color: themeColors.text?.primary }]}>
              {Number(property.sqft).toLocaleString()} sq ft
            </Text>
          </>
        )}
      </Card>

      {block ? (
        <Card>
          <View style={styles.cardHeader}>
            <View style={[styles.iconWrap, { backgroundColor: themeColors.primary?.light ?? '#E0F7FA' }]}>
              <Building2 size={moderateScale(18)} color={themeColors.primary?.DEFAULT ?? colors.primary.DEFAULT} />
            </View>
            <Text style={[styles.cardTitle, { color: themeColors.text?.primary }]}>Building complex</Text>
          </View>
          <Text style={[styles.label, { color: themeColors.text?.secondary }]}>Block name</Text>
          <Text style={[styles.value, { color: themeColors.text?.primary }]}>{block.name || '—'}</Text>
          <Text style={[styles.label, { color: themeColors.text?.secondary, marginTop: spacing.sm }]}>Address</Text>
          <Text style={[styles.value, { color: themeColors.text?.primary }]}>{block.address || '—'}</Text>
        </Card>
      ) : null}

      <Card>
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: themeColors.primary?.light ?? '#E0F7FA' }]}>
            <Calendar size={moderateScale(18)} color={themeColors.primary?.DEFAULT ?? colors.primary.DEFAULT} />
          </View>
          <Text style={[styles.cardTitle, { color: themeColors.text?.primary }]}>Tenancy details</Text>
        </View>
        <View style={styles.grid}>
          <View style={[styles.gridItem, { width: gridItemWidth }]}>
            <Text style={[styles.label, { color: themeColors.text?.secondary }]}>Lease start</Text>
            <Text style={[styles.value, { color: themeColors.text?.primary }]}>
              {formatDate(tenancy.leaseStartDate)}
            </Text>
          </View>
          <View style={[styles.gridItem, { width: gridItemWidth }]}>
            <Text style={[styles.label, { color: themeColors.text?.secondary }]}>Lease end</Text>
            <Text style={[styles.value, { color: themeColors.text?.primary }]}>
              {formatDate(tenancy.leaseEndDate)}
            </Text>
          </View>
          {rent != null && (
            <View style={[styles.gridItem, { width: gridItemWidth }]}>
              <Text style={[styles.label, { color: themeColors.text?.secondary }]}>Monthly rent</Text>
              <Text style={[styles.value, { color: themeColors.text?.primary }]}>{rent}</Text>
            </View>
          )}
          {deposit != null && (
            <View style={[styles.gridItem, { width: gridItemWidth }]}>
              <Text style={[styles.label, { color: themeColors.text?.secondary }]}>Deposit</Text>
              <Text style={[styles.value, { color: themeColors.text?.primary }]}>{deposit}</Text>
            </View>
          )}
          <View style={[styles.gridItem, { width: gridItemWidth }]}>
            <Text style={[styles.label, { color: themeColors.text?.secondary }]}>Status</Text>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: tenancy.isActive
                    ? themeColors.primary?.DEFAULT ?? colors.primary.DEFAULT
                    : themeColors.muted?.DEFAULT ?? '#f5f5f5',
                },
              ]}
            >
              <Text
                style={{
                  color: tenancy.isActive
                    ? themeColors.primary?.foreground ?? '#fff'
                    : themeColors.text?.secondary,
                  fontSize: getFontSize(12),
                  fontWeight: '600',
                }}
              >
                {tenancy.isActive ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
        </View>
        {notes ? (
          <View style={{ marginTop: spacing.md }}>
            <Text style={[styles.label, { color: themeColors.text?.secondary }]}>Notes</Text>
            <Text style={[styles.value, { color: themeColors.text?.primary }]}>{notes}</Text>
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  brandLogo: { width: moderateScale(48), height: moderateScale(48), borderRadius: borderRadius.md },
  welcome: { fontSize: getFontSize(26), fontWeight: '700' },
  errorTitle: { fontSize: getFontSize(18), fontWeight: '600', marginBottom: spacing.sm, textAlign: 'center' },
  actionCard: { borderWidth: 1, backgroundColor: '#FFF8E7' },
  actionRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  actionTitle: { color: '#ea580c', fontWeight: '700', fontSize: getFontSize(15) },
  actionBody: { color: '#c2410c', fontSize: getFontSize(13), marginTop: 2, lineHeight: getFontSize(18) },
  actionCta: { color: '#ea580c', fontWeight: '600', marginTop: spacing.sm, fontSize: getFontSize(13) },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  iconWrap: { padding: spacing.sm, borderRadius: borderRadius.md },
  cardTitle: { fontSize: getFontSize(17), fontWeight: '600' },
  label: { fontSize: getFontSize(12), marginBottom: 2 },
  value: { fontSize: getFontSize(15), fontWeight: '500' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gridItem: { minWidth: 0 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginTop: 4,
  },
});
