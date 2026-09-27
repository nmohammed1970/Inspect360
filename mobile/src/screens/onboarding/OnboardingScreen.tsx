import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import { setOnboardingCompleted } from '../../utils/onboarding';
import { useAuth } from '../../contexts/AuthContext';
import {
  ClipboardList,
  Wrench,
  Package,
  ChevronRight,
  Sparkles,
  Home,
  Hammer,
  Boxes,
} from 'lucide-react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type OnboardingScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Onboarding'
>;

interface OnboardingScreenProps {
  navigation: OnboardingScreenNavigationProp;
}

interface OnboardingSlide {
  id: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  illustration: React.ReactNode;
}

export default function OnboardingScreen({ navigation }: OnboardingScreenProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const windowDimensions = useWindowDimensions();
  const screenWidth = windowDimensions?.width || Dimensions.get('window').width;
  const { moderateScale, isSmall } = useResponsive();
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const themeColors = (theme && theme.colors) ? theme.colors : colors;
  const textPrimary = themeColors?.text?.primary || (theme?.theme === 'dark' ? '#fafafa' : '#0a0a0a');
  const textSecondary = themeColors?.text?.secondary || (theme?.theme === 'dark' ? '#a3a3a3' : '#737373');

  const cardSize = Math.min(moderateScale(240, 0.35), screenWidth * 0.62);
  const iconWrapSize = Math.min(moderateScale(160, 0.35), cardSize * 0.67);
  const floatIconSize = Math.min(moderateScale(64, 0.3), screenWidth * 0.16);
  const mainIconSize = Math.min(moderateScale(72, 0.25), iconWrapSize * 0.45);
  const decoIconSize = Math.min(moderateScale(22, 0.25), floatIconSize * 0.35);
  const illustrationMaxHeight = isSmall ? screenWidth * 0.72 : Math.min(360, screenWidth * 0.9);

  const slides: OnboardingSlide[] = [
    {
      id: 0,
      title: 'Streamlined Inspections',
      description: 'Capture detailed property inspections with photos, notes, and digital signatures. Complete inspections entirely using AI - from intelligent image analysis that identifies issues automatically to AI-generated inspection reports. Work faster and more accurately with our intuitive mobile interface.',
      icon: <Home size={moderateScale(80, 0.2)} color={themeColors.primary.DEFAULT} />,
      illustration: (
        <View style={[styles.illustrationContainer, { maxHeight: illustrationMaxHeight }]}>
          <View style={[styles.gradientBackground, { backgroundColor: themeColors.primary.light || '#E0F7FA' }]} />
          <View style={[styles.illustrationCard, styles.illustrationCardElevated, {
            width: cardSize,
            height: cardSize,
            backgroundColor: themeColors.primary.light || '#E0F7FA',
            borderColor: themeColors.primary.DEFAULT + '20',
          }]}>
            <View style={[styles.iconWrapper, {
              width: iconWrapSize,
              height: iconWrapSize,
              backgroundColor: themeColors.primary.DEFAULT + '15',
            }]}>
              <Home size={mainIconSize} color={themeColors.primary.DEFAULT} strokeWidth={2} />
            </View>
          </View>
          <View style={[styles.illustrationIcon, styles.illustrationIconModern, {
            width: floatIconSize,
            height: floatIconSize,
            backgroundColor: themeColors.card.DEFAULT,
            borderColor: themeColors.primary.DEFAULT + '30',
            borderWidth: 2,
            top: screenWidth * 0.05,
            right: screenWidth * 0.08,
          }]}>
            <Sparkles size={decoIconSize} color={themeColors.primary.DEFAULT} fill={themeColors.primary.DEFAULT} />
          </View>
          <View style={[styles.illustrationIcon, styles.illustrationIconModern, {
            width: floatIconSize,
            height: floatIconSize,
            backgroundColor: themeColors.card.DEFAULT,
            borderColor: themeColors.primary.DEFAULT + '30',
            borderWidth: 2,
            bottom: screenWidth * 0.05,
            left: screenWidth * 0.08,
          }]}>
            <ClipboardList size={Math.min(moderateScale(20, 0.25), floatIconSize * 0.32)} color={themeColors.primary.DEFAULT} strokeWidth={2} />
          </View>
        </View>
      ),
    },
    {
      id: 1,
      title: 'Maintenance Management',
      description: 'Track and manage maintenance requests seamlessly. Create work orders, assign tasks, and monitor progress all from your mobile device.',
      icon: <Hammer size={moderateScale(80, 0.2)} color={themeColors.primary.DEFAULT} />,
      illustration: (
        <View style={[styles.illustrationContainer, { maxHeight: illustrationMaxHeight }]}>
          <View style={[styles.gradientBackground, { backgroundColor: themeColors.primary.light || '#E0F7FA' }]} />
          <View style={[styles.illustrationCard, styles.illustrationCardElevated, {
            width: cardSize,
            height: cardSize,
            backgroundColor: themeColors.primary.light || '#E0F7FA',
            borderColor: themeColors.primary.DEFAULT + '20',
          }]}>
            <View style={[styles.iconWrapper, {
              width: iconWrapSize,
              height: iconWrapSize,
              backgroundColor: themeColors.primary.DEFAULT + '15',
            }]}>
              <Hammer size={mainIconSize} color={themeColors.primary.DEFAULT} strokeWidth={2} />
            </View>
          </View>
          <View style={[styles.illustrationIcon, styles.illustrationIconModern, {
            width: floatIconSize,
            height: floatIconSize,
            backgroundColor: themeColors.card.DEFAULT,
            borderColor: themeColors.primary.DEFAULT + '30',
            borderWidth: 2,
            top: screenWidth * 0.05,
            right: screenWidth * 0.08,
          }]}>
            <Sparkles size={decoIconSize} color={themeColors.primary.DEFAULT} fill={themeColors.primary.DEFAULT} />
          </View>
          <View style={[styles.illustrationIcon, styles.illustrationIconModern, {
            width: floatIconSize,
            height: floatIconSize,
            backgroundColor: themeColors.card.DEFAULT,
            borderColor: themeColors.primary.DEFAULT + '30',
            borderWidth: 2,
            bottom: screenWidth * 0.05,
            left: screenWidth * 0.08,
          }]}>
            <Wrench size={Math.min(moderateScale(20, 0.25), floatIconSize * 0.32)} color={themeColors.primary.DEFAULT} strokeWidth={2} />
          </View>
        </View>
      ),
    },
    {
      id: 2,
      title: 'Asset Inventory',
      description: 'Keep track of all property assets and inventory items. Organize, categorize, and manage your asset database with ease.',
      icon: <Boxes size={moderateScale(80, 0.2)} color={themeColors.primary.DEFAULT} />,
      illustration: (
        <View style={[styles.illustrationContainer, { maxHeight: illustrationMaxHeight }]}>
          <View style={[styles.gradientBackground, { backgroundColor: themeColors.primary.light || '#E0F7FA' }]} />
          <View style={[styles.illustrationCard, styles.illustrationCardElevated, {
            width: cardSize,
            height: cardSize,
            backgroundColor: themeColors.primary.light || '#E0F7FA',
            borderColor: themeColors.primary.DEFAULT + '20',
          }]}>
            <View style={[styles.iconWrapper, {
              width: iconWrapSize,
              height: iconWrapSize,
              backgroundColor: themeColors.primary.DEFAULT + '15',
            }]}>
              <Boxes size={mainIconSize} color={themeColors.primary.DEFAULT} strokeWidth={2} />
            </View>
          </View>
          <View style={[styles.illustrationIcon, styles.illustrationIconModern, {
            width: floatIconSize,
            height: floatIconSize,
            backgroundColor: themeColors.card.DEFAULT,
            borderColor: themeColors.primary.DEFAULT + '30',
            borderWidth: 2,
            top: screenWidth * 0.05,
            right: screenWidth * 0.08,
          }]}>
            <Sparkles size={decoIconSize} color={themeColors.primary.DEFAULT} fill={themeColors.primary.DEFAULT} />
          </View>
          <View style={[styles.illustrationIcon, styles.illustrationIconModern, {
            width: floatIconSize,
            height: floatIconSize,
            backgroundColor: themeColors.card.DEFAULT,
            borderColor: themeColors.primary.DEFAULT + '30',
            borderWidth: 2,
            bottom: screenWidth * 0.05,
            left: screenWidth * 0.08,
          }]}>
            <Package size={Math.min(moderateScale(20, 0.25), floatIconSize * 0.32)} color={themeColors.primary.DEFAULT} strokeWidth={2} />
          </View>
        </View>
      ),
    },
  ];

  const handleNext = async () => {
    if (currentSlide < slides.length - 1) {
      const nextSlide = currentSlide + 1;
      setCurrentSlide(nextSlide);
      scrollViewRef.current?.scrollTo({
        x: nextSlide * screenWidth,
        animated: true,
      });
    } else {
      if (user?.id) {
        await setOnboardingCompleted(user.id);
        if (__DEV__) {
          console.log(`[OnboardingScreen] Marked onboarding as completed for user ${user.id}`);
        }
      } else {
        console.warn('[OnboardingScreen] No user ID available, cannot mark onboarding as completed');
      }
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    }
  };

  const handleSkip = async () => {
    if (user?.id) {
      await setOnboardingCompleted(user.id);
      if (__DEV__) {
        console.log(`[OnboardingScreen] Skipped onboarding for user ${user.id}`);
      }
    } else {
      console.warn('[OnboardingScreen] No user ID available, cannot mark onboarding as completed');
    }
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main' }],
    });
  };

  const handleBack = () => {
    if (currentSlide > 0) {
      const prevSlide = currentSlide - 1;
      setCurrentSlide(prevSlide);
      scrollViewRef.current?.scrollTo({
        x: prevSlide * screenWidth,
        animated: true,
      });
    }
  };

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const slideIndex = Math.round(offsetX / screenWidth);
    setCurrentSlide(slideIndex);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      edges={['bottom', 'left', 'right']}
    >
      {currentSlide < slides.length - 1 && (
        <TouchableOpacity
          style={[
            styles.skipButton,
            {
              top: insets.top + spacing[2],
              right: Math.max(insets.right, spacing[4]),
            },
          ]}
          onPress={handleSkip}
        >
          <Text style={[styles.skipButtonText, { color: textSecondary }]}>Skip</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
      >
        {slides.map((slide) => (
          <View
            key={slide.id}
            style={[styles.slide, { width: screenWidth }]}
          >
            <View style={[styles.illustrationWrapper, isSmall && styles.illustrationWrapperCompact]}>
              {slide.illustration}
            </View>

            <View style={[styles.content, { maxWidth: Math.min(400, screenWidth - spacing[8]) }]}>
              <Text style={[styles.title, { color: textPrimary, fontSize: isSmall ? typography.fontSize['2xl'] : typography.fontSize['3xl'] }]}>
                {slide.title}
              </Text>
              <Text style={[styles.description, { color: textSecondary }]}>
                {slide.description}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.pagination}>
        {slides.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              {
                backgroundColor: index === currentSlide
                  ? themeColors.primary.DEFAULT
                  : themeColors.border.DEFAULT,
                width: index === currentSlide
                  ? moderateScale(24, 0.2)
                  : moderateScale(8, 0.2),
              },
            ]}
          />
        ))}
      </View>

      <View style={[styles.buttonContainer, { paddingBottom: spacing[6] }]}>
        {currentSlide > 0 && (
          <TouchableOpacity
            style={[
              styles.button,
              styles.buttonSecondary,
              {
                backgroundColor: themeColors.secondary.DEFAULT || themeColors.muted.DEFAULT,
                borderColor: themeColors.border.DEFAULT,
              },
            ]}
            onPress={handleBack}
          >
            <Text style={[styles.buttonText, styles.buttonTextSecondary, { color: textPrimary }]}>
              Back
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.button,
            styles.buttonPrimary,
            {
              backgroundColor: themeColors.primary.DEFAULT,
              flex: 1,
            },
          ]}
          onPress={handleNext}
        >
          <Text style={[styles.buttonText, styles.buttonTextPrimary, { color: themeColors.primary.foreground }]}>
            {currentSlide === slides.length - 1 ? 'Get Started' : 'Next'}
          </Text>
          {currentSlide < slides.length - 1 && (
            <ChevronRight
              size={moderateScale(20, 0.2)}
              color={themeColors.primary.foreground}
              style={{ marginLeft: moderateScale(4, 0.3) }}
            />
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skipButton: {
    position: 'absolute',
    zIndex: 10,
    padding: spacing[3],
  },
  skipButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  illustrationWrapper: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing[12],
  },
  illustrationWrapperCompact: {
    paddingTop: spacing[8],
  },
  illustrationContainer: {
    width: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingHorizontal: spacing[4],
  },
  gradientBackground: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: borderRadius['3xl'],
    opacity: 0.6,
  },
  illustrationCard: {
    borderRadius: borderRadius['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  illustrationCardElevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  iconWrapper: {
    borderRadius: borderRadius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  illustrationIcon: {
    position: 'absolute',
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
  illustrationIconModern: {},
  content: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[8],
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing[4],
    lineHeight: typography.lineHeight.tight * typography.fontSize['3xl'],
    letterSpacing: -0.8,
  },
  description: {
    fontSize: typography.fontSize.base,
    textAlign: 'center',
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.base,
    paddingHorizontal: spacing[2],
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing[4],
    gap: spacing[2],
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: spacing[1],
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing[6],
    gap: spacing[3],
  },
  button: {
    flex: 1,
    minWidth: 120,
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[6],
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: 50,
  },
  buttonPrimary: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonSecondary: {
    borderWidth: 1,
  },
  buttonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  buttonTextPrimary: {},
  buttonTextSecondary: {},
});
