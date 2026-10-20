import * as Location from 'expo-location';

/** Read the device's current GPS for gallery upload / capture. */
export async function captureDeviceGps(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      return null;
    }
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return { latitude, longitude };
  } catch {
    return null;
  }
}
