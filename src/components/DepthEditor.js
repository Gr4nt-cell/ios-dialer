import React, { useRef, useState } from 'react';
import { Alert, Modal, PanResponder, Pressable, ScrollView, Switch, Text, View, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DepthPoster from './DepthPoster';
import { DEPTH_DEFAULTS, DEPTH_RANGES, depthOptions } from '../depthSettings';
import { useTheme } from '../theme';
import { gradientFor } from '../gradients';
import { contactName, contactPhoto } from '../phone';

function Slider({ label, value, range, onChange, disabled }) {
  const t = useTheme();
  const track = useRef(null);
  const position = useRef({ x: 0, width: 1 });
  const latest = useRef(null);
  latest.current = { value, range, onChange, disabled };
  const move = (x) => {
    const p = latest.current;
    if (p.disabled) return;
    const fraction = Math.max(0, Math.min(1, (x - position.current.x) / position.current.width));
    p.onChange(Math.round(p.range[0] + fraction * (p.range[1] - p.range[0])));
  };
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !latest.current.disabled,
    onMoveShouldSetPanResponder: () => !latest.current.disabled,
    onPanResponderGrant: (e) => {
      const x = e.nativeEvent.pageX;
      track.current?.measureInWindow((left, top, width) => { position.current = { x: left, width: Math.max(1, width) }; move(x); });
    },
    onPanResponderMove: (e) => move(e.nativeEvent.pageX),
    onPanResponderTerminationRequest: () => false,
  })).current;
  const fraction = (value - range[0]) / (range[1] - range[0]);
  return <View style={{ marginBottom: 14, opacity: disabled ? 0.4 : 1 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: t.text, fontSize: 15 }}>{label}</Text><Text style={{ color: t.blue, fontVariant: ['tabular-nums'] }}>{value}{label === 'Name size' ? ' pt' : '%'}</Text></View>
    <View ref={track} {...responder.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityState={{ disabled }} accessibilityValue={{ min: range[0], max: range[1], now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => { if (!disabled) onChange(Math.max(range[0], Math.min(range[1], value + (e.nativeEvent.actionName === 'increment' ? 1 : -1)))); }}
      style={{ height: 36, justifyContent: 'center' }}>
      <View style={{ height: 4, backgroundColor: t.separator, borderRadius: 2 }}><View style={{ width: `${fraction * 100}%`, height: 4, backgroundColor: t.blue, borderRadius: 2 }} /></View>
      <View style={{ position: 'absolute', left: `${fraction * 100}%`, marginLeft: -10, height: 20, width: 20, borderRadius: 10, backgroundColor: t.blue }} />
    </View>
  </View>;
}

export default function DepthEditor({ visible, onClose, settings, updateSettings, contacts }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const sample = contacts.find((c) => contactPhoto(c, true));
  const [picked, setPicked] = useState(null);
  const image = picked || (sample ? contactPhoto(sample, true) : null);
  const name = picked ? 'Ella Mensah' : sample ? contactName(sample) : 'Ella Mensah';
  const o = depthOptions(settings);
  const colors = settings.callBackground === 'auto' || !settings.callBackground ? ['#C3DCFF', '#FFC1DF', '#B0F4DF'] : gradientFor('', settings.callBackground);
  const choose = async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (!r.canceled && r.assets?.[0]?.uri) setPicked(r.assets[0].uri);
    } catch { Alert.alert('Photo unavailable', 'Please choose a different portrait photo.'); }
  };
  const previewHeight = Math.min(330, height * 0.41);
  const previewWidth = Math.min(width - 48, previewHeight * 0.54);
  const enabled = settings.callDepth !== false;
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: t.grouped }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
        <Text style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>Call screen depth</Text>
        <Pressable onPress={onClose} accessibilityRole="button" hitSlop={12}><Text style={{ color: t.blue, fontSize: 17, fontWeight: '600' }}>Done</Text></Pressable>
      </View>
      <View style={{ alignItems: 'center', paddingBottom: 12 }}>
        <View style={{ height: previewHeight, width: previewWidth, borderRadius: 26, overflow: 'hidden', backgroundColor: '#C3DCFF' }}>
          <DepthPoster settings={settings} image={image} name={name} status="calling mobile…" colors={colors} showFeedback />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 16, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
            {['volume-high', 'pause', 'call'].map((n) => <View key={n} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: n === 'call' ? '#FF453A' : '#FFFFFF70', alignItems: 'center', justifyContent: 'center' }}><Ionicons name={n} size={13} color={n === 'call' ? '#FFF' : '#20363B'} /></View>)}
          </View>
        </View>
        <Pressable onPress={choose} accessibilityRole="button" style={{ paddingTop: 10, paddingHorizontal: 20 }}><Text style={{ color: t.blue, fontSize: 15 }}>Choose preview photo</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 28 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ color: t.text, fontSize: 16 }}>Depth effect</Text><Switch value={enabled} onValueChange={(v) => updateSettings(v ? { callDepth: true, callPhoto: true } : { callDepth: false })} />
        </View>
        <Text style={{ color: t.secondary, fontSize: 12, lineHeight: 17, marginBottom: 16 }}>Preview stays visible while you adjust. Changes save automatically and apply to all callers. Preview photos do not change contact photos.</Text>
        {[['Portrait size', 'depthSize'], ['Portrait height', 'depthY'], ['Horizontal position', 'depthX'], ['Bottom fade', 'depthFade'], ['Name size', 'depthNameSize'], ['Name position', 'depthNameY']].map(([label, key]) =>
          <Slider key={key} label={label} value={o[key]} range={DEPTH_RANGES[key]} disabled={!enabled} onChange={(v) => updateSettings({ [key]: v })} />)}
        <Pressable onPress={() => updateSettings({ ...DEPTH_DEFAULTS, callDepth: true, callPhoto: true, callBackground: 'pastel' })} accessibilityRole="button" style={{ paddingVertical: 14, alignItems: 'center', borderRadius: 16, backgroundColor: t.card }}><Text style={{ color: t.blue, fontWeight: '600' }}>Restore reference look</Text></Pressable>
        <Text style={{ color: t.secondary, fontSize: 12, lineHeight: 17, marginTop: 12 }}>A clear portrait with visible hair and shoulders gives the best overlap. Cutouts use Android’s subject model; its first use may need a model download. The original photo appears if a cutout is unavailable.</Text>
      </ScrollView>
    </View>
  </Modal>;
}
