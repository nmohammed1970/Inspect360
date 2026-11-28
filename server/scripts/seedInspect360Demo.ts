/**
 * Inspect360 demo seed (Inspect360_Cursor_Demo_Seed.md).
 *
 * Fills ONE organisation, found by a user's email, with fictional demo data.
 * Does not email, text, charge, or call webhooks. Default is a dry run.
 *
 * Zoopla listings are not imported. Pass --synthetic to write clearly fictional
 * London addresses. Nothing is written without --apply.
 *
 *   npx tsx server/scripts/seedInspect360Demo.ts --email you@example.com
 *   npx tsx server/scripts/seedInspect360Demo.ts --email you@example.com --apply --synthetic
 *   npx tsx server/scripts/seedInspect360Demo.ts --email you@example.com --apply --synthetic --extended
 *   npx tsx server/scripts/seedInspect360Demo.ts --email you@example.com --reset --apply
 *
 * npm run seed:demo -- --email you@example.com --apply --synthetic
 *
 * Re-running --apply --synthetic replaces only this batch (seed-batch:3602026)
 * inside that organisation. Other records are left alone.
 * Tenant portal password for every seeded tenant: Demo360-seed
 */
import "dotenv/config";
import { randomBytes, scrypt } from "crypto";
import { mkdir, open, stat, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { withTemplateAiMeta } from "@shared/inspectionNoteSections";
import { buildPropertyRoomCountsSnapshot, type SeedInspectionEntry } from "@shared/propertyLayout";
import {
  applyPropertyRoomsToTemplateSnapshot,
  buildPropertyRoomsSnapshot,
  type PropertyRoomSnapshotItem,
} from "@shared/propertyRooms";
import {
  buildCheckOutSnapshotFromCheckIn,
  buildSeedEntriesFromCheckOutSnapshot,
} from "@shared/checkInSnapshotForCheckOut";

const scryptAsync = promisify(scrypt);
const BATCH = "seed-batch:3602026";
const SEED = 3602026;
const TENANT_PASSWORD = "Demo360-seed";
const MARKER_LIKE = "%seed-batch:3602026%";

const FIRST = [
  "Oliver", "Amelia", "George", "Isla", "Harry", "Ava", "Jack", "Mia", "Noah", "Grace",
  "Leo", "Freya", "Arthur", "Lily", "Oscar", "Chloe", "Henry", "Sophie", "Freddie", "Emily",
  "Archie", "Ella", "Theo", "Poppy", "Charlie", "Evie", "Alfie", "Rosie", "Jacob", "Daisy",
  "Thomas", "Hannah", "William", "Lucy", "James", "Ellie", "Edward", "Ruby", "Samuel", "Ivy",
];
const LAST = [
  "Hughes", "Patel", "Khan", "Clarke", "Walker", "Green", "Hall", "Young", "King", "Wright",
  "Baker", "Adams", "Nelson", "Carter", "Mitchell", "Parker", "Turner", "Collins", "Edwards", "Stewart",
  "Morris", "Murphy", "Cook", "Rogers", "Morgan", "Bell", "Murphy", "Cooper", "Richardson", "Cox",
  "Ward", "Torres", "Peterson", "Gray", "Ramirez", "James", "Watson", "Brooks", "Kelly", "Price",
];
const RELATIONSHIPS = ["Parent", "Sibling", "Partner", "Friend"];
const ZONES = ["East", "North", "South", "West", "Central"] as const;
const BLOCKS = [
  { zone: "East", name: "Eastbridge House", address: "12 Eastbridge Road, East London", image: "block-east" },
  { zone: "North", name: "Northgate House", address: "44 Northgate Avenue, North London", image: "block-north" },
  { zone: "South", name: "Southbank House", address: "8 Southbank Lane, South London", image: "block-south" },
  { zone: "West", name: "Westfield House", address: "19 Westfield Grove, West London", image: "block-west" },
  { zone: "Central", name: "Central Court", address: "3 Central Square, Central London", image: "block-central" },
] as const;
const ITEM_IMAGE: Record<string, string> = {
  Bed: "bed",
  Mattress: "mattress",
  "Bedside cabinet": "cabinet",
  "Bedside lamp": "lamp",
  Sofa: "sofa",
  Microwave: "microwave",
  "Dining table": "table",
  "Dining chair": "chair",
  Fridge: "fridge",
  "Washing machine": "washer",
  Wardrobe: "wardrobe",
  Kettle: "kettle",
  Desk: "desk",
  Television: "television",
  "Second bed": "bed",
  "Floor lamp": "lamp",
  "Storage cabinet": "cabinet",
  "Extra dining chair": "chair",
};
const PROPERTY_PHOTOS: Record<PropertyPlan["propertyType"], string[]> = {
  flat: ["flat-1", "flat-2", "flat-3", "flat-4", "flat-5", "flat-6", "flat-7", "flat-8"],
  house: ["house-1", "house-2", "house-3", "house-4", "house-5", "house-6", "house-7", "house-8"],
  maisonette: ["maisonette-1", "maisonette-2", "maisonette-3", "maisonette-4"],
};
const PORTRAITS = ["portrait-1", "portrait-2", "portrait-3", "portrait-4", "portrait-5", "portrait-6", "portrait-7", "portrait-8"];
const COLOURS = ["oak", "walnut", "white", "charcoal", "sage", "navy", "sand", "black"];
const MATERIALS = ["timber", "metal", "fabric", "glass", "laminate"];
const CONDITIONS = ["excellent", "good", "fair", "poor"] as const;
const CLEANLINESS = ["very_clean", "clean", "acceptable", "needs_cleaning"] as const;

type Phase = "new" | "quote" | "assigned" | "scheduled" | "completed" | "urgent" | "review";

type JobSpec = {
  n: number;
  title: string;
  phase: Phase;
  priority: "medium" | "high" | "urgent";
  /** Net pounds. Null means no quotation. */
  quoteNet: number | null;
  trade: string;
  detail: string;
};

const JOBS: JobSpec[] = [
  { n: 1, title: "Boiler no heating", phase: "assigned", priority: "high", quoteNet: 180, trade: "Plumber / heating engineer", detail: "The boiler fires then locks out. Heating and hot water are both off." },
  { n: 2, title: "Kitchen tap dripping", phase: "quote", priority: "medium", quoteNet: 95, trade: "Plumber / heating engineer", detail: "The kitchen mixer drips steadily into the sink overnight." },
  { n: 3, title: "Shower drain blocked", phase: "completed", priority: "medium", quoteNet: 85, trade: "Plumber / heating engineer", detail: "Water stands in the shower tray after every use." },
  { n: 4, title: "Bedroom damp patch", phase: "urgent", priority: "urgent", quoteNet: null, trade: "General maintenance", detail: "A damp patch has appeared on the bedroom ceiling. Routed for assessment, not held for a quote." },
  { n: 5, title: "Washing machine not draining", phase: "quote", priority: "medium", quoteNet: 120, trade: "General maintenance", detail: "The machine finishes the wash but leaves water in the drum." },
  { n: 6, title: "Broken wardrobe hinge", phase: "completed", priority: "medium", quoteNet: 65, trade: "General maintenance", detail: "The left wardrobe door hangs off one hinge." },
  { n: 7, title: "Front door lock sticking", phase: "assigned", priority: "high", quoteNet: 145, trade: "Locksmith", detail: "The front door key turns only part way and the door is hard to lock." },
  { n: 8, title: "Fridge not cooling", phase: "quote", priority: "high", quoteNet: 280, trade: "General maintenance", detail: "The fridge is running but food is not staying cold." },
  { n: 9, title: "Bathroom extractor failed", phase: "scheduled", priority: "medium", quoteNet: 160, trade: "Electrician", detail: "The bathroom fan no longer starts with the light." },
  { n: 10, title: "Water leaking through ceiling", phase: "urgent", priority: "urgent", quoteNet: null, trade: "Plumber / heating engineer", detail: "Emergency triage: water is coming through the living-room ceiling. Not held pending a quotation." },
  { n: 11, title: "Hallway light flickering", phase: "scheduled", priority: "medium", quoteNet: 95, trade: "Electrician", detail: "The hallway light flickers and sometimes fails to come on." },
  { n: 12, title: "Toilet cistern running", phase: "completed", priority: "medium", quoteNet: 110, trade: "Plumber / heating engineer", detail: "The cistern keeps refilling after a flush." },
  { n: 13, title: "Window seal draught", phase: "quote", priority: "medium", quoteNet: 125, trade: "General maintenance", detail: "Cold air comes through the bedroom window seal." },
  { n: 14, title: "Loose kitchen cupboard", phase: "completed", priority: "medium", quoteNet: null, trade: "General maintenance", detail: "A wall cupboard is loose. Treated as an internal minor repair with no quotation." },
  { n: 15, title: "Oven not heating", phase: "assigned", priority: "high", quoteNet: 155, trade: "Electrician", detail: "The oven light works but the oven does not heat." },
  { n: 16, title: "Smoke alarm fault", phase: "urgent", priority: "urgent", quoteNet: null, trade: "Electrician", detail: "The smoke alarm chirps and will not reset. Sent for urgent review, not a quote hold." },
  { n: 17, title: "Radiator cold", phase: "scheduled", priority: "medium", quoteNet: 90, trade: "Plumber / heating engineer", detail: "The living-room radiator stays cold while the others heat." },
  { n: 18, title: "Carpet trip hazard", phase: "quote", priority: "high", quoteNet: 190, trade: "General maintenance", detail: "The hall carpet has lifted at the doorway and is a trip hazard." },
  { n: 19, title: "Shower screen leaking", phase: "completed", priority: "medium", quoteNet: 115, trade: "General maintenance", detail: "Water escapes the shower screen onto the floor." },
  { n: 20, title: "Broken intercom", phase: "assigned", priority: "medium", quoteNet: 175, trade: "Electrician", detail: "The door intercom does not buzz and the handset is silent." },
  { n: 21, title: "Pest sighting", phase: "new", priority: "high", quoteNet: null, trade: "Pest control", detail: "The tenant reported a pest sighting in the kitchen. New request, not yet assigned." },
  { n: 22, title: "Microwave broken", phase: "quote", priority: "medium", quoteNet: 90, trade: "General maintenance", detail: "The microwave turns but does not heat." },
  { n: 23, title: "Sofa leg broken", phase: "completed", priority: "medium", quoteNet: 75, trade: "General maintenance", detail: "One sofa leg has snapped and the frame leans." },
  { n: 24, title: "Fence panel damaged", phase: "scheduled", priority: "medium", quoteNet: 220, trade: "General maintenance", detail: "A rear fence panel is split and leaning." },
  { n: 25, title: "Bath silicone deteriorated", phase: "completed", priority: "medium", quoteNet: 85, trade: "Decorator", detail: "The bath silicone is cracked and pulling away." },
  { n: 26, title: "Low water pressure", phase: "new", priority: "medium", quoteNet: null, trade: "Plumber / heating engineer", detail: "Hot water pressure at the kitchen tap is very low." },
  { n: 27, title: "Communal door not closing", phase: "urgent", priority: "urgent", quoteNet: null, trade: "Locksmith", detail: "The communal entrance door does not latch. Urgent assessment, no quotation yet." },
  { n: 28, title: "Condensation concern", phase: "review", priority: "medium", quoteNet: null, trade: "General maintenance", detail: "The tenant is worried about condensation on bedroom windows. Under review." },
  { n: 29, title: "Loose socket", phase: "urgent", priority: "urgent", quoteNet: null, trade: "Electrician", detail: "A socket by the bed is loose. Electrical hazard routed to review, not held for a quote." },
  { n: 30, title: "Missing bin lid", phase: "new", priority: "medium", quoteNet: null, trade: "Waste contractor", detail: "The outdoor bin lid is missing." },
];

const CONTACT_ROLES: Array<{ role: string; count: number; type: string; vat: boolean }> = [
  { role: "Landlord", count: 12, type: "landlord", vat: false },
  { role: "Plumber / heating engineer", count: 8, type: "contractor", vat: true },
  { role: "Electrician", count: 6, type: "contractor", vat: true },
  { role: "Decorator", count: 4, type: "contractor", vat: false },
  { role: "Cleaner", count: 4, type: "contractor", vat: false },
  { role: "General maintenance", count: 4, type: "contractor", vat: false },
  { role: "Locksmith", count: 3, type: "contractor", vat: false },
  { role: "Inventory clerk", count: 3, type: "internal", vat: false },
  { role: "Letting agent", count: 3, type: "partner", vat: false },
  { role: "Surveyor", count: 2, type: "other", vat: false },
  { role: "Pest control", count: 2, type: "contractor", vat: false },
  { role: "Waste contractor", count: 2, type: "contractor", vat: false },
  { role: "Insurance broker", count: 2, type: "other", vat: false },
  { role: "Solicitor", count: 2, type: "other", vat: false },
  { role: "Fire safety assessor", count: 2, type: "contractor", vat: false },
  { role: "Lift engineer", count: 1, type: "contractor", vat: true },
];

const BASE_ITEMS = [
  { name: "Bed", room: "Bedroom", category: "Furniture", min: 150, max: 650, years: 10 },
  { name: "Mattress", room: "Bedroom", category: "Furniture", min: 120, max: 480, years: 8 },
  { name: "Bedside cabinet", room: "Bedroom", category: "Furniture", min: 35, max: 150, years: 10 },
  { name: "Bedside lamp", room: "Bedroom", category: "Furniture", min: 15, max: 90, years: 6 },
  { name: "Sofa", room: "Living room", category: "Furniture", min: 250, max: 1200, years: 10 },
  { name: "Microwave", room: "Kitchen", category: "Appliances", min: 50, max: 180, years: 7 },
  { name: "Dining table", room: "Living room", category: "Furniture", min: 80, max: 400, years: 12 },
  { name: "Dining chair", room: "Living room", category: "Furniture", min: 25, max: 90, years: 8 },
  { name: "Fridge", room: "Kitchen", category: "Appliances", min: 180, max: 700, years: 10 },
  { name: "Washing machine", room: "Kitchen", category: "Appliances", min: 200, max: 550, years: 8 },
  { name: "Wardrobe", room: "Bedroom", category: "Furniture", min: 90, max: 450, years: 12 },
  { name: "Kettle", room: "Kitchen", category: "Appliances", min: 15, max: 45, years: 4 },
];
const EXTRA_ITEMS = [
  { name: "Desk", room: "Bedroom", category: "Furniture", min: 60, max: 280, years: 10 },
  { name: "Television", room: "Living room", category: "Appliances", min: 150, max: 600, years: 6 },
  { name: "Second bed", room: "Bedroom 2", category: "Furniture", min: 150, max: 500, years: 10 },
  { name: "Floor lamp", room: "Living room", category: "Furniture", min: 20, max: 90, years: 6 },
  { name: "Storage cabinet", room: "Hallway", category: "Furniture", min: 35, max: 150, years: 10 },
  { name: "Extra dining chair", room: "Living room", category: "Furniture", min: 25, max: 90, years: 8 },
];

const ROOMS = [
  { name: "Bedroom", slug: "bedroom", sort: 1 },
  { name: "Bedroom 2", slug: "bedroom-2", sort: 2 },
  { name: "Kitchen", slug: "kitchen", sort: 3 },
  { name: "Living room", slug: "living-room", sort: 4 },
  { name: "Bathroom", slug: "bathroom", sort: 5 },
  { name: "Hallway", slug: "hallway", sort: 6 },
];

type PropertyPlan = {
  index: number;
  code: string;
  name: string;
  address: string;
  zone: string;
  propertyType: "flat" | "house" | "maisonette";
  bedrooms: number;
  bathrooms: number;
  rentMinor: number;
  sqft: number;
};

type TenantPlan = {
  propertyIndex: number;
  slot: number;
  globalIndex: number;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  phone: string;
  shareMinor: number;
  profile: "on_time" | "late" | "partial" | "arrears";
  nokName: string;
  nokPhone: string;
  nokEmail: string;
  nokRelationship: string;
};

type ContactPlan = {
  index: number;
  role: string;
  type: string;
  vat: boolean;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n: number, width = 2) {
  return String(n).padStart(width, "0");
}

function unsplash(id: string) {
  return `https://images.unsplash.com/${id}?fm=jpg&fit=crop&w=1200&q=80`;
}

function pexels(id: number) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1200`;
}

/** Openly licensed photos (Unsplash, Pexels, Flickr). Saved under /demo-seed/photos when the seed writes. */
const PHOTO_SOURCES: Record<string, string> = {
  "house-1": unsplash("photo-1570129477492-45c003edd2be"),
  "house-2": unsplash("photo-1568605114967-8130f3a36994"),
  "house-3": unsplash("photo-1572120360610-d971b9d7767c"),
  "house-4": unsplash("photo-1564013799919-ab600027ffc6"),
  "house-5": unsplash("photo-1449844908441-8829872d2607"),
  "house-6": unsplash("photo-1600585154340-be6161a56a0c"),
  "house-7": unsplash("photo-1600596542815-ffad4c1539a9"),
  "house-8": unsplash("photo-1583608205776-bfd35f0d9f83"),
  "flat-1": unsplash("photo-1545324418-cc1a3fa10c00"),
  "flat-2": unsplash("photo-1460317442991-0ec209397118"),
  "flat-3": unsplash("photo-1522708323590-d24dbb6b0267"),
  "flat-4": unsplash("photo-1560448204-e02f11c3d0e2"),
  "flat-5": unsplash("photo-1502672260266-1c1ef2d93688"),
  "flat-6": unsplash("photo-1493809842364-78817add7ffb"),
  "flat-7": pexels(1571460),
  "flat-8": unsplash("photo-1536376072261-38c75010e6c9"),
  "maisonette-1": pexels(1396122),
  "maisonette-2": pexels(259588),
  "maisonette-3": pexels(210617),
  "maisonette-4": pexels(186077),
  "block-east": pexels(439391),
  "block-north": unsplash("photo-1545324418-cc1a3fa10c00"),
  "block-south": pexels(2462015),
  "block-west": pexels(323780),
  "block-central": unsplash("photo-1486406146926-c627a92ad1ab"),
  bed: unsplash("photo-1505693416388-ac5ce068fe85"),
  mattress: unsplash("photo-1631049307264-da0ec9d70304"),
  cabinet: unsplash("photo-1595428774223-ef52624120d2"),
  lamp: unsplash("photo-1507473885765-e6ed057f782c"),
  sofa: unsplash("photo-1555041469-a586c61ea9bc"),
  microwave: unsplash("photo-1585659722983-3a675dabf23d"),
  table: unsplash("photo-1617806118233-18e1de247200"),
  chair: unsplash("photo-1506439773649-6e0eb8cfb237"),
  fridge: unsplash("photo-1571175443880-49e1d25b2bc5"),
  washer: unsplash("photo-1626806787461-102c1bfaaea1"),
  wardrobe: unsplash("photo-1558997519-83ea9252edf8"),
  kettle: "https://live.staticflickr.com/7548/27648573220_b8ab359061_b.jpg",
  desk: unsplash("photo-1518455027359-f3f8164ba6bd"),
  television: unsplash("photo-1593359677879-a4bb92f829d1"),
  repair: unsplash("photo-1581578731548-c64695cc6952"),
  "portrait-1": pexels(774909),
  "portrait-2": pexels(1222271),
  "portrait-3": pexels(1181686),
  "portrait-4": pexels(1239291),
  "portrait-5": pexels(1130626),
  "portrait-6": pexels(415829),
  "portrait-7": pexels(1681010),
  "portrait-8": pexels(1181519),
};

const PHOTO_DIR = path.resolve(import.meta.dirname, "../../client/public/demo-seed/photos");

function photoFile(key: string) {
  return `/demo-seed/photos/${key}.jpg`;
}

function propertyImage(property: PropertyPlan) {
  const list = PROPERTY_PHOTOS[property.propertyType];
  return photoFile(list[property.index % list.length]);
}

function personImage(index: number) {
  return photoFile(PORTRAITS[index % PORTRAITS.length]);
}

async function downloadSeedPhotos() {
  await mkdir(PHOTO_DIR, { recursive: true });
  const keys = Object.keys(PHOTO_SOURCES);
  let fetched = 0;
  const pending = [...keys];
  const worker = async () => {
    while (pending.length) {
      const key = pending.shift();
      if (!key) return;
      const file = path.join(PHOTO_DIR, `${key}.jpg`);
      try {
        const info = await stat(file);
        if (info.size > 8000) {
          const head = Buffer.alloc(3);
          const opened = await open(file, "r");
          await opened.read(head, 0, 3, 0);
          await opened.close();
          if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) continue;
        }
      } catch {
        // missing, download below
      }
      const response = await fetch(PHOTO_SOURCES[key], {
        headers: { "User-Agent": "Inspect360DemoSeed/1.0", Accept: "image/jpeg" },
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`Could not download photo ${key} (${response.status})`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const isJpeg = bytes.length > 8000 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      if (!isJpeg) throw new Error(`Photo ${key} was not a JPEG`);
      await writeFile(file, bytes);
      fetched++;
    }
  };
  await Promise.all(Array.from({ length: 4 }, () => worker()));
  console.log(fetched ? `  Downloaded ${fetched} photos into /demo-seed/photos.` : "  Photos already saved in /demo-seed/photos.");
}

function dramaPhone(n: number): string {
  const local = String(900000 + n).padStart(6, "0");
  return `+44 7700 ${local.slice(0, 3)} ${local.slice(3)}`;
}

function londonToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseYmd(value: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`--as-of must be YYYY-MM-DD, received ${value}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function ymd(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function atNoon(value: string) {
  return `${value}T12:00:00.000Z`;
}

function addDays(value: string, days: number) {
  const date = new Date(atNoon(value));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shiftMonth(y: number, m: number, delta: number) {
  const index = y * 12 + (m - 1) + delta;
  return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}

function monthEnd(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function profileFor(index: number): TenantPlan["profile"] {
  if (index < 80) return "on_time";
  if (index < 90) return "late";
  if (index < 95) return "partial";
  return "arrears";
}

function buildProperties(): PropertyPlan[] {
  const properties: PropertyPlan[] = [];
  for (let i = 0; i < 50; i++) {
    const propertyType: PropertyPlan["propertyType"] = i < 30 ? "flat" : i < 45 ? "house" : "maisonette";
    const zone = ZONES[i % 5];
    const block = BLOCKS.find((item) => item.zone === zone)!;
    const unit = Math.floor(i / 5) + 1;
    const label = propertyType === "flat" ? "Flat" : propertyType === "house" ? "House" : "Maisonette";
    const code = pad(i + 1);
    const rentPounds = 1500 + ((i * 37) % 1500);
    properties.push({
      index: i,
      code,
      name: `${block.name}, ${label} ${unit}`,
      address: `${label} ${unit}, ${block.address}`,
      zone,
      propertyType,
      bedrooms: 2 + (i % 3),
      bathrooms: 1 + (i % 2),
      rentMinor: rentPounds * 100,
      sqft: 620 + i * 14,
    });
  }
  return properties;
}

function buildTenants(properties: PropertyPlan[]): TenantPlan[] {
  const tenants: TenantPlan[] = [];
  properties.forEach((property, propertyIndex) => {
    const shareA = Math.floor(property.rentMinor / 2);
    const shares = [shareA, property.rentMinor - shareA];
    for (let slot = 0; slot < 2; slot++) {
      const globalIndex = propertyIndex * 2 + slot;
      const nameIndex = globalIndex;
      tenants.push({
        propertyIndex,
        slot,
        globalIndex,
        firstName: FIRST[nameIndex % FIRST.length],
        lastName: LAST[(nameIndex * 3) % LAST.length],
        email: `${FIRST[nameIndex % FIRST.length]}.${LAST[(nameIndex * 3) % LAST.length]}.${property.code}${slot + 1}@example.com`.toLowerCase(),
        username: `${FIRST[nameIndex % FIRST.length]}.${LAST[(nameIndex * 3) % LAST.length]}.${property.code}${slot + 1}`.toLowerCase(),
        phone: dramaPhone(globalIndex),
        shareMinor: shares[slot],
        profile: profileFor(globalIndex),
        nokName: `${FIRST[(nameIndex + 11) % FIRST.length]} ${LAST[(nameIndex + 13) % LAST.length]}`,
        nokPhone: dramaPhone(100 + globalIndex),
        nokEmail: `kin.${FIRST[(nameIndex + 11) % FIRST.length]}.${LAST[(nameIndex + 13) % LAST.length]}.${property.code}${slot + 1}@example.com`.toLowerCase(),
        nokRelationship: RELATIONSHIPS[globalIndex % RELATIONSHIPS.length],
      });
    }
  });
  return tenants;
}

function buildContacts(): ContactPlan[] {
  const contacts: ContactPlan[] = [];
  let index = 0;
  for (const spec of CONTACT_ROLES) {
    for (let n = 0; n < spec.count; n++) {
      contacts.push({
        index,
        role: spec.role,
        type: spec.type,
        vat: spec.vat,
        firstName: FIRST[(index + 5) % FIRST.length],
        lastName: LAST[(index + 9) % LAST.length],
        email: `${FIRST[(index + 5) % FIRST.length]}.${LAST[(index + 9) % LAST.length]}.c${pad(index + 1)}@example.com`.toLowerCase(),
        phone: dramaPhone(200 + index),
        company: `${LAST[(index + 9) % LAST.length]} ${spec.role.split("/")[0].trim()}`,
      });
      index++;
    }
  }
  return contacts;
}

function assetCount() {
  let total = 0;
  for (let i = 0; i < 50; i++) total += BASE_ITEMS.length + (i % 7);
  return total;
}

function usage() {
  console.log(`Inspect360 demo seed

  npx tsx server/scripts/seedInspect360Demo.ts --email USER_EMAIL
  npx tsx server/scripts/seedInspect360Demo.ts --email USER_EMAIL --apply --synthetic
  npx tsx server/scripts/seedInspect360Demo.ts --email USER_EMAIL --apply --synthetic --extended
  npx tsx server/scripts/seedInspect360Demo.ts --email USER_EMAIL --reset --apply

--email      User whose organisation receives the data. Required.
--apply      Write. Without this flag the command only prints the plan.
--synthetic  Required with --apply. Uses fictional addresses. Real Zoopla listings are not imported.
--extended   Also add 150 communications, 250 sample compliance files, and scheduled inspections that use this organisation's templates.
--reset      Delete only this demo batch from that organisation, then stop unless --synthetic is also set.
--as-of      YYYY-MM-DD in Europe/London. Defaults to today. Rent dates are anchored to this day.
`);
}

function flag(name: string) {
  return process.argv.includes(name);
}

function option(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function rows<T = Record<string, unknown>>(client: PoolClient, sql: string, params: unknown[] = []) {
  const result = await client.query(sql, params);
  return result.rows as T[];
}

async function one<T = Record<string, unknown>>(client: PoolClient, sql: string, params: unknown[] = []) {
  const result = await rows<T>(client, sql, params);
  return result[0];
}

const ENTRY_FIELD_TYPES = new Set([
  "short_text", "long_text", "number", "select", "multiselect", "boolean", "rating",
  "date", "time", "datetime", "photo", "photo_array", "video", "gps", "signature",
  "auto_inspection_date", "auto_inspector", "auto_address", "auto_tenant_names",
  "auto_bedroom_count", "auto_bathroom_count",
]);

type SeedTemplate = {
  id: string;
  name: string;
  scope: string;
  isHmo: boolean;
  version: number;
  structure: Record<string, unknown>;
};

function parseTemplateStructure(
  raw: unknown,
  flags: { aiIncludeRecommendedActions?: boolean | null; aiIncludeMaintenanceIssues?: boolean | null },
) {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = { sections: [] };
    }
  }
  return withTemplateAiMeta(value, flags);
}

function isCheckInName(name: string) {
  return /\bcheck[\s-]?in\b/i.test(name);
}

function isCheckOutName(name: string) {
  return /\bcheck[\s-]?out\b/i.test(name);
}

function isHmoTemplate(template: SeedTemplate) {
  return template.isHmo || /\bhmo\b/i.test(template.name);
}

function inspectionTypeFor(template: SeedTemplate) {
  const name = template.name.toLowerCase();
  if (isCheckInName(name)) return "check_in";
  if (isCheckOutName(name)) return "check_out";
  if (name.includes("fire")) return "fire_hazard_assessment";
  if (name.includes("health") || name.includes("safety")) return "safety_compliance";
  return "routine";
}

function inspectionNote(template: SeedTemplate) {
  if (isCheckInName(template.name)) return `Check-in booked.\n${BATCH}`;
  if (isCheckOutName(template.name)) return `Check-out booked.\n${BATCH}`;
  if (isHmoTemplate(template)) return `HMO inspection booked.\n${BATCH}`;
  return `${template.name} booked.\n${BATCH}`;
}

async function loadOrgTemplates(client: PoolClient, orgId: string): Promise<SeedTemplate[]> {
  const found = await rows<{
    id: string;
    name: string;
    scope: string;
    is_hmo_template: boolean | null;
    version: number;
    structure_json: unknown;
    ai_include_recommended_actions: boolean | null;
    ai_include_maintenance_issues: boolean | null;
  }>(
    client,
    `SELECT id, name, scope, is_hmo_template, version, structure_json,
            ai_include_recommended_actions, ai_include_maintenance_issues
     FROM inspection_templates
     WHERE organization_id = $1 AND is_active = true
     ORDER BY name`,
    [orgId],
  );
  return found.map((row) => ({
    id: row.id,
    name: row.name,
    scope: row.scope,
    isHmo: row.is_hmo_template === true,
    version: row.version ?? 1,
    structure: parseTemplateStructure(row.structure_json, {
      aiIncludeRecommendedActions: row.ai_include_recommended_actions,
      aiIncludeMaintenanceIssues: row.ai_include_maintenance_issues,
    }),
  }));
}

type InspectionSlot = {
  template: SeedTemplate;
  propertyIndex?: number;
  blockId?: string;
  inheritCheckIn?: boolean;
};

function planInspectionSlots(
  templates: SeedTemplate[],
  propertyCount: number,
  blockIds: string[],
): InspectionSlot[] {
  const propertyTemplates = templates.filter((template) => template.scope === "property" || template.scope === "both");
  const blockTemplates = templates.filter((template) => template.scope === "block" || template.scope === "both");
  const checkIn = propertyTemplates.find((template) => isCheckInName(template.name));
  const checkOut = propertyTemplates.find((template) => isCheckOutName(template.name));
  const propertyOthers = propertyTemplates.filter(
    (template) => template !== checkIn && template !== checkOut && !isHmoTemplate(template),
  );
  const hmoOnBlocks = blockTemplates.filter((template) => isHmoTemplate(template));
  const hmoOnProperties = propertyTemplates.filter(
    (template) => isHmoTemplate(template) && template !== checkIn && template !== checkOut,
  );
  const otherBlocks = blockTemplates.filter((template) => !isHmoTemplate(template));
  const slots: InspectionSlot[] = [];
  const pairCount = Math.min(8, propertyCount);

  if (checkIn) {
    for (let i = 0; i < pairCount; i++) slots.push({ template: checkIn, propertyIndex: i });
  }
  if (checkOut) {
    for (let i = 0; i < pairCount; i++) {
      slots.push({ template: checkOut, propertyIndex: i, inheritCheckIn: Boolean(checkIn) });
    }
  }
  if (propertyOthers.length && propertyCount > 0) {
    const start = pairCount < propertyCount ? pairCount : 0;
    for (let i = 0; i < Math.min(8, propertyOthers.length * 2); i++) {
      const span = Math.max(1, propertyCount - start);
      slots.push({
        template: propertyOthers[i % propertyOthers.length],
        propertyIndex: start + (i % span),
      });
    }
  }
  if (hmoOnBlocks.length && blockIds.length) {
    blockIds.forEach((blockId, index) => {
      slots.push({ template: hmoOnBlocks[index % hmoOnBlocks.length], blockId });
    });
  } else if (hmoOnProperties.length && propertyCount > 0) {
    for (let i = 0; i < Math.min(5, propertyCount); i++) {
      slots.push({ template: hmoOnProperties[i % hmoOnProperties.length], propertyIndex: i % propertyCount });
    }
  }
  if (otherBlocks.length && blockIds.length) {
    otherBlocks.forEach((template, index) => {
      slots.push({ template, blockId: blockIds[index % blockIds.length] });
    });
  }
  return slots;
}

async function insertScheduledInspections(
  client: PoolClient,
  args: {
    orgId: string;
    actorId: string;
    asOf: string;
    propertyIds: string[];
    properties: PropertyPlan[];
    tenantIds: string[];
    blockIds: string[];
  },
) {
  const templates = (await loadOrgTemplates(client, args.orgId)).filter(
    (template) => !/^etc\b/i.test(template.name.trim()),
  );
  const slots = planInspectionSlots(templates, args.propertyIds.length, args.blockIds);
  const roomsByProperty = new Map<number, PropertyRoomSnapshotItem[]>();
  const checkInSnapshots = new Map<number, Record<string, unknown>>();
  const checkInRooms = new Map<number, ReturnType<typeof buildPropertyRoomsSnapshot>>();
  const checkInCounts = new Map<number, ReturnType<typeof buildPropertyRoomCountsSnapshot>>();
  const used = new Map<string, number>();

  const roomsFor = async (propertyIndex: number) => {
    const cached = roomsByProperty.get(propertyIndex);
    if (cached) return cached;
    const found = await rows<{
      id: string;
      name: string;
      category_id: string;
      category_name: string;
      category_slug: string | null;
    }>(
      client,
      `SELECT pr.id, pr.name, pr.category_id, c.name AS category_name, c.slug AS category_slug
       FROM property_rooms pr
       LEFT JOIN organization_room_categories c ON c.id = pr.category_id
       WHERE pr.property_id = $1
       ORDER BY pr.sort_order`,
      [args.propertyIds[propertyIndex]],
    );
    const rooms: PropertyRoomSnapshotItem[] = found.map((room) => ({
      id: room.id,
      name: room.name,
      categoryId: room.category_id,
      categoryName: room.category_name || room.name,
      categorySlug: room.category_slug || undefined,
    }));
    roomsByProperty.set(propertyIndex, rooms);
    return rooms;
  };

  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    const propertyIndex = slot.propertyIndex;
    let snapshot: Record<string, unknown> = slot.template.structure;
    let seedEntries: SeedInspectionEntry[] = [];
    let roomsSnapshot: ReturnType<typeof buildPropertyRoomsSnapshot> | null = null;
    let countsSnapshot: ReturnType<typeof buildPropertyRoomCountsSnapshot> | null = null;

    if (propertyIndex != null) {
      const rooms = await roomsFor(propertyIndex);
      if (rooms.length) {
        const applied = applyPropertyRoomsToTemplateSnapshot(snapshot, rooms, {
          propertyType: args.properties[propertyIndex].propertyType,
        });
        snapshot = applied.structure;
        seedEntries = applied.seedEntries;
        roomsSnapshot = buildPropertyRoomsSnapshot(rooms);
        countsSnapshot = buildPropertyRoomCountsSnapshot(applied.counts);
      }
    }

    if (slot.inheritCheckIn && propertyIndex != null && checkInSnapshots.has(propertyIndex)) {
      snapshot = buildCheckOutSnapshotFromCheckIn(checkInSnapshots.get(propertyIndex));
      seedEntries = buildSeedEntriesFromCheckOutSnapshot(snapshot);
      roomsSnapshot = checkInRooms.get(propertyIndex) ?? roomsSnapshot;
      countsSnapshot = checkInCounts.get(propertyIndex) ?? countsSnapshot;
    }

    if (isCheckInName(slot.template.name) && propertyIndex != null) {
      checkInSnapshots.set(propertyIndex, snapshot);
      if (roomsSnapshot) checkInRooms.set(propertyIndex, roomsSnapshot);
      if (countsSnapshot) checkInCounts.set(propertyIndex, countsSnapshot);
    }

    const created = await one<{ id: string }>(
      client,
      `INSERT INTO inspections (
         organization_id, property_id, block_id, tenant_id, inspector_id,
         type, status, scheduled_date, notes,
         template_id, template_version, template_snapshot_json,
         property_rooms_snapshot, property_room_counts_snapshot
       ) VALUES ($1,$2,$3,$4,$5,$6,'scheduled',$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb)
       RETURNING id`,
      [
        args.orgId,
        propertyIndex == null ? null : args.propertyIds[propertyIndex],
        slot.blockId ?? null,
        propertyIndex == null ? null : args.tenantIds[propertyIndex * 2],
        args.actorId,
        inspectionTypeFor(slot.template),
        atNoon(addDays(args.asOf, 14 + index)),
        inspectionNote(slot.template),
        slot.template.id,
        slot.template.version,
        JSON.stringify(snapshot),
        roomsSnapshot ? JSON.stringify(roomsSnapshot) : null,
        countsSnapshot ? JSON.stringify(countsSnapshot) : null,
      ],
    );

    for (const entry of seedEntries) {
      if (!ENTRY_FIELD_TYPES.has(entry.fieldType)) continue;
      await client.query(
        `INSERT INTO inspection_entries (inspection_id, section_ref, field_key, field_type, value_json)
         VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [created.id, entry.sectionRef, entry.fieldKey, entry.fieldType, JSON.stringify(entry.valueJson ?? null)],
      );
    }
    used.set(slot.template.name, (used.get(slot.template.name) || 0) + 1);
  }

  return { total: slots.length, templates: templates.length, used };
}

async function deleteBatch(client: PoolClient, orgId: string) {
  const demoProperties = await rows<{ id: string }>(
    client,
    `SELECT id FROM properties WHERE organization_id = $1 AND (name LIKE 'Demo 360 · %' OR fixflo_property_id LIKE 'batch-3602026-%')`,
    [orgId],
  );
  const propertyIds = demoProperties.map((row) => row.id);
  const assignments = await rows<{ id: string; tenant_id: string }>(
    client,
    `SELECT id, tenant_id FROM tenant_assignments WHERE organization_id = $1 AND notes LIKE $2`,
    [orgId, MARKER_LIKE],
  );
  const assignmentIds = assignments.map((row) => row.id);
  const legacyUsers = await rows<{ id: string }>(
    client,
    `SELECT id FROM users WHERE organization_id = $1 AND email LIKE 'demo360.%@example.com' AND role = 'tenant'`,
    [orgId],
  );
  const seededUserIds = [
    ...new Set([...assignments.map((row) => row.tenant_id), ...legacyUsers.map((row) => row.id)]),
  ];
  const accounts = assignmentIds.length
    ? await rows<{ id: string }>(
        client,
        `SELECT id FROM rent_accounts WHERE organization_id = $1 AND tenancy_id = ANY($2::varchar[])`,
        [orgId, assignmentIds],
      )
    : [];
  const accountIds = accounts.map((row) => row.id);
  const requests = await rows<{ id: string }>(
    client,
    `SELECT id FROM maintenance_requests WHERE organization_id = $1 AND (description LIKE $2 OR verification_notes LIKE $2)`,
    [orgId, MARKER_LIKE],
  );
  const requestIds = requests.map((row) => row.id);
  const orders = requestIds.length
    ? await rows<{ id: string }>(
        client,
        `SELECT id FROM work_orders WHERE organization_id = $1 AND maintenance_request_id = ANY($2::varchar[])`,
        [orgId, requestIds],
      )
    : [];
  const orderIds = orders.map((row) => row.id);
  const quotes = orderIds.length
    ? await rows<{ id: string }>(
        client,
        `SELECT id FROM maintenance_quotes WHERE organization_id = $1 AND work_order_id = ANY($2::varchar[])`,
        [orgId, orderIds],
      )
    : [];
  const quoteIds = quotes.map((row) => row.id);
  const invoices = orderIds.length
    ? await rows<{ id: string }>(
        client,
        `SELECT id FROM maintenance_invoices WHERE organization_id = $1 AND work_order_id = ANY($2::varchar[])`,
        [orgId, orderIds],
      )
    : [];
  const invoiceIds = invoices.map((row) => row.id);
  const cases = await rows<{ id: string }>(
    client,
    `SELECT id FROM communication_cases WHERE organization_id = $1 AND (reference LIKE 'D360-%' OR summary LIKE $2)`,
    [orgId, MARKER_LIKE],
  );
  const caseIds = cases.map((row) => row.id);
  const inspections = await rows<{ id: string }>(
    client,
    `SELECT id FROM inspections WHERE organization_id = $1 AND notes LIKE $2`,
    [orgId, MARKER_LIKE],
  );
  const inspectionIds = inspections.map((row) => row.id);

  const drop = async (sql: string, params: unknown[]) => {
    await client.query(sql, params);
  };

  if (caseIds.length) {
    await drop(`DELETE FROM communication_messages WHERE case_id = ANY($1::varchar[])`, [caseIds]);
    await drop(`DELETE FROM communication_actions WHERE case_id = ANY($1::varchar[])`, [caseIds]);
    await drop(`DELETE FROM communication_approvals WHERE case_id = ANY($1::varchar[])`, [caseIds]);
    await drop(`DELETE FROM communication_case_links WHERE case_id = ANY($1::varchar[])`, [caseIds]);
    await drop(`DELETE FROM communication_audit_events WHERE case_id = ANY($1::varchar[])`, [caseIds]);
    await drop(`DELETE FROM communication_sla_events WHERE case_id = ANY($1::varchar[])`, [caseIds]);
    await drop(`DELETE FROM communication_cases WHERE id = ANY($1::varchar[])`, [caseIds]);
  }
  if (invoiceIds.length) {
    await drop(`DELETE FROM maintenance_invoice_payments WHERE invoice_id = ANY($1::varchar[])`, [invoiceIds]);
    await drop(`DELETE FROM maintenance_invoice_share_tokens WHERE invoice_id = ANY($1::varchar[])`, [invoiceIds]);
    await drop(`DELETE FROM maintenance_invoice_lines WHERE invoice_id = ANY($1::varchar[])`, [invoiceIds]);
    await drop(`DELETE FROM maintenance_document_attachments WHERE invoice_id = ANY($1::varchar[])`, [invoiceIds]);
  }
  if (quoteIds.length) {
    await drop(`DELETE FROM maintenance_document_attachments WHERE quote_id = ANY($1::varchar[])`, [quoteIds]);
    await drop(`DELETE FROM maintenance_quote_share_tokens WHERE quote_id = ANY($1::varchar[])`, [quoteIds]);
    await drop(`DELETE FROM maintenance_quote_lines WHERE quote_id = ANY($1::varchar[])`, [quoteIds]);
  }
  if (orderIds.length) {
    await drop(`UPDATE work_orders SET approved_quote_id = NULL WHERE id = ANY($1::varchar[])`, [orderIds]);
    await drop(`DELETE FROM maintenance_invoices WHERE id = ANY($1::varchar[])`, [invoiceIds]);
    await drop(`DELETE FROM maintenance_quotes WHERE id = ANY($1::varchar[])`, [quoteIds]);
    await drop(`DELETE FROM work_order_events WHERE work_order_id = ANY($1::varchar[])`, [orderIds]);
    await drop(`DELETE FROM work_logs WHERE work_order_id = ANY($1::varchar[])`, [orderIds]);
    await drop(`DELETE FROM work_order_completion_checklist_responses WHERE work_order_id = ANY($1::varchar[])`, [orderIds]);
    await drop(`DELETE FROM maintenance_job_feedback WHERE work_order_id = ANY($1::varchar[])`, [orderIds]);
    await drop(`DELETE FROM work_order_accept_tokens WHERE work_order_id = ANY($1::varchar[])`, [orderIds]);
    await drop(`DELETE FROM work_order_certificates WHERE work_order_id = ANY($1::varchar[])`, [orderIds]);
    await drop(`DELETE FROM work_orders WHERE id = ANY($1::varchar[])`, [orderIds]);
  }
  if (requestIds.length) {
    await drop(`DELETE FROM maintenance_request_messages WHERE maintenance_request_id = ANY($1::varchar[])`, [requestIds]);
    await drop(`DELETE FROM maintenance_requests WHERE id = ANY($1::varchar[])`, [requestIds]);
  }
  if (inspectionIds.length) {
    await drop(`DELETE FROM inspection_entries WHERE inspection_id = ANY($1::varchar[])`, [inspectionIds]);
    await drop(`DELETE FROM inspection_responses WHERE inspection_id = ANY($1::varchar[])`, [inspectionIds]);
    await drop(`DELETE FROM inspection_items WHERE inspection_id = ANY($1::varchar[])`, [inspectionIds]);
    await drop(`DELETE FROM completion_checklist_responses WHERE inspection_id = ANY($1::varchar[])`, [inspectionIds]);
    await drop(`DELETE FROM inspection_gallery_assignments WHERE inspection_id = ANY($1::varchar[])`, [inspectionIds]);
    await drop(`DELETE FROM inspection_gallery_images WHERE inspection_id = ANY($1::varchar[])`, [inspectionIds]);
    await drop(`DELETE FROM inspections WHERE id = ANY($1::varchar[])`, [inspectionIds]);
  }
  await drop(
    `DELETE FROM compliance_documents
     WHERE organization_id = $1
       AND (document_url LIKE $2 OR property_id = ANY($3::varchar[]))`,
    [orgId, MARKER_LIKE, propertyIds],
  );
  await drop(
    `DELETE FROM asset_inventory WHERE organization_id = $1 AND maintenance_notes LIKE $2`,
    [orgId, MARKER_LIKE],
  );
  if (accountIds.length) {
    await drop(`DELETE FROM arrears_case_events WHERE case_id IN (SELECT id FROM arrears_cases WHERE account_id = ANY($1::varchar[]))`, [accountIds]);
    await drop(`DELETE FROM arrears_cases WHERE account_id = ANY($1::varchar[])`, [accountIds]);
    await drop(`DELETE FROM rent_allocations WHERE receipt_id IN (SELECT id FROM rent_receipts WHERE account_id = ANY($1::varchar[]))`, [accountIds]);
    await drop(`DELETE FROM rent_receipts WHERE account_id = ANY($1::varchar[])`, [accountIds]);
    await drop(`DELETE FROM rent_charges WHERE account_id = ANY($1::varchar[])`, [accountIds]);
    await drop(`DELETE FROM rent_schedule_versions WHERE account_id = ANY($1::varchar[])`, [accountIds]);
    await drop(`DELETE FROM rent_accounts WHERE id = ANY($1::varchar[])`, [accountIds]);
  }
  if (assignmentIds.length) {
    await drop(`DELETE FROM property_deposits WHERE tenant_assignment_id = ANY($1::varchar[])`, [assignmentIds]);
    await drop(`DELETE FROM tenant_assignments WHERE id = ANY($1::varchar[])`, [assignmentIds]);
  }
  if (propertyIds.length) {
    await drop(`DELETE FROM property_rooms WHERE property_id = ANY($1::varchar[])`, [propertyIds]);
  }
  if (seededUserIds.length) {
    await drop(`DELETE FROM users WHERE id = ANY($1::varchar[])`, [seededUserIds]);
  }
  await drop(
    `DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE organization_id = $1 AND (name = 'Demo 360 Maintenance' OR description LIKE $2))`,
    [orgId, MARKER_LIKE],
  );
  await drop(
    `DELETE FROM team_categories WHERE team_id IN (SELECT id FROM teams WHERE organization_id = $1 AND (name = 'Demo 360 Maintenance' OR description LIKE $2))`,
    [orgId, MARKER_LIKE],
  );
  await drop(
    `DELETE FROM teams WHERE organization_id = $1 AND (name = 'Demo 360 Maintenance' OR description LIKE $2)`,
    [orgId, MARKER_LIKE],
  );
  if (propertyIds.length) {
    await drop(`DELETE FROM properties WHERE id = ANY($1::varchar[])`, [propertyIds]);
  }
  await drop(`DELETE FROM blocks WHERE organization_id = $1 AND notes LIKE $2`, [orgId, MARKER_LIKE]);
  await drop(`DELETE FROM contacts WHERE organization_id = $1 AND notes LIKE $2`, [orgId, MARKER_LIKE]);
  await drop(
    `DELETE FROM communication_categories WHERE organization_id = $1 AND key IN ('demo360', 'portfolio')`,
    [orgId],
  );
}

async function main() {
  const email = option("--email");
  const apply = flag("--apply");
  const synthetic = flag("--synthetic");
  const extended = flag("--extended");
  const reset = flag("--reset");
  const asOf = option("--as-of") || londonToday();
  parseYmd(asOf);

  if (!email || email.startsWith("--")) {
    usage();
    process.exit(1);
  }

  const quoted = JOBS.filter((job) => job.quoteNet != null);
  if (quoted.length !== 20) {
    throw new Error(`Expected 20 quotations, built ${quoted.length}`);
  }
  if (CONTACT_ROLES.reduce((sum, role) => sum + role.count, 0) !== 60) {
    throw new Error("Contact role counts must total 60");
  }

  const properties = buildProperties();
  const tenants = buildTenants(properties);
  const contacts = buildContacts();
  const zoneCounts = Object.fromEntries(ZONES.map((zone) => [zone, properties.filter((p) => p.zone === zone).length]));
  const typeCounts = {
    flat: properties.filter((p) => p.propertyType === "flat").length,
    house: properties.filter((p) => p.propertyType === "house").length,
    maisonette: properties.filter((p) => p.propertyType === "maisonette").length,
  };

  console.log("Demo seed plan");
  console.log("  email:        ", email);
  console.log("  as-of:        ", asOf, "(Europe/London)");
  console.log("  mode:         ", apply ? "APPLY" : "DRY RUN");
  console.log("  addresses:    ", synthetic ? "fictional (--synthetic)" : "not approved for writing");
  console.log("  properties:   ", properties.length, zoneCounts, typeCounts);
  console.log("  tenants:      ", tenants.length, "next of kin:", tenants.length);
  console.log("  rent charges: ", tenants.length * 12, "(12 months × tenant share, shares sum to the property rent)");
  console.log("  inventory:    ", assetCount());
  console.log("  maintenance:  ", JOBS.length, "requests,", quoted.length, "quotes");
  console.log("  contacts:     ", contacts.length);
  console.log("  extended:     ", extended ? "communications, sample compliance, inspections" : "off");
  console.log("  blocks:       ", BLOCKS.length);
  console.log("  images:        openly licensed photos downloaded into /demo-seed/photos");
  console.log("  not sent:      email, SMS, push, payment collection, webhooks");
  console.log("  not imported:  Zoopla listings (full addresses were not verified)");

  const staffRes = await pool.query(
    `SELECT u.id, u.email, u.role, u.organization_id, o.name AS organization_name
     FROM users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     WHERE lower(u.email) = lower($1)`,
    [email],
  );
  const staff = staffRes.rows[0];
  if (!staff) throw new Error(`No user found with email ${email}`);
  if (!staff.organization_id) throw new Error(`${email} is not in an organisation`);
  const orgId = staff.organization_id as string;
  const actorId = staff.id as string;
  console.log("  organisation: ", staff.organization_name, orgId);

  if (!apply) {
    console.log("\nDry run only. No rows were written.");
    console.log("To write fictional demo data:");
    console.log(`  npx tsx server/scripts/seedInspect360Demo.ts --email ${email} --apply --synthetic`);
    await pool.end();
    return;
  }

  if (!synthetic && !reset) {
    console.error("\nRefusing to write. Real listing addresses were not verified.");
    console.error("Re-run with --synthetic to insert clearly fictional demo addresses, or --reset --apply to remove a previous batch.");
    await pool.end();
    process.exit(1);
  }

  if (synthetic) {
    await downloadSeedPhotos();
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await deleteBatch(client, orgId);
    if (!synthetic) {
      await client.query("COMMIT");
      console.log("\nRemoved the previous demo batch for this organisation. No new rows were inserted.");
      return;
    }

    await client.query(
      `UPDATE organizations
       SET rentals_enabled = true,
           tenancies_enabled = true,
           maintenance_enabled = true,
           compliance_enabled = true,
           communications_enabled = CASE WHEN $2 THEN true ELSE communications_enabled END,
           updated_at = NOW()
       WHERE id = $1`,
      [orgId, extended],
    );

    const passwordHash = await hashPassword(TENANT_PASSWORD);
    const { y: asY, m: asM } = parseYmd(asOf);
    const lease = shiftMonth(asY, asM, -11);
    const leaseStart = ymd(lease.y, lease.m, 1);
    const leaseEnd = addDays(leaseStart, 364);
    const roomIds = new Map<string, string>();
    for (const room of ROOMS) {
      const saved = await one<{ id: string }>(
        client,
        `INSERT INTO organization_room_categories (organization_id, name, name_normalized, slug, is_system, sort_order)
         VALUES ($1, $2, $3, $4, false, $5)
         ON CONFLICT (organization_id, name_normalized)
         DO UPDATE SET sort_order = EXCLUDED.sort_order
         RETURNING id`,
        [orgId, room.name, room.name.toLowerCase(), room.slug, room.sort],
      );
      roomIds.set(room.name, saved.id);
    }

    const blockIds = new Map<string, string>();
    for (const block of BLOCKS) {
      const inserted = await one<{ id: string }>(
        client,
        `INSERT INTO blocks (organization_id, name, address, notes, image_url)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id`,
        [orgId, block.name, block.address, `Residential block.\n${BATCH}`, photoFile(block.image)],
      );
      blockIds.set(block.zone, inserted.id);
    }

    const propertyIds: string[] = [];
    for (const property of properties) {
      const inserted = await one<{ id: string }>(
        client,
        `INSERT INTO properties (
           organization_id, block_id, name, address, property_type, image_url, sqft,
           bedrooms, kitchens, bathrooms, living_rooms, fixflo_property_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9,1,$10)
         RETURNING id`,
        [
          orgId,
          blockIds.get(property.zone),
          property.name,
          property.address,
          property.propertyType,
          propertyImage(property),
          property.sqft,
          property.bedrooms,
          property.bathrooms,
          `batch-3602026-property-${property.code}`,
        ],
      );
      propertyIds.push(inserted.id);
      for (const room of ROOMS) {
        await client.query(
          `INSERT INTO property_rooms (organization_id, property_id, category_id, name, sort_order, source)
           VALUES ($1,$2,$3,$4,$5,'manual')`,
          [orgId, inserted.id, roomIds.get(room.name), room.name, ROOMS.indexOf(room)],
        );
      }
    }

    const contactIdsByRole = new Map<string, string[]>();
    const landlordIds: string[] = [];
    for (const contact of contacts) {
      const image = personImage(contact.index);
      const notes = [
        `Role: ${contact.role}`,
        "Region: Greater London",
        "Preferred channel: email",
        `VAT registered: ${contact.vat ? "yes" : "no"}`,
        BATCH,
      ].join("\n");
      const inserted = await one<{ id: string }>(
        client,
        `INSERT INTO contacts (
           organization_id, type, first_name, last_name, email, phone, country_code,
           company_name, job_title, address, city, postal_code, country, notes,
           profile_image_url, tags
         ) VALUES (
           $1,$2,$3,$4,$5,$6,'+44',$7,$8,$9,'London','London','United Kingdom',$10,$11,$12
         ) RETURNING id`,
        [
          orgId,
          contact.type,
          contact.firstName,
          contact.lastName,
          contact.email,
          contact.phone,
          contact.company,
          contact.role,
          `${BLOCKS[contact.index % BLOCKS.length].address}`,
          notes,
          image,
          [contact.role],
        ],
      );
      const list = contactIdsByRole.get(contact.role) || [];
      list.push(inserted.id);
      contactIdsByRole.set(contact.role, list);
      if (contact.role === "Landlord") landlordIds.push(inserted.id);
    }

    for (let i = 0; i < propertyIds.length; i++) {
      await client.query(`UPDATE properties SET landlord_contact_id = $1 WHERE id = $2`, [
        landlordIds[i % landlordIds.length],
        propertyIds[i],
      ]);
    }

    const team = await one<{ id: string }>(
      client,
      `INSERT INTO teams (organization_id, name, description, email, is_active)
       VALUES ($1, 'Maintenance Team', $2, 'maintenance.team@example.com', true)
       RETURNING id`,
      [orgId, `Covers plumbing, electrical and general repairs.\n${BATCH}`],
    );
    for (const [role, ids] of contactIdsByRole) {
      if (role === "Landlord" || role === "Letting agent" || role === "Insurance broker" || role === "Solicitor" || role === "Surveyor") {
        continue;
      }
      for (const contactId of ids) {
        await client.query(
          `INSERT INTO team_members (team_id, contact_id, role) VALUES ($1, $2, 'member')`,
          [team.id, contactId],
        );
      }
    }

    const rng = mulberry32(SEED);
    let assets = 0;
    for (let i = 0; i < properties.length; i++) {
      const property = properties[i];
      const items = [...BASE_ITEMS, ...EXTRA_ITEMS.slice(0, i % 7)];
      for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
        const item = items[itemIndex];
        const colour = COLOURS[Math.floor(rng() * COLOURS.length)];
        const material = MATERIALS[Math.floor(rng() * MATERIALS.length)];
        const span = item.max - item.min;
        const price = item.min + Math.floor(rng() * (span + 1));
        const ownedYears = 1 + (i + itemIndex) % 5;
        const annual = Math.round((price / item.years) * 100) / 100;
        const current = Math.max(0, Math.round((price - annual * ownedYears) * 100) / 100);
        const purchased = addDays(asOf, -(ownedYears * 365));
        const condition = CONDITIONS[(i + itemIndex) % CONDITIONS.length];
        const cleanliness = CLEANLINESS[(i + itemIndex) % CLEANLINESS.length];
        const photo = photoFile(ITEM_IMAGE[item.name] || "cabinet");
        await client.query(
          `INSERT INTO asset_inventory (
             organization_id, property_id, name, category, description, location,
             supplier, model_number, date_purchased, purchase_price, warranty_expiry_date,
             condition, cleanliness, expected_lifespan_years, depreciation_per_year,
             current_value, photos, maintenance_notes
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
           )`,
          [
            orgId,
            propertyIds[i],
            item.name,
            item.category,
            `${colour} ${material} ${item.name.toLowerCase()}.`,
            item.room,
            "Harbour Supplies",
            `MDL-${property.code}-${itemIndex + 1}`,
            atNoon(purchased),
            price.toFixed(2),
            atNoon(addDays(purchased, 730)),
            condition,
            cleanliness,
            item.years,
            annual.toFixed(2),
            current.toFixed(2),
            [photo],
            `Straight-line depreciation over ${item.years} years.\n${BATCH}`,
          ],
        );
        assets++;
      }
    }

    const tenantIds: string[] = [];
    const assignmentIds: string[] = [];
    let charges = 0;
    let receipts = 0;
    let receiptMinor = 0;
    for (const tenant of tenants) {
      const property = properties[tenant.propertyIndex];
      const image = personImage(tenant.globalIndex);
      const user = await one<{ id: string }>(
        client,
        `INSERT INTO users (
           username, email, password, role, organization_id, first_name, last_name,
           is_active, onboarding_completed, phone, profile_image_url, address
         ) VALUES ($1,$2,$3,'tenant',$4,$5,$6,true,true,$7,$8,$9::jsonb)
         RETURNING id`,
        [
          tenant.username,
          tenant.email,
          passwordHash,
          orgId,
          tenant.firstName,
          tenant.lastName,
          tenant.phone,
          image,
          JSON.stringify({
            street: property.address,
            city: "London",
            postalCode: "",
            country: "United Kingdom",
            formatted: property.address,
          }),
        ],
      );
      tenantIds.push(user.id);
      const assignment = await one<{ id: string }>(
        client,
        `INSERT INTO tenant_assignments (
           organization_id, tenant_id, property_id, lease_start_date, lease_end_date,
           monthly_rent, deposit_amount, rent_due_day, is_active, has_portal_access,
           next_of_kin_name, next_of_kin_phone, next_of_kin_email, next_of_kin_relationship, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,1,true,true,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          orgId,
          user.id,
          propertyIds[tenant.propertyIndex],
          atNoon(leaseStart),
          atNoon(leaseEnd),
          (tenant.shareMinor / 100).toFixed(2),
          (tenant.shareMinor / 100).toFixed(2),
          tenant.nokName,
          tenant.nokPhone,
          tenant.nokEmail,
          tenant.nokRelationship,
          `Joint tenancy. This share plus the other occupant equals the property rent of £${(property.rentMinor / 100).toFixed(2)}.\n${BATCH}`,
        ],
      );
      assignmentIds.push(assignment.id);
    }

    console.log(`Inserted ${propertyIds.length} properties, ${tenantIds.length} tenants, ${assets} assets, ${contacts.length} contacts.`);
    console.log("Writing rent ledger…");

    for (let t = 0; t < tenants.length; t++) {
      const tenant = tenants[t];
      const property = properties[tenant.propertyIndex];
      await client.query(
        `INSERT INTO property_deposits (
           organization_id, property_id, tenant_assignment_id, amount, currency,
           received_date, payment_method, status, notes, created_by
         ) VALUES ($1,$2,$3,$4,'GBP',$5,'bank transfer','held',$6,$7)`,
        [
          orgId,
          propertyIds[tenant.propertyIndex],
          assignmentIds[t],
          (tenant.shareMinor / 100).toFixed(2),
          atNoon(leaseStart),
          `Illustrative deposit record. No money was collected. ${BATCH}`,
          actorId,
        ],
      );
      const account = await one<{ id: string }>(
        client,
        `INSERT INTO rent_accounts (
           organization_id, tenancy_id, property_id, currency, jurisdiction, tenancy_type,
           payer_reference, status, timezone
         ) VALUES ($1,$2,$3,'GBP','england','assured_shorthold',$4,'active','Europe/London')
         RETURNING id`,
        [orgId, assignmentIds[t], propertyIds[tenant.propertyIndex], `RENT-${property.code}-${tenant.slot + 1}`],
      );
      const schedule = await one<{ id: string }>(
        client,
        `INSERT INTO rent_schedule_versions (
           organization_id, account_id, amount_minor, frequency, due_day, effective_from,
           proration_rule, status, approved_at, notes, idempotency_key
         ) VALUES ($1,$2,$3,'monthly',1,$4,'actual_days','approved',NOW(),$5,$6)
         RETURNING id`,
        [
          orgId,
          account.id,
          tenant.shareMinor,
          atNoon(leaseStart),
          `Tenant contribution. Property rent is the sum of both occupants. ${BATCH}`,
          `batch3602026:schedule:${tenant.email}`,
        ],
      );

      const chargeIds: string[] = [];
      const dues: string[] = [];
      for (let back = 11; back >= 0; back--) {
        const month = shiftMonth(asY, asM, -back);
        const start = ymd(month.y, month.m, 1);
        const end = ymd(month.y, month.m, monthEnd(month.y, month.m));
        const due = start;
        const status = due < asOf ? "overdue" : due === asOf ? "due" : "scheduled";
        const charge = await one<{ id: string }>(
          client,
          `INSERT INTO rent_charges (
             organization_id, account_id, schedule_version_id, period_start, period_end,
             due_date, amount_minor, allocated_minor, type, status, posted_at, effective_date,
             currency, idempotency_key, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,0,'rent',$8,NOW(),$6,'GBP',$9,$10)
           RETURNING id`,
          [
            orgId,
            account.id,
            schedule.id,
            atNoon(start),
            atNoon(end),
            atNoon(due),
            tenant.shareMinor,
            status,
            `batch3602026:charge:${tenant.email}:${start}`,
            actorId,
          ],
        );
        chargeIds.push(charge.id);
        dues.push(due);
        charges++;
      }

      const elapsed = dues
        .map((due, index) => ({ due, index }))
        .filter((row) => row.due <= asOf);
      const latestElapsed = elapsed.length ? elapsed[elapsed.length - 1].index : -1;
      let overdueMinor = 0;
      let oldestDue: string | null = null;
      for (const row of elapsed) {
        let payMinor = 0;
        let paidOn = row.due;
        if (tenant.profile === "on_time") {
          payMinor = tenant.shareMinor;
        } else if (tenant.profile === "late") {
          const occasional = row.index % 3 === 2;
          paidOn = occasional ? addDays(row.due, 8) : row.due;
          if (paidOn <= asOf) payMinor = tenant.shareMinor;
        } else if (tenant.profile === "partial") {
          payMinor = Math.floor((tenant.shareMinor * 60) / 100);
        } else if (row.index !== latestElapsed) {
          payMinor = tenant.shareMinor;
        }
        if (payMinor > 0) {
          const receipt = await one<{ id: string }>(
            client,
            `INSERT INTO rent_receipts (
               organization_id, account_id, amount_minor, allocated_minor, channel, reference,
               received_at, confirmed_at, status, allocation_state, currency, source,
               idempotency_key, notes, created_by
             ) VALUES ($1,$2,$3,$3,'manual',$4,$5,NOW(),'confirmed','allocated','GBP','recorded',$6,$7,$8)
             RETURNING id`,
            [
              orgId,
              account.id,
              payMinor,
              `RENT-${property.code}-${tenant.slot + 1}-${dues[row.index].slice(0, 7)}`,
              atNoon(paidOn),
              `batch3602026:receipt:${tenant.email}:${dues[row.index]}`,
              `Rent received.\n${BATCH}`,
              actorId,
            ],
          );
          await client.query(
            `INSERT INTO rent_allocations (organization_id, receipt_id, charge_id, amount_minor, effective_at, created_by)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [orgId, receipt.id, chargeIds[row.index], payMinor, atNoon(paidOn), actorId],
          );
          await client.query(
            `UPDATE rent_charges
             SET allocated_minor = $1,
                 status = CASE WHEN $1 >= amount_minor THEN 'paid' WHEN $1 > 0 THEN 'part_paid' ELSE status END,
                 updated_at = NOW()
             WHERE id = $2`,
            [payMinor, chargeIds[row.index]],
          );
          receipts++;
          receiptMinor += payMinor;
        }
        const unpaid = tenant.shareMinor - payMinor;
        if (unpaid > 0 && row.due < asOf) {
          overdueMinor += unpaid;
          if (!oldestDue) oldestDue = row.due;
        }
      }
      if (overdueMinor > 0 && oldestDue) {
        await client.query(
          `INSERT INTO arrears_cases (organization_id, account_id, status, overdue_minor, oldest_due_date, assigned_to)
           VALUES ($1,$2,'review_required',$3,$4,$5)`,
          [orgId, account.id, overdueMinor, atNoon(oldestDue), actorId],
        );
      }
    }

    let quoteCount = 0;
    const nextQuote = await one<{ n: number }>(
      client,
      `SELECT COALESCE(MAX(quote_number), 900000) AS n FROM maintenance_quotes WHERE organization_id = $1`,
      [orgId],
    );
    let quoteNumber = Number(nextQuote.n);
    for (const job of JOBS) {
      const property = properties[job.n - 1];
      const reporter = tenants.find((tenant) => tenant.propertyIndex === property.index && tenant.slot === 0);
      const reporterId = tenantIds[tenants.indexOf(reporter!)];
      const tradeIds = contactIdsByRole.get(job.trade) || contactIdsByRole.get("General maintenance") || [];
      const contractorId = tradeIds.length ? tradeIds[(job.n - 1) % tradeIds.length] : null;
      const vat = contacts.find((contact) => contact.role === job.trade)?.vat === true && job.quoteNet != null;
      const photo = photoFile("repair");
      const mrStatus = job.phase === "new" ? "open" : job.phase === "completed" ? "completed" : "in_progress";
      const request = await one<{ id: string }>(
        client,
        `INSERT INTO maintenance_requests (
           organization_id, property_id, reported_by, assigned_to, title, description,
           status, priority, photo_urls, source, verification_notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual',$10)
         RETURNING id`,
        [orgId, propertyIds[property.index], reporterId, actorId, job.title, job.detail, mrStatus, job.priority, [photo], BATCH],
      );
      await client.query(
        `INSERT INTO maintenance_request_messages (organization_id, maintenance_request_id, author_user_id, body)
         VALUES ($1,$2,$3,$4)`,
        [orgId, request.id, reporterId, job.detail],
      );

      if (job.phase === "new" || job.phase === "review") continue;

      const woStatus =
        job.phase === "completed" ? "completed" : job.phase === "urgent" ? "in_progress" : "assigned";
      const scheduled =
        job.phase === "scheduled"
          ? addDays(asOf, 7)
          : job.phase === "completed"
            ? addDays(asOf, -10)
            : null;
      const order = await one<{ id: string }>(
        client,
        `INSERT INTO work_orders (
           organization_id, maintenance_request_id, team_id, contractor_id, status,
           sla_due, scheduled_at, arrived_at, completed_at, cost_estimate, cost_actual,
           variation_notes, authorisation_status, customer_signature_json, customer_signed_at, created_by
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16
         ) RETURNING id`,
        [
          orgId,
          request.id,
          team.id,
          contractorId,
          woStatus,
          atNoon(addDays(asOf, job.priority === "urgent" ? 1 : 14)),
          scheduled ? atNoon(scheduled) : null,
          job.phase === "completed" ? atNoon(addDays(asOf, -10)) : null,
          job.phase === "completed" ? atNoon(addDays(asOf, -3)) : null,
          job.quoteNet != null ? job.quoteNet * 100 : null,
          job.phase === "completed" && job.quoteNet != null ? job.quoteNet * 100 : null,
          job.phase === "completed" ? `Resolved on the visit. ${job.detail}` : job.detail,
          job.quoteNet != null && job.phase !== "quote" ? "authorised" : job.phase === "quote" ? "quote_required" : "not_required",
          job.phase === "completed"
            ? JSON.stringify({
                image: "/demo-seed/signature.svg",
                signedByName: reporter ? `${reporter.firstName} ${reporter.lastName}` : "Tenant",
                signedAt: atNoon(addDays(asOf, -3)),
              })
            : null,
          job.phase === "completed" ? atNoon(addDays(asOf, -3)) : null,
          actorId,
        ],
      );
      await client.query(
        `INSERT INTO work_order_events (organization_id, work_order_id, event_type, actor_user_id, payload_json)
         VALUES ($1,$2,'created',$3,$4::jsonb)`,
        [orgId, order.id, actorId, JSON.stringify({ phase: job.phase, batch: BATCH })],
      );
      if (job.phase === "completed") {
        await client.query(
          `INSERT INTO work_logs (work_order_id, note, photos, time_spent_minutes)
           VALUES ($1,$2,$3,$4)`,
          [order.id, `Visit completed. ${job.detail}`, [photo], 60 + job.n],
        );
      }

      if (job.quoteNet == null) continue;
      quoteNumber += 1;
      const net = job.quoteNet * 100;
      const parts = [
        { name: "Labour", category: "labour", unit: "hour", amount: net - Math.round(net * 0.15) - Math.round(net * 0.25) },
        { name: "Materials", category: "material", unit: "flat_fee", amount: Math.round(net * 0.25) },
        { name: "Call-out", category: "overhead", unit: "visit", amount: Math.round(net * 0.15) },
      ];
      const accepted = job.phase !== "quote";
      let tax = 0;
      const lineTax = parts.map((part) => {
        const lineTaxMinor = vat ? Math.round((part.amount * 20) / 100) : 0;
        tax += lineTaxMinor;
        return lineTaxMinor;
      });
      const quote = await one<{ id: string }>(
        client,
        `INSERT INTO maintenance_quotes (
           organization_id, work_order_id, property_id, status, quote_number, quote_reference,
           version_number, quote_type, currency, recipient_contact_id, recipient_name, recipient_email,
           scope_description, engineer_notes, valid_until, subtotal_minor, tax_minor, total_minor,
           prepared_by_user_id, submitted_at, owner_decided_at, owner_decision, customer_decided_at,
           customer_decision, sent_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,1,'original','GBP',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$17
         ) RETURNING id`,
        [
          orgId,
          order.id,
          propertyIds[property.index],
          accepted ? "accepted" : "sent",
          quoteNumber,
          `Q-${pad(job.n)}`,
          landlordIds[property.index % landlordIds.length],
          `${contacts.filter((contact) => contact.role === "Landlord")[property.index % 12].firstName} ${contacts.filter((contact) => contact.role === "Landlord")[property.index % 12].lastName}`,
          contacts.filter((contact) => contact.role === "Landlord")[property.index % 12].email,
          job.detail,
          `Quotation for the reported repair.\n${BATCH}`,
          atNoon(addDays(asOf, 30)),
          net,
          tax,
          net + tax,
          actorId,
          atNoon(addDays(asOf, accepted ? -20 : -2)),
          accepted ? atNoon(addDays(asOf, -18)) : null,
          accepted ? "approved" : null,
          accepted ? atNoon(addDays(asOf, -14)) : null,
          accepted ? "accepted" : null,
        ],
      );
      for (let line = 0; line < parts.length; line++) {
        const part = parts[line];
        await client.query(
          `INSERT INTO maintenance_quote_lines (
             quote_id, sort_order, name, description, category, unit, quantity,
             unit_price_minor, vat_rate, line_net_minor, line_tax_minor, line_total_minor
           ) VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$7,$9,$10)`,
          [
            quote.id,
            line,
            part.name,
            `${part.name} for ${job.title}`,
            part.category,
            part.unit,
            part.amount,
            vat ? "standard_20" : "zero_rated",
            lineTax[line],
            part.amount + lineTax[line],
          ],
        );
      }
      if (accepted) {
        await client.query(
          `UPDATE work_orders
           SET approved_quote_id = $1, authorisation_status = 'authorised',
               authorised_total_minor = $2, cost_estimate = $2, updated_at = NOW()
           WHERE id = $3`,
          [quote.id, net + tax, order.id],
        );
      }
      quoteCount++;
    }

    if (extended) {
      const category = await one<{ id: string }>(
        client,
        `INSERT INTO communication_categories (
           organization_id, key, label, default_priority, approval_policy,
           notify_on_assign, escalate_overdue, sort_order
         ) VALUES ($1, 'portfolio', 'Portfolio', 'medium', 'none', false, false, 80)
         ON CONFLICT (organization_id, key)
         DO UPDATE SET notify_on_assign = false, escalate_overdue = false
         RETURNING id`,
        [orgId],
      );
      const subjects = [
        "Question about this month's rent",
        "Update on the repair visit",
        "Request to access the property",
      ];
      for (let i = 0; i < 150; i++) {
        const tenant = tenants[i % tenants.length];
        const created = await one<{ id: string }>(
          client,
          `INSERT INTO communication_cases (
             organization_id, reference, subject, category_id, status, priority, source,
             tenant_id, property_id, owner_user_id, summary, unread_for_staff, created_by_user_id
           ) VALUES ($1,$2,$3,$4,$5,'medium','tenant_portal',$6,$7,$8,$9,true,$8)
           RETURNING id`,
          [
            orgId,
            `C-${pad(i + 1, 4)}`,
            subjects[i % subjects.length],
            category.id,
            i % 5 === 0 ? "resolved" : "new",
            tenantIds[i % tenantIds.length],
            propertyIds[tenant.propertyIndex],
            actorId,
            `${subjects[i % subjects.length]}.\n${BATCH}`,
          ],
        );
        await client.query(
          `INSERT INTO communication_messages (
             organization_id, case_id, direction, visibility, channel, body,
             author_user_id, author_name_snapshot, delivery_status, received_at
           ) VALUES ($1,$2,'inbound','tenant','tenant_portal',$3,$4,$5,'not_applicable',$6)`,
          [
            orgId,
            created.id,
            subjects[i % subjects.length],
            tenantIds[i % tenantIds.length],
            `${tenant.firstName} ${tenant.lastName}`,
            atNoon(addDays(asOf, -((i % 40) + 1))),
          ],
        );
      }

      const sampleDocs = [
        "SAMPLE Gas Safety",
        "SAMPLE EICR",
        "SAMPLE EPC",
        "SAMPLE Fire alarm service",
        "SAMPLE Insurance schedule",
      ];
      for (let i = 0; i < properties.length; i++) {
        for (let d = 0; d < sampleDocs.length; d++) {
          const kind = (i + d) % 5;
          const status = kind === 0 ? "expired" : kind === 1 ? "expiring_soon" : "current";
          const expiry = kind === 0 ? addDays(asOf, -20) : kind === 1 ? addDays(asOf, 20) : addDays(asOf, 300);
          await client.query(
            `INSERT INTO compliance_documents (
               organization_id, property_id, document_type, document_url, expiry_date, status, uploaded_by
             ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [orgId, propertyIds[i], sampleDocs[d], "/demo-seed/sample-document.svg", atNoon(expiry), status, actorId],
          );
        }
      }

      const inspectionPlan = await insertScheduledInspections(client, {
        orgId,
        actorId,
        asOf,
        propertyIds,
        properties,
        tenantIds,
        blockIds: [...blockIds.values()],
      });
      const templateUse = [...inspectionPlan.used.entries()]
        .map(([name, count]) => `${name} (${count})`)
        .join(", ");
      console.log(
        `  Inspections scheduled: ${inspectionPlan.total} from ${inspectionPlan.templates} active templates.`,
      );
      if (templateUse) console.log(`  Templates used: ${templateUse}`);
    }

    const check = await one<{
      properties: string;
      tenants: string;
      charges: string;
      quotes: string;
      contacts: string;
      assets: string;
      unbalanced: string;
    }>(
      client,
      `SELECT
         (SELECT COUNT(*) FROM properties WHERE organization_id = $1 AND fixflo_property_id LIKE 'batch-3602026-%') AS properties,
         (SELECT COUNT(*) FROM tenant_assignments WHERE organization_id = $1 AND notes LIKE $2) AS tenants,
         (SELECT COUNT(*) FROM rent_charges c
            JOIN rent_accounts a ON a.id = c.account_id
            WHERE a.organization_id = $1 AND c.idempotency_key LIKE 'batch3602026:charge:%') AS charges,
         (SELECT COUNT(*) FROM maintenance_quotes WHERE organization_id = $1 AND engineer_notes LIKE $2) AS quotes,
         (SELECT COUNT(*) FROM contacts WHERE organization_id = $1 AND notes LIKE $2) AS contacts,
         (SELECT COUNT(*) FROM asset_inventory WHERE organization_id = $1 AND maintenance_notes LIKE $2) AS assets,
         (SELECT COUNT(*) FROM (
            SELECT p.id
            FROM properties p
            JOIN tenant_assignments ta ON ta.property_id = p.id AND ta.notes LIKE $2
            WHERE p.organization_id = $1 AND p.fixflo_property_id LIKE 'batch-3602026-%'
            GROUP BY p.id
            HAVING COUNT(ta.id) <> 2
               OR SUM(ta.monthly_rent) <> (
                 SELECT SUM(ta2.monthly_rent) FROM tenant_assignments ta2 WHERE ta2.property_id = p.id AND ta2.notes LIKE $2
               )
          ) bad) AS unbalanced`,
      [orgId, MARKER_LIKE],
    );

    const expectedAssets = assetCount();
    const problems: string[] = [];
    if (Number(check.properties) !== 50) problems.push(`properties ${check.properties}`);
    if (Number(check.tenants) !== 100) problems.push(`tenants ${check.tenants}`);
    if (Number(check.charges) !== 1200) problems.push(`charges ${check.charges}`);
    if (Number(check.quotes) !== 20) problems.push(`quotes ${check.quotes}`);
    if (Number(check.contacts) !== 60) problems.push(`contacts ${check.contacts}`);
    if (Number(check.assets) !== expectedAssets) problems.push(`assets ${check.assets}, expected ${expectedAssets}`);
    if (Number(check.unbalanced) !== 0) problems.push(`tenancies that are not a pair ${check.unbalanced}`);
    if (problems.length) {
      throw new Error(`Reconciliation failed: ${problems.join(", ")}`);
    }

    await client.query("COMMIT");
    console.log("\nWrote the demo batch.");
    console.log(`  Properties ${check.properties}, tenants ${check.tenants}, charges ${check.charges}, quotes ${check.quotes}, contacts ${check.contacts}, assets ${check.assets}.`);
    console.log(`  Receipts recorded: ${receipts}. Amount received: £${(receiptMinor / 100).toFixed(2)}.`);
    console.log(`  Charges inserted in this run: ${charges}. Quotes inserted: ${quoteCount}.`);
    console.log("  Tenant logins use password:", TENANT_PASSWORD);
    console.log("  Example tenant:", tenants[0].email);
    console.log("\nSchema notes:");
    console.log("  - Two occupants are two tenancy records whose rents add up to the property rent. There is no separate joint-agreement table.");
    console.log("  - Maintenance request status is open, in progress, or completed. Quote and schedule detail is on the work order and quotation.");
    console.log("  - Property, block, people and item photos are real image files under /demo-seed/photos.");
    console.log("  - Inspections are scheduled only. None are completed. Each one uses an organisation template.");
    console.log("  - Sample compliance files are marked SAMPLE and are not certificates.");
    if (!extended) {
      console.log("  - Communications, compliance files and inspections were skipped. Add --extended to include them.");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
