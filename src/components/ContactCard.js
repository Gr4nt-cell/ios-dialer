import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';
import { initials } from '../phone';

/**
 * Tall rounded "poster" card: the contact's photo, or their own gradient with initials.
 * - overlay: name drawn on the card (favourites)
 * - otherwise the name sits underneath the card (contacts grid)
 */
export default function ContactCard({ width, height, name, label, image, colorKey, onPress, onLongPress, overlay, radius = 22 }) {
  const t = useTheme();
  const letters = initials(name);
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={{ width }}>
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.card,
              {
                width,
                height,
                borderRadius: radius,
                borderColor: t.dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.9)',
                transform: [{ scale: pressed ? 0.95 : 1 }],
              },
            ]}
          >
            {image ? (
              <Image source={{ uri: image }} resizeMode="cover" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: t.dark ? '#3A3A3C' : '#E9E9EE', alignItems: 'center', justifyContent: 'center', paddingBottom: overlay ? 24 : 0 }]}>
                {/* soft frosted highlight for the liquid-glass look */}
                <LinearGradient
                  colors={t.dark ? ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.12)'] : ['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.25)', 'rgba(0,0,0,0.04)']}
                  locations={[0, 0.5, 1]}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                {letters ? (
                  <Text style={{ color: t.dark ? '#C7C7CC' : '#8E8E93', fontSize: Math.round(width * 0.36), fontWeight: '600', letterSpacing: 0.5 }}>{letters}</Text>
                ) : (
                  <Ionicons name="person" size={Math.round(width * 0.42)} color={t.dark ? '#AEAEB2' : '#A1A1A6'} />
                )}
              </View>
            )}
            {/* glass sheen along the top edge */}
            <LinearGradient colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']} style={styles.sheen} pointerEvents="none" />
            {overlay ? (
              <>
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={styles.shade} pointerEvents="none" />
                <View style={styles.overlayText}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                    {name.split(' ')[0]}
                  </Text>
                  {label ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
                      <Ionicons name="call" size={10} color="rgba(255,255,255,0.8)" style={{ marginRight: 3 }} />
                      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }} numberOfLines={1}>
                        {label}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}
          </View>
          {!overlay ? (
            <Text style={{ color: t.text, fontSize: 12, fontWeight: '500', marginTop: 5, textAlign: 'center' }} numberOfLines={2}>
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
  sheen: { position: 'absolute', left: 0, right: 0, top: 0, height: '35%' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 64 },
  overlayText: { position: 'absolute', left: 10, right: 8, bottom: 9 },
});
