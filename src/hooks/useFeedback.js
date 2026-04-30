// 📩 Feedback — submits a feedback row to public.feedback.
//
// One-shot operation, no fetch/list (users can't read other people's
// feedback by RLS, and we don't currently surface their own history in
// the UI). If we ever need that, expand this hook.

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './useAuth';
import { LIMITS, clamp } from '../lib/limits';

// Categories the SQL CHECK accepts — keep in sync with supabase_feedback.sql.
export const FEEDBACK_CATEGORIES = [
  { value: 'bug', label: '🐛 バグ報告（うまく動かない）' },
  { value: 'feature', label: '💡 機能の追加要望' },
  { value: 'ui', label: '🎨 UI / デザインの改善' },
  { value: 'question', label: '📚 使い方の質問' },
  { value: 'thanks', label: '👏 感想・お礼' },
  { value: 'other', label: '📝 その他' },
];
const VALID_CATEGORY = new Set(FEEDBACK_CATEGORIES.map((c) => c.value));

// Length limits live here (not lib/limits.js) — they're feedback-specific
// and we don't want to pollute the shared LIMITS object.
export const FEEDBACK_LIMITS = {
  content: 2000,
  name: LIMITS.displayName,
  email: LIMITS.email,
  // user_agent is captured for debugging — clipped so we don't blow up the row.
  userAgent: 500,
};

export function useFeedback() {
  const { user } = useAuth();

  const submitFeedback = async ({ category, content, name, email }) => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase が設定されていません。');
    }
    if (!VALID_CATEGORY.has(category)) {
      throw new Error('カテゴリを選択してください。');
    }
    const trimmedContent = (content || '').trim();
    if (!trimmedContent) {
      throw new Error('内容を入力してください。');
    }

    const payload = {
      // user_id is null for unauthenticated submissions; RLS allows that
      // path. In practice we only render the form for logged-in users.
      user_id: user?.id || null,
      category,
      content: clamp(trimmedContent, FEEDBACK_LIMITS.content),
      name: name?.trim() ? clamp(name.trim(), FEEDBACK_LIMITS.name) : null,
      email: email?.trim() ? clamp(email.trim(), FEEDBACK_LIMITS.email) : null,
      user_agent:
        typeof navigator !== 'undefined' && navigator.userAgent
          ? clamp(navigator.userAgent, FEEDBACK_LIMITS.userAgent)
          : null,
    };

    const { error } = await supabase.from('feedback').insert([payload]);
    if (error) throw error;
  };

  return { submitFeedback };
}

export default useFeedback;
