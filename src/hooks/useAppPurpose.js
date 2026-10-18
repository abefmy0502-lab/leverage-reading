// 🎯 Orime を入れた理由を読む（lib/appPurpose.js）。書いたら同じ画面のほかの場所にもすぐ出る（イベント）。
import { useEffect, useState } from 'react';
import { readAppPurpose, APP_PURPOSE_CHANGED_EVENT } from '../lib/appPurpose';

export function useAppPurpose() {
  const [purpose, setPurpose] = useState(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    readAppPurpose().then((r) => { if (alive) { setPurpose(r); setLoaded(true); } });
    const onChange = (e) => setPurpose(e.detail?.record || null);
    window.addEventListener(APP_PURPOSE_CHANGED_EVENT, onChange);
    return () => { alive = false; window.removeEventListener(APP_PURPOSE_CHANGED_EVENT, onChange); };
  }, []);
  return { purpose, loaded };
}
