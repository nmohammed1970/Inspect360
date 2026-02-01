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
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { moderateScale, getFontSize } from '../../utils/responsive';
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
  const windowDimensions = useWindowDimensions();
  const screenWidth = windowDimensions?.width || Dimensions.get('window').width;
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  
  const themeColors = (theme && theme.colors) ? theme.colors : colors;
  const textPrimary = themeColors?.text?.primary || (theme?.theme === 'dark' ? '#fafafa' : '#0a0a0a');
  const textSecondary = themeColors?.text?.secondary || (theme?.theme === 'dark' ? '#a3a3a3' : '#737373');

  const slides: OnboardingSlide[] = [
    {
      id: 0,
      title: 'Streamlined Inspections',
      description: 'Capture detailed property inspections with photos, notes, and digital signatures. Complete inspections entirely using AI - from intelligent image analysis that identifies issues automatically to AI-generated inspection reports. Work faster and more accurately with our intuitive mobile interface.',
      icon: <Home size={moderateScale(80, 0.2, screenWidth)} color={themeColors.primary.DEFAULT} />,
      illustration: (
        <View style={styles.illustrationContainer}>
          {/* Gradient background effect */}
          <View style={[styles.gradientBackground, { backgroundColor: themeColors.primary.light || '#E0F7FA' }]} />
          
          {/* Main illustration card with enhanced styling */}
          <View style={[styles.illustrationCard, styles.illustrationCardElevated, { 
            backgroundColor: themeColors.primary.light || '#E0F7FA',
            borderColor: themeColors.primary.DEFAULT + '20',
          }]}>
            <View style={[styles.iconWrapper, { backgroundColor: themeColors.primary.DEFAULT + '15' }]}>
              <Home size={moderateScale(72, 0.2, screenWidth)} color={themeColors.primary.DEFAULT} strokeWidth={2} />
            </View>
          </View>
          
          {/* Floating decorative icons with modern styling */}
          <View style={[styles.illustrationIcon, styles.illustrationIconModern, styles.iconTopRight, { 
            backgroundColor: themeColors.card.DEFAULT, 
            borderColor: themeColors.primary.DEFAULT + '30',
            borderWidth: 2,
          }]}>
            <Sparkles size={moderateScale(22, 0.2, screenWidth)} color={themeColors.primary.DEFAULT} fill={themeColors.primary.DEFAULT} />
          </View>
          <View style={[styles.illustrationIcon, styles.illustrationIconModern, styles.iconBottomLeft, { 
            backgroundColor: themeColors.card.DEFAULT, 
            borderColor: themeColors.primary.DEFAULT + '30',
            borderWidth: 2,
          }]}>
            <ClipboardList size={moderateScale(20, 0.2, screenWidth)} color={themeColors.primary.DEFAULT} strokeWidth={2} />
          </View>
        </View>
      ),
    },
    {
      id: 1,
      title: 'Maintenance Management',
      description: 'Track and manage maintenance requests seamlessly. Create work orders, assign tasks, and monitor progress all from your mobile device.',
      icon: <Hammer size={moderateScale(80, 0.2, screenWidth)} color={themeColors.primary.DEFAULT} />,
      illustration: (
        <View style={styles.illustrationContainer}>
          {/* Gradient background effect */}
          <View style={[styles.gradientBackground, { backgroundColor: themeColors.primary.light || '#E0F7FA' }]} />
          
          {/* Main illustration card with enhanced styling */}
          <View style={[styles.illustrationCard, styles.illustrationCardElevated, { 
            backgroundColor: themeColors.primary.light || '#E0F7FA',
            borderColor: themeColors.primary.DEFAULT + '20',
          }]}>
            <View style={[styles.iconWrapper, { backgroundColor: themeColors.primary.DEFAULT + '15' }]}>
              <Hammer size={moderateScale(72, 0.2, screenWidth)} color={themeColors.primary.DEFAULT} strokeWidth={2} />
            </View>
          </View>
          
          {/* Floating decorative icons with modern styling */}
          <View style={[styles.illustrationIcon, styles.illustrationIconModern, styles.iconTopRight, { 
            backgroundColor: themeColors.card.DEFAULT, 
            borderColor: themeColors.primary.DEFAULT + '30',
            borderWidth: 2,
          }]}>
            <Sparkles size={moderateScale(22, 0.2, screenWidth)} color={themeColors.primary.DEFAULT} fill={themeColors.primary.DEFAULT} />
          </View>
          <View style={[styles.illustrationIcon, styles.illustrationIconModern, styles.iconBottomLeft, { 
            backgroundColor: themeColors.card.DEFAULT, 
            borderColor: themeColors.primary.DEFAULT + '30',
            borderWidth: 2,
          }]}>
            <Wrench size={moderateScale(20, 0.2, screenWidth)} color={themeColors.primary.DEFAULT} strokeWidth={2} />
          </View>
        </View>
      ),
    },
    {
      id: 2,
      title: 'Asset Inventory',
      description: 'Keep track of all property assets and inventory items. Organize, categorize, and manage your asset database with ease.',
      icon: <Boxes size={moderateScale(80, 0.2, screenWidth)} color={themeColors.primary.DEFAULT} />,
      illustration: (
        <View style={styles.illustrationContainer}>
          {/* Gradient background effect */}
          <View style={[styles.gradientBackground, { backgroundColor: themeColors.primary.light || '#E0F7FA' }]} />
          
          {/* Main illustration card with enhanced styling */}
          <View style={[styles.illustrationCard, styles.illustrationCardElevated, { 
            backgroundColor: themeColors.primary.light || '#E0F7FA',
            borderColor: themeColors.primary.DEFAULT + '20',
          }]}>
            <View style={[styles.iconWrapper, { backgroundColor: themeColors.primary.DEFAULT + '15' }]}>
              <Boxes size={moderateScale(72, 0.2, screenWidth)} color={themeColors.primary.DEFAULT} strokeWidth={2} />
            </View>
          </View>
          
          {/* Floating decorative icons with modern styling */}
          <View style={[styles.illustrationIcon, styles.illustrationIconModern, styles.iconTopRight, { 
            backgroundColor: themeColors.card.DEFAULT, 
            borderColor: themeColors.primary.DEFAULT + '30',
            borderWidth: 2,
          }]}>
            <Sparkles size={moderateScale(22, 0.2, screenWidth)} color={themeColors.primary.DEFAULT} fill={themeColors.primary.DEFAULT} />
          </View>
          <View style={[styles.illustrationIcon, styles.illustrationIconModern, styles.iconBottomLeft, { 
            backgroundColor: themeColors.card.DEFAULT, 
            borderColor: themeColors.primary.DEFAULT + '30',
            borderWidth: 2,
          }]}>
            <Package size={moderateScale(20, 0.2, screenWidth)} color={themeColors.primary.DEFAULT} strokeWidth={2} />
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
      // Last slide - complete onboarding for this user
      if (user?.id) {
        await setOnboardingCompleted(user.id);
        if (__DEV__) {
          console.log(`[OnboardingScreen] Marked onboarding as completed for user ${user.id}`);
        }
      } else {
        console.warn('[OnboardingScreen] No user ID available, cannot mark onboarding as completed');
      }
      // Navigate to Main screen - use reset to clear navigation stack
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    }
  };

  const handleSkip = async () => {
    // Mark onboarding as completed for this user
    if (user?.id) {
      await setOnboardingCompleted(user.id);
      if (__DEV__) {
        console.log(`[OnboardingScreen] Skipped onboarding for user ${user.id}`);
      }
    } else {
      console.warn('[OnboardingScreen] No user ID available, cannot mark onboarding as completed');
    }
    // Navigate to Main screen - use reset to clear navigation stack
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
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <StatusBar style={theme?.theme === 'dark' ? 'light' : 'dark'} />
      
      {/* Skip button - only show on first two slides */}
      {currentSlide < slides.length - 1 && (
        <TouchableOpacity
          style={styles.skipButton}
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
        {slides.map((slide, index) => (
          <View
            key={slide.id}
            style={[styles.slide, { width: screenWidth }]}
          >
            {/* Illustration */}
            <View style={styles.illustrationWrapper}>
              {slide.illustration}
            </View>

            {/* Content */}
            <View style={styles.content}>
              <Text style={[styles.title, { color: textPrimary }]}>
                {slide.title}
              </Text>
              <Text style={[styles.description, { color: textSecondary }]}>
                {slide.description}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Pagination dots */}
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
                  ? moderateScale(24, 0.2, screenWidth)
                  : moderateScale(8, 0.2, screenWidth),
              },
            ]}
          />
        ))}
      </View>

      {/* Navigation buttons */}
      <View style={styles.buttonContainer}>
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
              flex: currentSlide === 0 ? 1 : 1,
            },
          ]}
          onPress={handleNext}
        >
          <Text style={[styles.buttonText, styles.buttonTextPrimary, { color: themeColors.primary.foreground }]}>
            {currentSlide === slides.length - 1 ? 'Get Started' : 'Next'}
          </Text>
          {currentSlide < slides.length - 1 && (
            <ChevronRight
              size={moderateScale(20, 0.2, screenWidth)}
              color={themeColors.primary.foreground}
              style={{ marginLeft: moderateScale(4, 0.3, screenWidth) }}
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
    top: 50,
    right: 20,
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
  illustrationContainer: {
    width: '100%',
    flex: 1,
    maxHeight: 360,
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
    width: 240,
    height: 240,
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
    width: 160,
    height: 160,
    borderRadius: borderRadius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  illustrationIcon: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
  illustrationIconModern: {
    // Additional modern styling applied via inline styles
  },
  iconTopRight: {
    top: 20,
    right: 40,
  },
  iconBottomLeft: {
    bottom: 20,
    left: 40,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[8],
    alignItems: 'center',
    maxWidth: 400,
  },
  title: {
    fontSize: typography.fontSize['3xl'],
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
    paddingHorizontal: spacing[6],
    paddingBottom: spacing[8],
    gap: spacing[3],
  },
  button: {
    flex: 1,
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
  buttonTextPrimary: {
    // Color applied via style prop
  },
  buttonTextSecondary: {
    // Color applied via style prop
  },
});

