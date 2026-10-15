import { requireOptionalNativeModule } from 'expo';

// Phone engine: default-dialer role, in-call control, SIMs and USSD.
// null in Expo Go / iOS — callers fall back to plain tel: intents.
const Dialer = requireOptionalNativeModule('Dialer');

export default Dialer;
