#!/usr/bin/env node
import { checkbox, select } from "@inquirer/prompts";
import { createRequire } from "module";
import { authenticate, loadCachedKey } from "./auth.js";
import { configureMcp, findExistingKey, printManualInstructions, unconfigureMcp } from "./configure.js";

const require = createRequire(import.meta.url);
const { version: LOCAL_VERSION } = require("../package.json");

async function checkForUpdate() {
  try {
    const resp = await fetch("https://registry.npmjs.org/paperlantern/latest", {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return;
    const data = await resp.json();
    if (data.version && data.version !== LOCAL_VERSION) {
      console.log(`  Update available: ${LOCAL_VERSION} → ${data.version}`);
      console.log(`  Run: npx paperlantern@latest\n`);
    }
  } catch {
    // network error — skip silently
  }
}

const CLIENT_CHOICES = [
  { name: "Claude Code", value: "claude-code" },
  { name: "Cursor", value: "cursor" },
  { name: "Windsurf", value: "windsurf" },
  { name: "GitHub Copilot (VS Code)", value: "copilot" },
  { name: "Codex", value: "codex" },
  { name: "Gemini CLI", value: "gemini" },
];

async function uninstall() {
  console.log("\nPaper Lantern Uninstall\n");

  const clients = await checkbox({
    message: "Which agents do you want to uninstall from?",
    choices: CLIENT_CHOICES,
    required: true,
  });

  let anyRemoved = false;
  for (const client of clients) {
    const result = unconfigureMcp(client);
    if (result && result.steps.length > 0) {
      anyRemoved = true;
      console.log(`\n  ${result.name}`);
      for (const step of result.steps) {
        console.log(`    - ${step}`);
      }
    } else if (result) {
      console.log(`\n  ${result.name}: nothing to remove`);
    }
  }

  if (anyRemoved) {
    console.log("\nPaper Lantern has been removed from the selected agents.\n");
  } else {
    console.log("\nNo Paper Lantern configuration found in the selected agents.\n");
  }
}

async function install() {
  // Step 1: Which clients?
  const clients = await checkbox({
    message: "Which agents do you want to set up?",
    choices: [...CLIENT_CHOICES, { name: "Other (print config)", value: "other" }],
    required: true,
  });

  // Step 2: Check for existing credentials
  const cachedKey = loadCachedKey() || findExistingKey();
  let key: string;

  if (cachedKey) {
    console.log("Authenticated\n");
    key = cachedKey;
  } else {
    key = await authenticate();
  }

  // Step 3: Write config for each selected client
  const results: { name: string; steps: { action: string; detail: string }[] }[] = [];
  for (const client of clients) {
    if (client === "other") {
      printManualInstructions(key);
    } else {
      const result = configureMcp(client, key);
      if (result) results.push(result);
    }
  }

  // Summary
  console.log("\nPaper Lantern setup complete\n");
  for (const r of results) {
    console.log(`  ${r.name}`);
    for (const s of r.steps) {
      const prefix = s.action.includes("already up to date") ? "  " : "+ ";
      console.log(`    ${prefix}${s.action}`);
      console.log(`      ${s.detail}`);
    }
  }
}

async function main() {
  console.log("\nPaper Lantern Setup\n");
  await checkForUpdate();

  if (process.argv.includes("--uninstall")) {
    await uninstall();
  } else {
    await install();
  }
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
