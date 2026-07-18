import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import { formatUSD } from '../lib/format'
import type { HospitalEstimate } from '../types'

type Props = {
  results: HospitalEstimate[]
  selectedId: string | null
  onSelect: (hospitalId: string) => void
}

// Full class strings, not interpolated fragments — Tailwind scans source text,
// so a dynamically assembled class name would never make it into the bundle.
const CARD_BASE =
  'rounded-lg border shadow-md px-2.5 py-1.5 text-left whitespace-nowrap'
const CARD_DEFAULT = `${CARD_BASE} bg-white border-slate-300`
const CARD_SELECTED = `${CARD_BASE} bg-teal-700 border-teal-900`

const NAME_DEFAULT = 'block max-w-[11rem] truncate text-[11px] text-slate-600'
const NAME_SELECTED = 'block max-w-[11rem] truncate text-[11px] text-teal-50'

const PRICE_DEFAULT = 'text-sm font-semibold text-slate-900'
const PRICE_SELECTED = 'text-sm font-semibold text-white'

const DIST_DEFAULT = 'text-[11px] text-slate-500'
const DIST_SELECTED = 'text-[11px] text-teal-100'

const TAIL_DEFAULT =
  'mx-auto h-2 w-2 -mt-1 rotate-45 border-r border-b bg-white border-slate-300'
const TAIL_SELECTED =
  'mx-auto h-2 w-2 -mt-1 rotate-45 border-r border-b bg-teal-700 border-teal-900'

/** Hospital names come from data; escape before interpolating into markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Marker cards via divIcon rather than Leaflet's default marker images, which
 * 404 under Vite unless the icon assets are re-pointed by hand.
 *
 * `iconSize` is deliberately omitted so Leaflet leaves the element unsized and
 * the card grows to fit its text — fixing it to a constant clipped longer
 * prices. With no size, Leaflet applies no anchor either, so the inner wrapper
 * shifts itself to sit centred above the coordinate.
 *
 * `w-max` on that wrapper is load-bearing: the marker element is absolutely
 * positioned, and shrink-to-fit lets the truncating (overflow-hidden) name
 * collapse the card to a few pixels wide.
 */
function hospitalIcon(
  name: string,
  price: string,
  distanceMiles: number,
  selected: boolean,
) {
  return L.divIcon({
    className: '',
    html: `
      <div class="w-max -translate-x-1/2 -translate-y-full pb-1">
        <div class="${selected ? CARD_SELECTED : CARD_DEFAULT}">
          <span class="${selected ? NAME_SELECTED : NAME_DEFAULT}">${escapeHtml(name)}</span>
          <span class="${selected ? PRICE_SELECTED : PRICE_DEFAULT}">${price}</span>
          <span class="${selected ? DIST_SELECTED : DIST_DEFAULT}"> · ${distanceMiles} mi</span>
        </div>
        <div class="${selected ? TAIL_SELECTED : TAIL_DEFAULT}"></div>
      </div>
    `,
  })
}

/** Refits the viewport whenever the result set changes. */
function FitBounds({ results }: { results: HospitalEstimate[] }) {
  const map = useMap()

  useEffect(() => {
    if (results.length === 0) return
    const bounds = L.latLngBounds(
      results.map((r) => [r.hospital.lat, r.hospital.lng] as [number, number]),
    )
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
  }, [map, results])

  return null
}

export function HospitalMap({ results, selectedId, onSelect }: Props) {
  // Boston, used only for the first paint before FitBounds runs.
  const center = useMemo<[number, number]>(() => [42.3601, -71.0589], [])

  return (
    <MapContainer
      center={center}
      zoom={11}
      scrollWheelZoom
      className="h-[32rem] w-full rounded border border-slate-200"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds results={results} />
      {results.map((result, index) => {
        const selected = result.hospital.id === selectedId
        // Leaflet stacks markers by latitude, which is meaningless here and
        // buries cheap options behind expensive ones downtown. Results arrive
        // cheapest-first, so rank decides what stays readable. The step has to
        // clear the latitude term (pixel y, in the thousands) to win.
        const stackOrder = selected
          ? 1_000_000
          : (results.length - index) * 10_000
        return (
          <Marker
            key={result.hospital.id}
            position={[result.hospital.lat, result.hospital.lng]}
            icon={hospitalIcon(
              result.hospital.name,
              formatUSD(result.breakdown.patient_responsibility),
              result.distance_miles,
              selected,
            )}
            zIndexOffset={stackOrder}
            eventHandlers={{ click: () => onSelect(result.hospital.id) }}
            title={result.hospital.name}
          />
        )
      })}
    </MapContainer>
  )
}
