// Section header — uniform 2-line section title (icon + label + count).
//
// Use anywhere a major section needs anchoring. Renders an h2 by default;
// pass `as="h3"` to nest. Count is optional and lives in a pill on the
// right; great for "メモ 12 件" / "行動 3 件" patterns.

export default function SectionHeader({
  icon,
  title,
  count,
  as = 'h2',
  rightSlot,
  className,
  style,
}) {
  const Heading = as;
  return (
    <div className={`section-header ${className || ''}`.trim()} style={style}>
      {icon && <span className="section-header-icon" aria-hidden="true">{icon}</span>}
      <Heading className="section-header-title">{title}</Heading>
      {count != null && (
        <span className="section-header-count" aria-label={`${count} 件`}>
          {count} 件
        </span>
      )}
      {rightSlot && <span style={{ marginLeft: 'auto' }}>{rightSlot}</span>}
    </div>
  );
}
