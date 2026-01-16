import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

interface LogoProps {
  size?: number;
  color?: string;
}

export default function Logo({ size = 60, color = '#00CED1' }: LogoProps) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {/* House outline */}
        <Path
          d="M50 20 L20 40 L20 80 L80 80 L80 40 Z"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Door */}
        <Path
          d="M40 80 L40 55 L50 55 L50 80"
          fill="none"
          stroke={color}
          strokeWidth="2"
        />
        {/* Windows */}
        <Circle cx="30" cy="50" r="5" fill={color} />
        <Circle cx="70" cy="50" r="5" fill={color} />
        {/* Magnifying glass overlay - positioned over house center */}
        <Circle
          cx="50"
          cy="50"
          r="18"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* Crosshair in magnifying glass */}
        <Path
          d="M50 47 L50 53 M47 50 L53 50"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Magnifying glass handle */}
        <Path
          d="M63 63 L72 72"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

