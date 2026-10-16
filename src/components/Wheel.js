import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated } from 'react-native';
import * as Haptics from 'expo-haptics';

const AnimatedFlatList = Animated.FlatList;

/**
 * Endless snapping list with a focused middle item.
 *
 * The options are repeated many times and the offset is quietly moved back to
 * the middle copy whenever it drifts near an end, so scrolling never stops. The
 * list is virtualised, so the repeats cost nothing to render.
 *
 * `renderItem({ item, index, isCentre, animated })` receives the animated
 * transform/opacity for that slot — spread it onto an Animated.View.
 */
export default function Wheel({
  data,
  itemSize,
  viewport,
  horizontal = false,
  initialIndex = 0,
  loops = 41,
  onCentre,
  renderItem,
  /** 'scale' shrinks the whole item, 'scaleX' only narrows it */
  transform = 'scale',
  scaleRange = [0.6, 0.82, 1, 0.82, 0.6],
  opacityRange = [0.4, 0.75, 1, 0.75, 0.4],
  haptics = true,
  style,
}) {
  const list = useRef(null);
  const offset = useRef(new Animated.Value(0)).current;
  const n = data.length;
  const middle = Math.floor(loops / 2);
  const start = middle * n + (initialIndex % Math.max(1, n));
  const lastIndex = useRef(start);
  const [centre, setCentre] = useState(start);

  const looped = useMemo(() => {
    if (!n) return [];
    const out = new Array(loops * n);
    for (let i = 0; i < loops * n; i++) out[i] = data[i % n];
    return out;
  }, [data, loops, n]);

  const pad = Math.max(0, (viewport - itemSize) / 2);

  const getItemLayout = useCallback(
    (_, index) => ({ length: itemSize, offset: itemSize * index, index }),
    [itemSize]
  );

  const handleScroll = useCallback(
    (e) => {
      const axis = horizontal ? e.nativeEvent.contentOffset.x : e.nativeEvent.contentOffset.y;
      const i = Math.round(axis / itemSize);
      if (i !== lastIndex.current) {
        lastIndex.current = i;
        setCentre(i);
        if (haptics) Haptics.selectionAsync().catch(() => {});
      }
    },
    [horizontal, itemSize, haptics]
  );

  const settle = useCallback(
    (e) => {
      if (!n) return;
      const axis = horizontal ? e.nativeEvent.contentOffset.x : e.nativeEvent.contentOffset.y;
      let i = Math.round(axis / itemSize);
      const low = 5 * n;
      const high = (loops - 5) * n;
      if (i <= low || i >= high) {
        const next = middle * n + (((i % n) + n) % n);
        list.current?.scrollToOffset({ offset: next * itemSize, animated: false });
        offset.setValue(next * itemSize);
        i = next;
      }
      lastIndex.current = i;
      setCentre(i);
      onCentre?.(data[((i % n) + n) % n], ((i % n) + n) % n);
    },
    [horizontal, itemSize, n, loops, middle, offset, onCentre, data]
  );

  const renderRow = useCallback(
    ({ item, index }) => {
      const input = [
        (index - 2) * itemSize,
        (index - 1) * itemSize,
        index * itemSize,
        (index + 1) * itemSize,
        (index + 2) * itemSize,
      ];
      const s = offset.interpolate({ inputRange: input, outputRange: scaleRange, extrapolate: 'clamp' });
      const o = offset.interpolate({ inputRange: input, outputRange: opacityRange, extrapolate: 'clamp' });
      const animated = {
        opacity: o,
        transform: [transform === 'scaleX' ? { scaleX: s } : { scale: s }],
      };
      return renderItem({ item, index, isCentre: index === centre, animated });
    },
    [itemSize, offset, scaleRange, opacityRange, transform, renderItem, centre]
  );

  if (!n) return null;

  return (
    <AnimatedFlatList
      ref={list}
      style={style}
      data={looped}
      horizontal={horizontal}
      keyExtractor={(_, i) => String(i)}
      getItemLayout={getItemLayout}
      initialScrollIndex={start}
      initialNumToRender={9}
      windowSize={5}
      maxToRenderPerBatch={9}
      removeClippedSubviews
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      snapToInterval={itemSize}
      disableIntervalMomentum
      decelerationRate="fast"
      scrollEventThrottle={16}
      contentContainerStyle={horizontal ? { paddingHorizontal: pad } : { paddingVertical: pad }}
      onMomentumScrollEnd={settle}
      onScrollEndDrag={settle}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: horizontal ? { x: offset } : { y: offset } } }],
        { useNativeDriver: true, listener: handleScroll }
      )}
      renderItem={renderRow}
    />
  );
}
