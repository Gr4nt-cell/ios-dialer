const LOW_MEMORY_LIMIT = 4 * 1024 * 1024 * 1024;
const LOW_DEVICE_YEAR_LIMIT = 2020;

export function shouldUseLowEndProfile({
  totalMemory,
  deviceYearClass,
  supportedCpuArchitectures,
} = {}) {
  if (Number.isFinite(totalMemory) && totalMemory <= LOW_MEMORY_LIMIT) return true;
  if (Number.isFinite(deviceYearClass) && deviceYearClass <= LOW_DEVICE_YEAR_LIMIT) return true;

  const architectures = Array.isArray(supportedCpuArchitectures)
    ? supportedCpuArchitectures.map((architecture) => architecture.toLowerCase())
    : [];
  const has32BitArm = architectures.some((architecture) =>
    architecture.includes('armeabi-v7a') || architecture.includes('armv7')
  );
  const has64BitArm = architectures.some((architecture) =>
    architecture.includes('arm64-v8a') || architecture.includes('arm64')
  );
  return has32BitArm && !has64BitArm;
}

/** Keep the selected profile while bounding GPU work on modest hardware. */
export function glassBudget({ profile = 'performance', lowEnd = false } = {}) {
  const optimized = profile === 'optimized';
  return {
    compact: optimized || lowEnd,
    shadows: !optimized && !lowEnd,
  };
}
