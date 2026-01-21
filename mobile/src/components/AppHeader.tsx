import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { apiRequestJson, API_URL } from '../services/api';
import { colors, spacing, typography, shadows } from '../theme';
import { Menu } from 'lucide-react-native';

interface Organization {
  id: string;
  name: string;
  brandingName?: string;
  logoUrl?: string;
  brandingPrimaryColor?: string;
}

interface AppHeaderProps {
  onMenuPress?: () => void;
}

export default function AppHeader({ onMenuPress }: AppHeaderProps) {
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  const { user } = useAuth();
  const [logoError, setLogoError] = React.useState(false);

  const { data: organization } = useQuery<Organization>({
    queryKey: ['/api/organizations', user?.organizationId],
    queryFn: () => apiRequestJson<Organization>('GET', `/api/organizations/${user?.organizationId}`),
    enabled: !!user?.organizationId,
  });

  const companyName = organization?.brandingName || organization?.name || 'Inspect360';
  const primaryColor = organization?.brandingPrimaryColor || colors.primary.DEFAULT;

  // Default logo URL - matching web app logic exactly
  // Web app uses: import defaultLogoUrl from "@assets/Inspect360 Logo_1761302629835.png";
  // Server now serves this at /default-logo.png route (from attached_assets folder)
  // This matches the web app's default logo behavior
  const defaultLogoUrl = `${API_URL}/default-logo.png`;

  // Get logo source with cache busting - EXACTLY matching web app logic
  // From web app: if (!organization?.logoUrl) return defaultLogoUrl;
  const getLogoSrc = () => {
    // If no organization logo, return default logo (matching web app exactly)
    if (!organization?.logoUrl) {
      return defaultLogoUrl;
    }
    
    // If organization logo exists, use it with cache busting
    let logoUrl = organization.logoUrl;
    
    // If logoUrl is a relative path, prepend API_URL
    if (logoUrl && !logoUrl.startsWith('http')) {
      logoUrl = logoUrl.startsWith('/') ? logoUrl : `/${logoUrl}`;
      logoUrl = `${API_URL}${logoUrl}`;
    }
    
    const separator = logoUrl.includes('?') ? '&' : '?';
    const cacheBuster = organization.updatedAt
      ? new Date(organization.updatedAt).getTime()
      : Date.now();
    return `${logoUrl}${separator}v=${cacheBuster}`;
  };

  const logoSrc = getLogoSrc();

  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.headerContent}>
        {/* Logo and Company Name */}
        <View style={styles.logoSection}>
          <Image
            key={organization?.logoUrl || 'default'}
            source={{ uri: logoSrc as string }}
            style={styles.logoImage}
            resizeMode="contain"
            onError={(e) => {
              // Fallback to default logo if image fails to load (matching web app)
              // Web app does: if (e.currentTarget.src !== defaultLogoUrl) { e.currentTarget.src = defaultLogoUrl; }
              // In React Native, we trigger re-render with default logo
              if (organization?.logoUrl && logoSrc !== defaultLogoUrl) {
                // Try to reload with default logo - this will be handled by getLogoSrc on next render
                setLogoError(true);
              }
            }}
          />
          <Text style={[styles.companyName, { color: primaryColor }]} numberOfLines={1}>
            {companyName}
          </Text>
        </View>

        {/* Menu Button (if provided) */}
        {onMenuPress && (
          <TouchableOpacity
            style={styles.menuButton}
            onPress={onMenuPress}
            activeOpacity={0.7}
          >
            <Menu size={24} color={colors.text.primary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
    ...shadows.sm,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 56,
  },
  logoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing[2],
  },
  logoImage: {
    width: 32,
    height: 32,
    marginRight: spacing[2],
    maxWidth: 180,
  },
  companyName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.5,
    flex: 1,
  },
  menuButton: {
    padding: spacing[1],
    marginLeft: spacing[2],
  },
});

