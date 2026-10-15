import { createContext, useContext } from 'react';

// push({ name: 'contact' | 'newContact' | 'settings' | 'pickFavorite', ...params }), pop()
export const NavContext = createContext({ push: () => {}, pop: () => {}, setTab: () => {} });
export const useNav = () => useContext(NavContext);
