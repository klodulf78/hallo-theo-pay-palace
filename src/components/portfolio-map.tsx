import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import L from "leaflet";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import type { PropertyMarker } from "@/lib/portfolio.functions";

L.Icon.Default.mergeOptions({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
});

const COLOR: Record<PropertyMarker["status"], string> = {
  red: "#dc2626",
  yellow: "#eab308",
  green: "#16a34a",
};

const germanyBounds = L.latLngBounds([47.27, 5.87], [55.06, 15.04]);

export default function PortfolioMap({
  markers,
}: {
  markers: PropertyMarker[];
}) {
  return (
    <MapContainer
      bounds={germanyBounds}
      maxBounds={germanyBounds}
      maxBoundsViscosity={1.0}
      minZoom={5}
      maxZoom={11}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
      />
      {markers.map((m) => (
        <CircleMarker
          key={m.id}
          center={[m.lat, m.lng]}
          radius={10}
          pathOptions={{
            color: "#1f2937",
            fillColor: COLOR[m.status],
            fillOpacity: 0.85,
            weight: 2,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]} opacity={1}>
            {m.name} · {m.unitCount} Einheiten · {m.dunningCount} in Mahnung
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
