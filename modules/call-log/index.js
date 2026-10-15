import { requireOptionalNativeModule } from 'expo';

// Native module that reads/deletes the Android system call history.
// Returns null in Expo Go or on iOS, so callers must handle that case.
const CallLog = requireOptionalNativeModule('CallLog');

export default CallLog;
