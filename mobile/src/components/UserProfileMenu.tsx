import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Image,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { User, LogOut, ChevronRight, X } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { colors, spacing, borderRadius, shadows } from '../theme';
import { getFontSize, moderateScale } from '../utils/responsive';
import { resolveMediaUrl } from '../utils/mediaUrl';

function getInitials(user: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  email?: string | null;
}): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  }
  if (user.firstName) return user.firstName.substring(0, 2).toUpperCase();
  if (user.username) return user.username.substring(0, 2).toUpperCase();
  if (user.email) return user.email.substring(0, 2).toUpperCase();
  return 'U';
}

function getDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  email?: string | null;
}): string {
  if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
  if (user.firstName) return user.firstName;
  if (user.username) return user.username;
  return user.email || 'Account';
}

/**
 * Web-style profile control: avatar top-right opens a refined account sheet.
 */
export default function UserProfileMenu() {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const initials = useMemo(() => (user ? getInitials(user) : 'U'), [user]);
  const displayName = useMemo(() => (user ? getDisplayName(user) : 'Account'), [user]);
  const photoUrl = useMemo(
    () => resolveMediaUrl(user?.profileImageUrl),
    [user?.profileImageUrl],
  );

  useEffect(() => {
    setImageFailed(false);
  }, [photoUrl]);

  if (!user) return null;

  const showImage = !!photoUrl && !imageFailed;

  const goProfile = () => {
    setOpen(false);
    navigation.navigate('Profile');
  };

  const handleLogout = async () => {
    setOpen(false);
    try {
      await logout();
    } catch {
      // AuthContext handles errors
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Open profile menu"
        activeOpacity={0.85}
        style={[
          styles.avatarRing,
          {
            borderColor: themeColors.primary.DEFAULT + '55',
            backgroundColor: themeColors.card.DEFAULT,
            ...Platform.select({
              ios: shadows.sm,
              android: { elevation: 3 },
            }),
          },
        ]}
      >
        {showImage ? (
          <Image
            source={{ uri: photoUrl! }}
            style={styles.avatarImage}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: themeColors.primary.DEFAULT }]}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={[styles.backdrop, { paddingTop: insets.top + moderateScale(56) }]}
          onPress={() => setOpen(false)}
        >
          <Pressable
            style={[
              styles.sheet,
              {
                backgroundColor: themeColors.card.DEFAULT,
                borderColor: themeColors.border.DEFAULT,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIdentity}>
                {showImage ? (
                  <Image
                    source={{ uri: photoUrl! }}
                    style={styles.sheetAvatar}
                    onError={() => setImageFailed(true)}
                  />
                ) : (
                  <View
                    style={[
                      styles.sheetAvatarFallback,
                      { backgroundColor: themeColors.primary.DEFAULT },
                    ]}
                  >
                    <Text style={styles.sheetInitials}>{initials}</Text>
                  </View>
                )}
                <View style={styles.sheetTextCol}>
                  <Text
                    style={[styles.sheetName, { color: themeColors.text.primary }]}
                    numberOfLines={1}
                  >
                    {displayName}
                  </Text>
                  <Text
                    style={[styles.sheetEmail, { color: themeColors.text.secondary }]}
                    numberOfLines={1}
                  >
                    {user.email}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                hitSlop={12}
                accessibilityLabel="Close"
              >
                <X size={moderateScale(20)} color={themeColors.text.secondary} />
              </TouchableOpacity>
            </View>

            <View style={[styles.divider, { backgroundColor: themeColors.border.DEFAULT }]} />

            <TouchableOpacity
              style={styles.menuRow}
              onPress={goProfile}
              accessibilityRole="button"
              accessibilityLabel="View profile"
            >
              <View
                style={[
                  styles.menuIconWrap,
                  { backgroundColor: themeColors.primary.light || themeColors.primary.DEFAULT + '22' },
                ]}
              >
                <User size={moderateScale(18)} color={themeColors.primary.DEFAULT} />
              </View>
              <View style={styles.menuTextCol}>
                <Text style={[styles.menuTitle, { color: themeColors.text.primary }]}>Profile</Text>
                <Text style={[styles.menuHint, { color: themeColors.text.secondary }]}>
                  Account, documents & preferences
                </Text>
              </View>
              <ChevronRight size={moderateScale(18)} color={themeColors.text.secondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={handleLogout}
              accessibilityRole="button"
              accessibilityLabel="Log out"
            >
              <View style={[styles.menuIconWrap, { backgroundColor: '#FEE2E2' }]}>
                <LogOut size={moderateScale(18)} color="#DC2626" />
              </View>
              <View style={styles.menuTextCol}>
                <Text style={[styles.menuTitle, { color: '#DC2626' }]}>Log out</Text>
                <Text style={[styles.menuHint, { color: themeColors.text.secondary }]}>
                  Sign out of this device
                </Text>
              </View>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const AVATAR = moderateScale(40);

const styles = StyleSheet.create({
  avatarRing: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#fff',
    fontSize: getFontSize(14),
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingHorizontal: spacing[4],
  },
  sheet: {
    width: Math.min(320, moderateScale(300)),
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    ...Platform.select({
      ios: shadows.lg,
      android: { elevation: 12 },
    }),
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[2],
    paddingHorizontal: spacing[1],
    paddingBottom: spacing[3],
  },
  sheetIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
    minWidth: 0,
  },
  sheetAvatar: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(24),
  },
  sheetAvatarFallback: {
    width: moderateScale(48),
    height: moderateScale(48),
    borderRadius: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetInitials: {
    color: '#fff',
    fontSize: getFontSize(16),
    fontWeight: '700',
  },
  sheetTextCol: {
    flex: 1,
    minWidth: 0,
  },
  sheetName: {
    fontSize: getFontSize(16),
    fontWeight: '700',
    marginBottom: 2,
  },
  sheetEmail: {
    fontSize: getFontSize(12),
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: spacing[2],
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[1],
    borderRadius: borderRadius.lg,
  },
  menuIconWrap: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextCol: {
    flex: 1,
    minWidth: 0,
  },
  menuTitle: {
    fontSize: getFontSize(15),
    fontWeight: '600',
  },
  menuHint: {
    fontSize: getFontSize(11),
    marginTop: 2,
  },
});
