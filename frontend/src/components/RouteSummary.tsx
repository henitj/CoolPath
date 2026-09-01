import type { RouteResponse } from '../types'
import { formatDistance, formatMinutes, formatTemp } from '../utils/format'

interface RouteSummaryProps {
  route: RouteResponse | null
  onClose: () => void
}

export default function RouteSummary({ route, onClose }: RouteSummaryProps) {
  if (!route) {
    return (
      <aside className="map-tip" aria-live="polite">
        <span className="tip-icon">⌖</span>
        <span><b>Plan a walk</b> — search a downtown place, use your location, or drop a pin.</span>
      </aside>
    )
  }

  const metrics = route.properties.metrics
  const comparison = route.comparison
  const profile = route.properties.profile
  const routeKind = profile === 'cool' ? 'Coolest route' : profile === 'safe' ? 'Safer route' : 'Fastest route'
  const benefit = comparison && comparison.shade_delta_pct > 1
    ? `${Math.round(comparison.shade_delta_pct)}% more shade than the quickest option`
    : comparison && comparison.distance_delta_m > 20
      ? `${Math.round(comparison.distance_delta_m)} m longer to avoid tougher blocks`
      : 'Balanced for the conditions right now'

  return (
    <aside className="route-summary" aria-live="polite">
      <button className="summary-close" type="button" title="Dismiss route" aria-label="Dismiss route" onClick={onClose}>×</button>
      <div className="route-summary-topline">
        <span className={`route-profile-dot ${profile}`} aria-hidden="true" />
        <span>{routeKind}</span>
        <span className="summary-updated">live conditions</span>
      </div>
      <div className="route-main-metrics">
        <div>
          <strong>{formatMinutes(metrics.est_walk_min)}</strong>
          <span>walk</span>
        </div>
        <div>
          <strong>{formatDistance(metrics.distance_m)}</strong>
          <span>distance</span>
        </div>
        <div className="comfort-metric">
          <strong>{Math.round(metrics.comfort_score)}</strong>
          <span>comfort score</span>
        </div>
      </div>
      <p className="route-benefit">{benefit}</p>
      <div className="route-detail-row">
        <span>Shade: {Math.round(metrics.shade_pct)}%</span>
        <span>Surface: {formatTemp(metrics.avg_temp_c, 'F')}</span>
        {metrics.hazard_count > 0 ? <span className="hazard-detail">Caution: {metrics.hazard_count} near route</span> : <span className="clear-detail">No reported hazards</span>}
      </div>
      {route.properties.warnings && route.properties.warnings.length > 0 && (
        <p className="route-warning">{route.properties.warnings[0]}</p>
      )}
    </aside>
  )
}
