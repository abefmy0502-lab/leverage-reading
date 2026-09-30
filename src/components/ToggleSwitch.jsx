// 切り替えスイッチ（DESIGN §5）。設定（AccountSettings）と、共有の編集画面の「表示する項目」で使う。
// iOS 風トグルスイッチ。on/off が「色＋ノブ位置」で一目で分かるので、
// 「オン（タップでオフ）」のように状態と操作をラベルに詰め込む分かりにくさを解消する。
export default function ToggleSwitch({ checked, onChange, disabled = false, busy = false, ariaLabel }) {
  // ボタン自体は 44px 以上のヒット領域（透明）にし、見た目のトラック（51×31）は
  // 内側の span に持たせる。旧: button=トラックだったため実タップ高 31px で
  // iOS 最低ライン（44px）未満だった。
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={onChange}
      style={{
        flexShrink: 0,
        minWidth: 59,
        minHeight: 44,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        border: 'none',
        padding: 0,
        background: 'none',
        cursor: disabled || busy ? 'default' : 'pointer',
        opacity: 1, // 処理中も薄くしない（DESIGN §5「押せないボタン」）。状態は aria-busy で伝える
        fontFamily: 'inherit',
      }}
    >
      {/* トラック/ノブの寸法は iOS のスイッチの形そのもの（UI の余白ではない）。
          オフのトラックは操作部品の枠と同じ --border（3:1 以上）で、明暗どちらでも見える。 */}
      <span
        aria-hidden="true"
        style={{
          position: 'relative',
          display: 'inline-block',
          width: 51,
          height: 31,
          borderRadius: 999,
          background: checked ? 'var(--accent)' : 'var(--border)',
          transition: 'background var(--duration-fast) ease',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 22 : 2,
            width: 27,
            height: 27,
            borderRadius: '50%',
            // つまみは iOS と同じく明暗とも白（--surface だと暗い画面で黒くなり、オフのトラックに沈む）。
            background: 'var(--switch-knob)',
            boxShadow: 'var(--shadow-raised)',
            transition: 'left var(--duration-fast) cubic-bezier(0.3, 1.3, 0.6, 1)',
          }}
        />
      </span>
    </button>
  );
}
