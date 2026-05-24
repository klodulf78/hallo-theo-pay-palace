import { useEffect, useState } from "react";
import { MapContainer, GeoJSON, Marker, Tooltip } from "react-leaflet";
import { useNavigate } from "@tanstack/react-router";
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

// Lucide Building2 SVG path (24x24 viewBox)
const BUILDING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v8h4"/><path d="M18 9h2a2 2 0 0 1 2 2v11h-4"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`;

function buildingPin(color: string): L.DivIcon {
  const html = `
    <div style="
      position: relative;
      width: 32px;
      height: 42px;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));
    ">
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 32px;
        height: 32px;
        background: ${color};
        border: 2px solid #ffffff;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
      "></div>
      <div style="
        position: absolute;
        top: 4px;
        left: 4px;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="width:16px;height:16px;">${BUILDING_SVG.replace('viewBox="0 0 24 24"', 'viewBox="0 0 24 24" width="16" height="16"')}</div>
      </div>
    </div>`;
  return L.divIcon({
    html,
    className: "building-pin",
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    tooltipAnchor: [0, -38],
  });
}

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
      <style>{`
        .leaflet-container { background-color: #f8fafc; }
        .building-pin { background: transparent !important; border: none !important; }
      `}</style>
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
              const base = {
                color: "#000000",
                weight: 1.2,
                opacity: 1,
                lineJoin: "round" as const,
                lineCap: "round" as const,
              };
              if (f && isGermany(f)) {
                return { ...base, fillColor: "#e0e7ff", fillOpacity: 0.6 };
              }
              return { ...base, fillColor: "#ffffff", fillOpacity: 0.5 };
            }}
          />
        ) : null}
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lng]}
            icon={buildingPin(COLOR[m.status])}
          >
            <Tooltip direction="top" opacity={1}>
              <div style={{ lineHeight: 1.4 }}>
                <div style={{ fontWeight: 700 }}>{m.name}</div>
                {m.street ? <div>{m.street}</div> : null}
                {m.city ? <div>{m.city}</div> : null}
                <div>{m.unitCount} Einheiten</div>
                <div>{m.dunningCount} in Mahnung</div>
              </div>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </>
  );
}
