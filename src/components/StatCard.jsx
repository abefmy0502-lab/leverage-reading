// 📊 StatCard — uniform numeric tile (value + suffix + label + context).
//
// The big number is animated via AnimatedNumber so transitions feel
// alive. `trend` is the small delta line below ("↑ 昨日より +5%") and is
// styled by polarity (positive / negative / neutral).

import AnimatedNumber from './AnimatedNumber';

const trendClass = {
  positive: 'stat-trend stat-trend-positive',
  negative: 'stat-trend stat-trend-negative',
  neutral: 'stat-trend stat-trend-neutral',
};

export default function StatCard({
  icon,
  value,
  suffix,
  label,
  trend,                // { kind: 'positive'|'negative'|'neutral', text: string }
  context,              // free-form extra line under the trend
  animate = true,
  duration = 700,
  className,
  style,
}) {
  const numericValue = Number.isFinite(value) ? value : 0;
  return (
    <div className={`stat-card ${className || ''}`.trim()} style={style}>
      {icon && <div className="stat-card-icon" aria-hidden="true">{icon}</div>}
      <div>
        {animate ? (
          <AnimatedNumber
            value={numericValue}
            duration={duration}
            className="stat-card-value"
          />
        ) : (
          <span className="stat-card-value">{numericValue}</span>
        )}
        {suffix && <span className="stat-card-suffix">{suffix}</span>}
      </div>
      {label && <div className="stat-card-label">{label}</div>}
      {trend?.text && (
        <div className={trendClass[trend.kind || 'neutral']} style={{ marginTop: 'var(--space-1)' }}>
          {trend.text}
        </div>
      )}
      {context && <div className="stat-card-context">{context}</div>}
    </div>
  );
}
