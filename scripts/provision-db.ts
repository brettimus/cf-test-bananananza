/**
 * NOTE - This script does not support multiple environments (dev D1, staging D1, prod D1)
 *        For now, it will only work with a single D1 database per account.
 */

import Cloudflare from 'cloudflare';
import { readFileSync, writeFileSync } from "node:fs";
import path, { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiKey = process.env.CLOUDFLARE_API_KEY;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!apiKey) {
  throw new Error("CLOUDFLARE_API_KEY is not set");
}

if (!accountId) {
  throw new Error("CLOUDFLARE_ACCOUNT_ID is not set");
}

const cloudflare = new Cloudflare({ apiToken: apiKey });

const wranglerToml = readWranglerToml();

const databaseName = wranglerToml.content.match(/database_name = "(.*)"/)?.[1];
const databaseId = wranglerToml.content.match(/database_id = "(.*)"/)?.[1];

if (!databaseName) {
  throw new Error("D1 database_name not found in wrangler.toml");
}

const database = await findOrCreateDatabase(accountId, databaseName);

if (!database?.uuid) {
  throw new Error("Database found but no uuid found. Cannot continue");
}

if (databaseId !== database.uuid) {
  console.warn(`Database ID in wrangler.toml (${databaseId}) does not match the result from Cloudflare API (${database.uuid})`);
}

updateWranglerTomlDatabaseId(wranglerToml.path, wranglerToml.content, database.uuid);

// === HELPERS === //

async function findOrCreateDatabase(account_id: string, name: string) {
  console.log("Looking for database with name:", name);

  const database = await findDatabase(account_id, name);

  if (database) {
    console.log("Database found:", database);
    return database;
  }

  console.log("Database not found, creating...");

  return createDatabase(account_id, name);
}

async function findDatabase(account_id: string, name: string) {
  const databaseListResponse = await cloudflare.d1.database.list({
    account_id,
    name,
  });

  return databaseListResponse.result[0];
}

async function createDatabase(account_id: string, name: string) {
  const newDatabase = await cloudflare.d1.database.create({
    account_id,
    name,
  });
  return newDatabase;
}

function readWranglerToml() {
  const wranglerTomlPath = resolve(__dirname, "../wrangler.toml");
  const wranglerToml = readFileSync(wranglerTomlPath, "utf-8");
  return {
    path: wranglerTomlPath,
    content: wranglerToml,
  };
}

async function updateWranglerTomlDatabaseId(path: string, content: string, databaseId: string) {
  const updatedWranglerToml = content.replace(
    /database_id = ".*"/,
    `database_id = "${databaseId}"`
  );
  writeFileSync(path, updatedWranglerToml);
}
