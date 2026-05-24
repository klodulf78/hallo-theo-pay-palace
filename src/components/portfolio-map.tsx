import { useEffect, useState } from "react";
import { MapContainer, GeoJSON, CircleMarker, Tooltip } from "react-leaflet";
import L from "leaflet";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
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

const TOPO_URL = "https://unpkg.com/world-atlas@2/countries-50m.json";

function isGermany(f: GeoJSON.Feature): boolean {
  return (
    String(f.id) === "276" ||
    (f.properties as { name?: string } | null)?.name === "Germany"
  );
}

export default function PortfolioMap({
  markers,
}: {
  markers: PropertyMarker[];
}) {
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(TOPO_URL)
      .then((r) => r.json())
      .then((topo: Topology) => {
        if (cancelled) return;
        const fc = feature(
          topo,
          topo.objects.countries as GeometryCollection,
        ) as unknown as GeoJSON.FeatureCollection;
        setGeo(fc);
      })
      .catch((e) => console.error("TopoJSON load failed", e));
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
            style={(f) => {
              if (f && isGermany(f)) {
                return {
                  fillColor: "#e0e7ff",
                  fillOpacity: 0.6,
                  color: "#1e293b",
                  weight: 2,
                };
              }
              return {
                fillColor: "#ffffff",
                fillOpacity: 0.5,
                color: "#e2e8f0",
                weight: 0.5,
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

