import { useEffect, useState } from "react";
import { MapContainer, GeoJSON, CircleMarker, Tooltip } from "react-leaflet";
import L from "leaflet";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import type { PropertyMarker } from "@/lib/portfolio.functions";

L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

const COLOR: Record<PropertyMarker["status"], string> = {
  red: "#dc2626",
  yellow: "#eab308",
  green: "#16a34a",
};

const germanyBounds = L.latLngBounds([47.27, 5.87], [55.06, 15.04]);

const GEOJSON_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";

function isGermany(props: Record<string, unknown> | undefined): boolean {
  if (!props) return false;
  const name = props.NAME as string | undefined;
  const admin = props.ADMIN as string | undefined;
  const iso3 = props.ISO_A3 as string | undefined;
  return name === "Germany" || admin === "Germany" || iso3 === "DEU";
}

function isEurope(props: Record<string, unknown> | undefined): boolean {
  if (!props) return false;
  const continent = (props.CONTINENT ?? props.continent) as string | undefined;
  return continent === "Europe";
}

export default function PortfolioMap({
  markers,
}: {
  markers: PropertyMarker[];
}) {
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(GEOJSON_URL)
      .then((r) => r.json())
      .then((d: GeoJSON.FeatureCollection) => {
        if (cancelled) return;
        const filtered: GeoJSON.FeatureCollection = {
          ...d,
          features: d.features.filter((f) => isEurope(f.properties ?? undefined)),
        };
        setGeo(filtered);
      })
      .catch((e) => console.error("GeoJSON load failed", e));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <style>{`.leaflet-container { background-color: #f8fafc; }`}</style>
      <MapContainer
        bounds={germanyBounds}
        maxBounds={germanyBounds}
        maxBoundsViscosity={1.0}
        minZoom={5}
        maxZoom={11}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        {geo ? (
          <GeoJSON
            data={geo}
            style={(feature) => {
              if (isGermany(feature?.properties)) {
                return {
                  fillColor: "#f1f5f9",
                  fillOpacity: 1,
                  color: "#64748b",
                  weight: 1.5,
                };
              }
              return {
                fillColor: "#ffffff",
                fillOpacity: 1,
                color: "#cbd5e1",
                weight: 1,
              };
            }}
          />
        ) : null}
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
        {!geo ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 500,
              pointerEvents: "none",
              color: "#64748b",
              fontSize: 14,
            }}
          >
            Karte wird geladen…
          </div>
        ) : null}
      </MapContainer>
    </>
  );
}
