import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import L from "leaflet";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import type { PropertyMarker } from "@/lib/portfolio.functions";

// Standard fix for leaflet's default-marker-icon-not-loading issue
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

export default function PortfolioMap({
  markers,
}: {
  markers: PropertyMarker[];
}) {
  return (
    <MapContainer
      center={[51.1657, 10.4515]}
      zoom={6}
      style={{ height: "600px", width: "100%" }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers.map((m) => (
        <CircleMarker
          key={m.id}
          center={[m.lat, m.lng]}
          radius={11}
          pathOptions={{
            color: COLOR[m.status],
            fillColor: COLOR[m.status],
            fillOpacity: 0.75,
            weight: 2,
          }}
          eventHandlers={{
            click: () => console.log(m.id),
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
