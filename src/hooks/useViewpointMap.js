// 🗺 視点の地図を使っているか（lib/viewpointMapSetting.js）。どの画面で切り替えても、すぐほかの画面に効く。
import { useCallback, useEffect, useReducer } from 'react';
import { useAuth } from './useAuth';
import { readViewpointOn, setViewpointOn, subscribeViewpointSetting } from '../lib/viewpointMapSetting';

export function useViewpointMap() {
  const { user } = useAuth();
  const [, rerender] = useReducer((n) => n + 1, 0);
  useEffect(() => subscribeViewpointSetting(rerender), []);
  const on = readViewpointOn(user);
  const setOn = useCallback((next) => setViewpointOn(user, next), [user]);
  return { on, setOn };
}
