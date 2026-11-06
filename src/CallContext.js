import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { ensureRecordingPermission } from './recordingPermissions';
import { useData } from './DataContext';
import Dialer, { isLive, isRinging, parseCallState } from './dialer';

const CallContext = createContext(null);
export const useCalls = () => useContext(CallContext);

export function CallProvider({ children }) {
  const [state, setState] = useState(() => (Dialer ? parseCallState(Dialer.getState()) : { calls: [], audio: null, recording: null }));
  const [ended, setEnded] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [isDefault, setIsDefault] = useState(() => (Dialer ? !!Dialer.isDefaultDialer() : false));
  const lastPrimary = useRef(null);
  const endTimer = useRef(null);

  useEffect(() => {
    if (!Dialer) return undefined;
    const sub = Dialer.addListener('onCallsChanged', (e) => {
      setState(parseCallState(e.json));
      // tapped the island while the app was already open: show the call screen
      try {
        if (Dialer.consumeShowCall && Dialer.consumeShowCall()) setMinimized(false);
      } catch {
        // ignore
      }
    });
    setState(parseCallState(Dialer.getState()));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!Dialer) return undefined;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        setIsDefault(!!Dialer.isDefaultDialer());
        setState(parseCallState(Dialer.getState()));
        // opened from the Dynamic Island / call notification: show the call screen
        try {
          if (Dialer.consumeShowCall && Dialer.consumeShowCall()) setMinimized(false);
        } catch {
          // ignore
        }
      }
    });
    return () => sub.remove();
  }, []);

  const live = useMemo(() => state.calls.filter((c) => !c.parentId && isLive(c)), [state.calls]);
  const ringingCount = live.filter(isRinging).length;

  // Brief "Call Ended" screen after the last call drops.
  useEffect(() => {
    if (live.length) {
      lastPrimary.current = live.find((c) => c.state === 'active') || live[0];
      if (endTimer.current) {
        clearTimeout(endTimer.current);
        endTimer.current = null;
      }
      setEnded(null);
    } else if (lastPrimary.current) {
      const disconnected = state.calls.find((c) => c.id === lastPrimary.current.id);
      setEnded({ ...lastPrimary.current, disconnectLabel: disconnected ? disconnected.disconnectLabel : null });
      lastPrimary.current = null;
      endTimer.current = setTimeout(() => {
        setEnded(null);
        setMinimized(false);
      }, 1400);
    }
  }, [live, state.calls]);

  // A new call (incoming or one you just dialled) brings the call screen back.
  const prevCount = useRef(0);
  useEffect(() => {
    if (live.length > prevCount.current) setMinimized(false);
    prevCount.current = live.length;
  }, [live.length]);

  useEffect(() => {
    if (ringingCount) setMinimized(false);
  }, [ringingCount]);

  // ---------- call recording ----------
  const { settings, refreshCallLog } = useData();

  // Refresh Recents as soon as a call ends. Android writes the call log entry a moment after the
  // call drops, so check a few times over the next few seconds.
  const hadCalls = useRef(false);
  useEffect(() => {
    if (live.length) {
      hadCalls.current = true;
      return undefined;
    }
    if (!hadCalls.current) return undefined;
    hadCalls.current = false;
    const timers = [400, 1200, 2500, 5000, 9000].map((ms) =>
      setTimeout(() => {
        try {
          refreshCallLog(false);
        } catch {
          // ignore
        }
      }, ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [live.length, refreshCallLog]);
  const recording = state.recording;
  const recordingRequest = useRef(false);
  const shownRecordingError = useRef(null);
  useEffect(() => {
    if (state.recordingError && state.recordingError !== shownRecordingError.current) {
      shownRecordingError.current = state.recordingError;
      Alert.alert('Couldn’t Record', state.recordingError);
    } else if (!state.recordingError) shownRecordingError.current = null;
  }, [state.recordingError]);

  const startRecording = useCallback(async (number, quiet = false) => {
    if (!Dialer || !Dialer.startRecording || recordingRequest.current) return false;
    recordingRequest.current = true;
    try {
      const granted = await ensureRecordingPermission({ request: !quiet, notify: !quiet });
      if (!granted) return false;
      // This acknowledges a queued request; the native phase/error reports the result.
      const ok = Dialer.startRecording(number || '');
      setState(parseCallState(Dialer.getState()));
      if (!ok) Alert.alert('Couldn’t Record', Dialer.recordingError() || 'Recording isn’t available on this phone.');
      return ok;
    } catch (error) {
      Alert.alert('Couldn’t Record', error?.message || 'Could not request microphone access.');
      return false;
    } finally {
      recordingRequest.current = false;
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (Dialer && Dialer.stopRecording) Dialer.stopRecording();
  }, []);

  // Auto-record: start once per call when it connects.
  const autoDone = useRef({});
  useEffect(() => {
    if (!settings.autoRecord || recording) return;
    const active = live.find((c) => c.state === 'active');
    if (active && !autoDone.current[active.id]) {
      autoDone.current[active.id] = true;
      startRecording(active.number, true);
    }
  }, [live, settings.autoRecord, recording, startRecording]);

  const requestDefault = useCallback(async () => {
    if (!Dialer) return false;
    let ok = false;
    try {
      ok = await Dialer.requestDefaultDialer();
    } catch {
      ok = false;
    }
    const now = !!Dialer.isDefaultDialer();
    setIsDefault(now);
    return ok || now;
  }, []);

  const showScreen = (live.length > 0 || !!ended) && !minimized;

  // the island around the camera hides while the call screen itself is open
  useEffect(() => {
    try {
      if (Dialer && Dialer.setCallScreenShown) Dialer.setCallScreenShown(!!showScreen);
    } catch {
      // ignore
    }
  }, [showScreen]);

  const value = {
    available: !!Dialer,
    calls: state.calls,
    live,
    audio: state.audio,
    recording,
    startRecording,
    stopRecording,
    ended,
    minimized,
    setMinimized,
    isDefault,
    requestDefault,
    showScreen,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}
