import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';
import { TAB_BAR_SPACE } from './theme';

/**
 * Phone or tablet, and how wide the thing you are drawing into actually is.
 *
 * The test is Android's own: a shortest side of at least 600dp. Shortest, not
 * current width, so turning a tablet upright doesn't demote it to a phone
 * mid-session, and a phone held sideways never gets promoted.
 */
export const TABLET_MIN_SIDE = 600;

export function useIsTablet() {
  const { width, height } = useWindowDimensions();
  return Math.min(width, height) >= TABLET_MIN_SIDE;
}

/**
 * The width a screen has to lay itself out in.
 *
 * On a phone that is the window. In the tablet shell a screen sits in a column
 * a few hundred points wide, and a screen that measures the window instead
 * would draw cards wider than the column holding them. Every screen that sizes
 * anything by hand reads this rather than useWindowDimensions.
 */
const PaneContext = createContext(null);
export const PaneProvider = PaneContext.Provider;

export function usePaneSize() {
  const window = useWindowDimensions();
  const pane = useContext(PaneContext);
  return pane || window;
}

/**
 * Room to leave at the foot of a screen for the floating tab bar.
 *
 * The tablet shell has no tab bar — the rail is down the side — so a screen in
 * a pane would otherwise reserve 92 points of nothing, which on the keypad
 * means the dial pad floating above a band of dead space.
 */
export function useBottomSpace() {
  return useContext(PaneContext) ? 0 : TAB_BAR_SPACE;
}
