import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// --- Config ---
const BATCH_SIZE = 20;
const MODEL = "claude-sonnet-4-6";
const OUTPUT_PATH = resolve(repoRoot, "public", "data.json");
const DEFAULT_INPUT = resolve(repoRoot, "recs.txt");

const CATEGORIES = [
  "Restaurant",
  "Bar",
  "Coffee",
  "Outdoors",
  "Shopping",
  "Entertainment",
  "Art",
  "Music",
  "Nightlife",
  "Wellness",
  "Other",
];

const SYSTEM_PROMPT = `You are a Denver local expert. Given a list of Denver recommendations, return a JSON array where each element has these fields:

- "name": string — the proper name of the place
- "category": string — one of: ${CATEGORIES.join(", ")}
- "vibes": string[] — 2 to 4 short vibe tags (e.g. "chill", "date night", "trendy", "divey", "family-friendly", "craft cocktails", "live music", "rooftop", "hidden gem", "brunch spot")
- "neighborhood": string — the Denver neighborhood where it is located
- "address": string — your best guess at the street address
- "lat": number — approximate latitude
- "lng": number — approximate longitude
- "description": string — a fun one-liner description
- "priceRange": string — one of "$", "$$", "$$$", "$$$$"

Return ONLY a raw JSON array. No markdown fences, no commentary.`;

// --- Helpers ---

function readInputFile(path) {
  const raw = readFileSync(path, "utf-8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function loadExistingData() {
  if (!existsSync(OUTPUT_PATH)) return [];
  try {
    const raw = readFileSync(OUTPUT_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveData(items) {
  const dir = dirname(OUTPUT_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(items, null, 2) + "\n");
}

async function tagBatch(client, lines) {
  const userMessage = lines
    .map((line, i) => `${i + 1}. ${line}`)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Tag the following Denver recommendations:\n\n${userMessage}`,
      },
    ],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Strip markdown fences if present
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      throw new Error("Response is not a JSON array");
    }
    return parsed;
  } catch (err) {
    console.error("  Failed to parse API response:", err.message);
    console.error("  Raw response (first 500 chars):", text.slice(0, 500));
    return [];
  }
}

// --- Main ---

async function main() {
  const inputPath = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : DEFAULT_INPUT;

  if (!existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY environment variable is required.");
    process.exit(1);
  }

  const client = new Anthropic();

  const lines = readInputFile(inputPath);
  console.log(`Read ${lines.length} recommendations from ${inputPath}`);

  // Load existing data and build a set of known names (case-insensitive)
  const existing = loadExistingData();
  const existingNames = new Set(
    existing.map((item) => item.name.toLowerCase())
  );

  // Filter out items that already exist
  const newLines = lines.filter((line) => {
    // Use the first part before " - " as a rough name match
    const roughName = line.split(" - ")[0].trim().toLowerCase();
    return !existingNames.has(roughName);
  });

  if (newLines.length === 0) {
    console.log("All items already exist in data.json. Nothing to do.");
    return;
  }

  console.log(
    `${newLines.length} new items to process (${existing.length} already in data.json)`
  );

  const batches = chunk(newLines, BATCH_SIZE);
  const allNew = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(
      `Processing batch ${i + 1}/${batches.length} (${batch.length} items)...`
    );

    const results = await tagBatch(client, batch);
    allNew.push(...results);

    console.log(`  Got ${results.length} tagged items`);
  }

  // Merge: existing items + new items, dedup by name
  const merged = [...existing];
  const mergedNames = new Set(existingNames);

  for (const item of allNew) {
    const key = item.name.toLowerCase();
    if (!mergedNames.has(key)) {
      merged.push(item);
      mergedNames.add(key);
    }
  }

  saveData(merged);
  console.log(
    `\nDone! Wrote ${merged.length} total items to ${OUTPUT_PATH}`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
