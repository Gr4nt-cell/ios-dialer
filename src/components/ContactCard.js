import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Touch';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { fs, useTheme } from '../theme';
import { initials } from '../phone';
import { Glass, KeypadGlass } from './Glass';

/**
 * Tall rounded "poster" card: the contact's photo, or their own gradient with initials.
 * - overlay: name drawn on the card (favourites)
 * - otherwise the name sits underneath the card (contacts grid)
 */
export default function ContactCard({ width, height, name, label, image, colorKey, onPress, onLongPress, overlay, radius = 22, glass = true, edgeShadow = false }) {
  const t = useTheme();
  const letters = initials(name);
  const keypadMaterial = glass && !image && !t.dark;
  const CardGlass = keypadMaterial ? KeypadGlass : Glass;
  const favoriteEdgeShadow = edgeShadow && !t.dark ? { boxShadow: '0px 4px 14px rgba(52, 78, 121, 0.22)' } : null;
  const face = image ? (
    <Image
      source={{ uri: image }}
      resizeMode="cover"
      style={[StyleSheet.absoluteFill, glass ? { opacity: t.dark ? 0.94 : 0.97 } : null]}
    />
  ) : (
    <View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: glass ? 'transparent' : t.fill, alignItems: 'center', justifyContent: 'center', paddingBottom: overlay ? 24 : 0 },
      ]}
    >
      {!keypadMaterial ? <LinearGradient
        colors={
          glass
            ? t.dark
              ? ['rgba(255,255,255,0.09)', 'rgba(255,255,255,0.025)', 'rgba(0,0,0,0.08)']
              : ['rgba(255,255,255,0.65)', 'rgba(255,255,255,0.28)', 'rgba(90,99,112,0.04)']
            : t.dark
              ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.06)']
              : ['rgba(255,255,255,0.85)', 'rgba(255,255,255,0.4)', 'rgba(90,99,112,0.02)']
        }
        locations={[0, 0.5, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      /> : null}
      {letters ? (
        <Text style={{ color: keypadMaterial ? t.secondary : t.dark ? '#C7C7CC' : '#8E8E93', fontSize: Math.round(width * 0.36), fontWeight: '600', letterSpacing: 0.5 }}>{letters}</Text>
      ) : (
        <Ionicons name="person" size={Math.round(width * 0.42)} color={keypadMaterial ? t.secondary : t.dark ? '#AEAEB2' : '#A1A1A6'} />
      )}
    </View>
  );
  const cardContents = (
    <>
      {face}
      {glass && !keypadMaterial ? (
        <LinearGradient
          colors={t.dark ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)', 'rgba(10,12,18,0.12)'] : ['rgba(255,255,255,0.24)', 'rgba(255,255,255,0.02)', 'rgba(35,50,70,0.06)']}
          locations={[0, 0.42, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      {!keypadMaterial ? <LinearGradient
        colors={glass ? ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
        style={styles.sheen}
        pointerEvents="none"
      /> : null}
      {overlay ? (
        <>
          {!keypadMaterial ? <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={styles.shade} pointerEvents="none" /> : null}
          <View style={styles.overlayText}>
            <Text style={{ color: keypadMaterial ? t.text : '#fff', fontSize: fs(14), fontWeight: '700' }} numberOfLines={1} allowFontScaling={false}>
              {name.split(' ')[0]}
            </Text>
            {label ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
                <Ionicons name="call" size={10} color={keypadMaterial ? t.secondary : 'rgba(255,255,255,0.8)'} style={{ marginRight: 3 }} />
                <Text style={{ color: keypadMaterial ? t.secondary : 'rgba(255,255,255,0.8)', fontSize: fs(11) }} numberOfLines={1} allowFontScaling={false}>
                  {label}
                </Text>
              </View>
            ) : null}
          </View>
        </>
      ) : null}
    </>
  );

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={{ width }}>
      {({ pressed }) => (
        <>
          {glass ? (
            <CardGlass
              radius={radius}
              strong
              vivid
              style={[keypadMaterial ? null : styles.glassCard, favoriteEdgeShadow, { width, height, transform: [{ scale: pressed ? 0.95 : 1 }] }]}
            >
              <View style={[styles.glassContent, { borderRadius: Math.max(0, radius - 1) }]}>{cardContents}</View>
            </CardGlass>
          ) : (
            <View
              style={[
                styles.card,
                {
                  width,
                  height,
                  borderRadius: radius,
                  borderColor: t.glassBorder,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                },
              ]}
            >
              {cardContents}
            </View>
          )}
          {!overlay ? (
            <Text style={{ color: t.text, fontSize: fs(12), fontWeight: '500', marginTop: 5, textAlign: 'center' }} numberOfLines={2}>
              {name}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', backgroundColor: '#E9E9EE', borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  glassCard: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  glassContent: { flex: 1, margin: 1, overflow: 'hidden', position: 'relative' },
  sheen: { position: 'absolute', left: 0, right: 0, top: 0, height: '35%' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 64 },
  overlayText: { position: 'absolute', left: 10, right: 8, bottom: 9 },
});
