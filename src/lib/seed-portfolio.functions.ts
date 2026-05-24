import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Seed = {
  city: string;
  lat: number;
  lng: number;
  postal_code: string;
  properties: { name: string; street: string }[];
};

const SEEDS: Seed[] = [
  {
    city: "Berlin",
    lat: 52.52,
    lng: 13.405,
    postal_code: "10115",
    properties: [
      { name: "Hallo Theo · Berlin Mitte", street: "Torstraße 12" },
      {
        name: "Hallo Theo · Berlin Prenzlauer Berg",
        street: "Kastanienallee 45",
      },
      { name: "Hallo Theo · Berlin Kreuzberg", street: "Oranienstraße 78" },
    ],
  },
  {
    city: "München",
    lat: 48.1351,
    lng: 11.582,
    postal_code: "80331",
    properties: [
      { name: "Hallo Theo · München Schwabing", street: "Leopoldstraße 22" },
      {
        name: "Hallo Theo · München Maxvorstadt",
        street: "Türkenstraße 56",
      },
      {
        name: "Hallo Theo · München Glockenbachviertel",
        street: "Müllerstraße 33",
      },
    ],
  },
  {
    city: "Frankfurt am Main",
    lat: 50.1109,
    lng: 8.6821,
    postal_code: "60313",
    properties: [
      { name: "Hallo Theo · Frankfurt Bornheim", street: "Berger Straße 110" },
      {
        name: "Hallo Theo · Frankfurt Sachsenhausen",
        street: "Schweizer Straße 64",
      },
      { name: "Hallo Theo · Frankfurt Westend", street: "Bockenheimer Landstraße 24" },
    ],
  },
];

export const seedDemoPortfolio = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ properties: number; units: number; tenants: number }> => {
    let { data: owner } = await supabaseAdmin
      .from("owners")
      .select("id")
      .eq("name", "Hallo Theo Demo Owner")
      .maybeSingle();
    if (!owner) {
      const { data, error } = await supabaseAdmin
        .from("owners")
        .insert({ name: "Hallo Theo Demo Owner", management_fee_rate: 0.05 })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      owner = data;
    }

    // Idempotent: remove prior seeded properties (keep the original demo property).
    const { data: priorProps } = await supabaseAdmin
      .from("properties")
      .select("id, name")
      .like("name", "Hallo Theo · %")
      .neq("name", "Hallo Theo · Berlin Mitte Portfolio");
    const priorIds = (priorProps ?? []).map((p) => p.id);
    if (priorIds.length > 0) {
      await supabaseAdmin.from("units").delete().in("property_id", priorIds);
      await supabaseAdmin.from("properties").delete().in("id", priorIds);
    }

    const jitter = () => (Math.random() - 0.5) * 0.6; // ±0.30° ≈ ±30km
    let totalProps = 0;
    let totalUnits = 0;

    for (const s of SEEDS) {
      for (const p of s.properties) {
        const { data: prop, error: pErr } = await supabaseAdmin
          .from("properties")
          .insert({
            name: p.name,
            owner_id: owner.id,
            city: s.city,
            street: p.street,
            postal_code: s.postal_code,
            lat: s.lat + jitter(),
            lng: s.lng + jitter(),
          })
          .select("id")
          .single();
        if (pErr) throw new Error(pErr.message);
        totalProps++;

        const unitRows = [1, 2, 3, 4].map((i) => ({
          property_id: prop.id,
          label: `WE-${String(i).padStart(3, "0")}`,
        }));
        const { error: uErr } = await supabaseAdmin
          .from("units")
          .insert(unitRows);
        if (uErr) throw new Error(uErr.message);
        totalUnits += unitRows.length;
      }
    }

    return { properties: totalProps, units: totalUnits, tenants: 0 };
  },
);
