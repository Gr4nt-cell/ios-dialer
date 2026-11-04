import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useDepth } from '../depth';
import { depthOptions } from '../depthSettings';

function useDepthPortrait(image, enabled, fade) {
  const result = useDepth(image, enabled, fade);
  return { ...result, state: result.status === 'wait' ? 'loading' : result.status === 'ready' ? 'ready' : result.status === 'off' ? 'idle' : 'unavailable', width: result.box?.imageWidth, height: result.box?.imageHeight };
}

export default function DepthPoster({ settings, image, name, status, colors, showFeedback = false, background = true, textColor, statusColor }) {
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const o = depthOptions(settings);
  const enabled = settings.callDepth !== false && settings.callPhoto !== false;
  const portrait = useDepthPortrait(image, enabled, o.depthFade);
  const { width: w, height: h } = bounds;
  const unit = Math.min(w / 390, h / 760);
  // Lift dark presets to preserve contrast with the poster's dark name and controls.
  const softColors = colors.map((hex) => {
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const dark = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 < 170;
    return dark ? '#' + rgb.map((v) => Math.round(v * 0.28 + 255 * 0.72).toString(16).padStart(2, '0')).join('') : hex;
  });
  const frameWidth = Math.min(w, h * 390 / 760);
  const pw = frameWidth * o.depthSize / 100;
  const ph = pw * (portrait.height || 4) / (portrait.width || 3);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e) => setBounds(e.nativeEvent.layout)}>
      {background && <>
      <LinearGradient colors={[softColors[0], softColors[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.35 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['#B6D8FF', '#B6D8FF00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ ...StyleSheet.absoluteFillObject, width: '60%' }} />
      <LinearGradient colors={[`${softColors[2]}00`, softColors[2]]} style={{ position: 'absolute', bottom: 0, width: '100%', height: '38%' }} />
      </>}
      {!enabled && image && settings.callPhoto !== false && <>
        <Image source={{ uri: image }} resizeMode="cover" resizeMethod="none" fadeDuration={0} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['#00000077', '#00000000', '#00000099']} style={StyleSheet.absoluteFill} />
      </>}
      {w > 0 && <>
        <View style={{ position: 'absolute', top: h * o.depthNameY / 100, left: 12, right: 12, alignItems: 'center' }}>
          <Text style={{ color: statusColor || (!enabled && image ? '#FFFFFFCC' : '#54666A'), fontWeight: '500', fontSize: 17 * unit, marginBottom: 6 * unit }} numberOfLines={1}>{status}</Text>
          <Text style={{ color: textColor || (!enabled && image ? '#FFFFFF' : '#20363B'), fontWeight: '800', fontSize: o.depthNameSize * unit, lineHeight: o.depthNameSize * 1.12 * unit, textAlign: 'center', letterSpacing: -0.6 * unit }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.65}>{name}</Text>
        </View>
        {enabled && portrait.foreground ? <Image source={{ uri: portrait.foreground }} resizeMode="contain" resizeMethod="none" fadeDuration={0} style={{ position: 'absolute', width: pw, height: ph, left: (w - pw) / 2 + frameWidth * o.depthX / 100, top: h * o.depthY / 100 }} /> : enabled && image && settings.callPhoto !== false ?
          <Image source={{ uri: image }} resizeMode="cover" resizeMethod="none" fadeDuration={0} style={{ position: 'absolute', width: w * 0.48, height: w * 0.48, borderRadius: w * 0.24, top: h * 0.28, alignSelf: 'center' }} /> : !image ?
          <View style={{ position: 'absolute', top: h * 0.28, alignSelf: 'center', opacity: 0.3 }}><Ionicons name="person" size={w * 0.38} color="#20363B" /></View> : null}
      </>}
      {showFeedback && <View style={{ position: 'absolute', top: 10, left: 12, right: 12, flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
        {portrait.state === 'loading' && <ActivityIndicator size="small" color="#20363B" />}
        <Text style={{ color: '#40565B', fontSize: 11 }}>{portrait.state === 'loading' ? 'Preparing portrait…' : portrait.state === 'unavailable' ? 'Cutout unavailable · showing original photo' : !image ? 'Choose a portrait photo to preview depth' : enabled ? 'Live preview' : 'Depth off'}</Text>
      </View>}
    </View>
  );
}
