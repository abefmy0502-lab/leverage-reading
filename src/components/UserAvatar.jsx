// 🙂 自分のアイコン（2026-11-21）。右上の設定の入口・設定のプロフィールの行・アイコンを選ぶ欄で同じものを使う。
//   選んだアイコン＝代用表紙の色の丸に白い絵／選んでいない＝--fill の丸にニックネームの 1 字（無ければ人の形）。
import { BookOpen, Coffee, Leaf, Moon, Sun, Feather, Mountain, Waves, Cat, Bird, User } from 'lucide-react';
import { avatarById, avatarBackground, avatarInitial } from '../lib/avatars';

const ICONS = { BookOpen, Coffee, Leaf, Moon, Sun, Feather, Mountain, Waves, Cat, Bird };

export default function UserAvatar({ avatarId = '', nickname = '', size = 32, style = null }) {
  const a = avatarById(avatarId);
  const Icon = a ? ICONS[a.icon] : null;
  const initial = a ? '' : avatarInitial(nickname);
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, flexShrink: 0, borderRadius: '50%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: avatarBackground(a),
        color: a ? 'var(--on-cover)' : 'var(--text-2)',
        boxShadow: a ? 'none' : 'inset 0 0 0 1px var(--separator)',
        fontSize: Math.round(size * 0.45), fontWeight: 600, lineHeight: 1,
        ...style,
      }}
    >
      {Icon ? <Icon size={Math.round(size * 0.55)} strokeWidth={1.75} /> : initial || <User size={Math.round(size * 0.55)} strokeWidth={1.75} />}
    </span>
  );
}
