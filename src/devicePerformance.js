import * as Device from 'expo-device';
import { shouldUseLowEndProfile } from './performanceProfile';

export function detectLowEndDevice() {
  if (!Device.isDevice) return false;
  return shouldUseLowEndProfile({
    totalMemory: Device.totalMemory,
    deviceYearClass: Device.deviceYearClass,
    supportedCpuArchitectures: Device.supportedCpuArchitectures,
  });
}
