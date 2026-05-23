import type { Property, Tenant } from "@/types";

export const INITIAL_DATE = "2026-05-01";

export const INITIAL_PROPERTY: Property = {
  id: "prop_berlin_mitte",
  name: "hallo theo Berlin Mitte Portfolio",
  units: 12,
  expectedMonthlyRent: 14800,
};

export const INITIAL_TENANTS: Tenant[] = [
  {
    id: "muller",
    name: "Müller",
    unit: "1A",
    rent: 1100,
    archetype: "reliable",
    status: "current",
  },
  { id: "weber", name: "Weber", unit: "1B", rent: 1250, archetype: "reliable", status: "current" },
  {
    id: "schneider",
    name: "Schneider",
    unit: "2A",
    rent: 980,
    archetype: "reliable",
    status: "current",
  },
  {
    id: "fischer",
    name: "Fischer",
    unit: "2B",
    rent: 1300,
    archetype: "reliable",
    status: "current",
  },
  {
    id: "wagner",
    name: "Wagner",
    unit: "3A",
    rent: 1050,
    archetype: "reliable",
    status: "current",
  },
  {
    id: "becker",
    name: "Becker",
    unit: "3B",
    rent: 1400,
    archetype: "reliable",
    status: "current",
  },
  {
    id: "hoffmann",
    name: "Hoffmann",
    unit: "4A",
    rent: 1200,
    archetype: "soft_fail",
    status: "current",
  },
  {
    id: "kaya",
    name: "Kaya",
    unit: "4B",
    rent: 1200,
    archetype: "payment_plan",
    status: "current",
  },
  { id: "nowak", name: "Nowak", unit: "5A", rent: 1350, archetype: "soft_fail", status: "current" },
  { id: "braun", name: "Braun", unit: "5B", rent: 1100, archetype: "reliable", status: "current" },
  {
    id: "richter",
    name: "Richter",
    unit: "6A",
    rent: 1470,
    archetype: "critical",
    status: "current",
  },
  { id: "klein", name: "Klein", unit: "6B", rent: 1400, archetype: "reliable", status: "current" },
];
