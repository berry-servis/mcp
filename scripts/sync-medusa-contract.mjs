#!/usr/bin/env node
// Sync the generated Medusa contract types from the backend repo into this app.
//
// Source of truth: backend/openapi.yaml -> backend/contract/* (regenerated there
// with `npm run gen:contract`). This copies those generated files into
// src/contract/ so office can import shared types without a registry/published
// package. Run it whenever the backend contract changes.
//
//   node scripts/sync-medusa-contract.mjs
//
// By default it expects the backend repo checked out next to this one
// (../backend). Override with BACKEND_CONTRACT_DIR=/abs/path/to/backend/contract.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { execSync } from "node:child_process"
import { dirname, resolve, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, "..")
const backendContractDir =
  process.env.BACKEND_CONTRACT_DIR ?? resolve(appRoot, "..", "backend", "contract")
const destDir = join(appRoot, "src", "contract")
const HEADER =
  "// GENERATED from backend/openapi.yaml — do not edit. Re-sync with: node scripts/sync-medusa-contract.mjs"
const FILES = ["index.ts", "medusa-contract.d.ts"]

if (!existsSync(backendContractDir)) {
  console.error(
    `backend contract dir not found: ${backendContractDir}\n` +
      `Check out the backend repo next to this one, or set BACKEND_CONTRACT_DIR.`
  )
  process.exit(1)
}

mkdirSync(destDir, { recursive: true })
for (const file of FILES) {
  const src = join(backendContractDir, file)
  if (!existsSync(src)) {
    console.error(`missing source file: ${src} (run \`npm run gen:contract\` in backend first)`)
    process.exit(1)
  }
  writeFileSync(join(destDir, file), `${HEADER}\n${readFileSync(src, "utf8")}`)
  console.log(`synced src/contract/${file}`)
}

console.log("typechecking against the synced contract…")
execSync("npm run typecheck", { cwd: appRoot, stdio: "inherit" })
console.log("contract sync OK")
