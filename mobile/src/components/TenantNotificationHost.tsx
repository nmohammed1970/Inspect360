import React from 'react';
import { useTenantNotifications } from '../hooks/useTenantNotifications';
import { useAuth } from '../contexts/AuthContext';
import { useTenantPortalFlags } from '../hooks/useTenantPortalFlags';
import { useTenantEntitlement } from '../hooks/useTenantEntitlement';
import TenantNotificationPopup from './TenantNotificationPopup';
import { tenantTabNavigationRef } from '../navigation/tenantTabNavigation';
import type { AppNotification } from '../services/notifications';

function navigateForNotification(
  notification: AppNotification,
  comparisonEnabled: boolean,
  entitlementLocked: boolean,
) {
  const navigation = tenantTabNavigationRef.current;
  if (!navigation) return;

  if (entitlementLocked) {
    navigation.navigate('TenantHomeTab', { screen: 'TenantHome' });
    return;
  }

  if (notification.type === 'comparison_report_created' && notification.data?.reportId) {
    const reportId = String(notification.data.reportId);
    if (comparisonEnabled) {
      navigation.navigate('TenantComparisonsTab', {
        screen: 'TenantComparisonPreview',
        params: { reportId },
      });
    } else {
      navigation.navigate('TenantHomeTab', {
        screen: 'TenantComparisonPreview',
        params: { reportId },
      });
    }
    return;
  }

  if (
    notification.type === 'inspection_review_requested' &&
    notification.data?.inspectionId
  ) {
    navigation.navigate('TenantHomeTab', {
      screen: 'TenantInspectionPreview',
      params: { inspectionId: String(notification.data.inspectionId) },
    });
    return;
  }

  navigation.navigate('TenantHomeTab', { screen: 'TenantHome' });
}

/**
 * Live tenant notification popups (REST + WebSocket), same behavior as web NotificationSystem.
 */
export default function TenantNotificationHost() {
  const { user, isAuthenticated } = useAuth();
  const flags = useTenantPortalFlags();
  const { locked: entitlementLocked } = useTenantEntitlement();
  const {
    popupNotification,
    handleClosePopup,
    handleViewNotification,
  } = useTenantNotifications();

  if (!isAuthenticated || user?.role !== 'tenant' || !popupNotification) {
    return null;
  }

  return (
    <TenantNotificationPopup
      notification={popupNotification}
      onClose={handleClosePopup}
      onView={() => {
        const n = handleViewNotification(popupNotification);
        if (n) navigateForNotification(n, flags.comparisonEnabled, entitlementLocked);
      }}
    />
  );
}
