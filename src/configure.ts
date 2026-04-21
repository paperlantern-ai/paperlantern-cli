import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";

const SERVER_NAME = "paper-lantern";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function serverUrl(key: string) {
  return `https://mcp.paperlantern.ai/chat/mcp?key=${key}`;
}

function readJsonSafe(filePath: string): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
}

function readFileSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

function writeFileSafe(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, { mode: 0o600 });
}

// --- MCP config writers per format ---

/** JSON config with "mcpServers" key and { type: "url", url } entry (Claude Code, Cursor, Windsurf) */
function writeMcpServersUrl(configPath: string, key: string): string {
  const config = readJsonSafe(configPath);
  if (!config.mcpServers) config.mcpServers = {};
  const existing = config.mcpServers[SERVER_NAME];
  const desired = { type: "url", url: serverUrl(key) };
  if (existing && existing.type === desired.type && existing.url === desired.url) {
    return "already up to date";
  }
  const existed = SERVER_NAME in config.mcpServers;
  config.mcpServers[SERVER_NAME] = desired;
  writeFileSafe(configPath, JSON.stringify(config, null, 2) + "\n");
  return existed ? "reconfigured" : "configured";
}

/** JSON config with "servers" key and { type: "http", url } entry (VS Code / GitHub Copilot) */
function writeServersHttp(configPath: string, key: string): string {
  const config = readJsonSafe(configPath);
  if (!config.servers) config.servers = {};
  const existing = config.servers[SERVER_NAME];
  const desired = { type: "http", url: serverUrl(key) };
  if (existing && existing.type === desired.type && existing.url === desired.url) {
    return "already up to date";
  }
  const existed = SERVER_NAME in config.servers;
  config.servers[SERVER_NAME] = desired;
  writeFileSafe(configPath, JSON.stringify(config, null, 2) + "\n");
  return existed ? "reconfigured" : "configured";
}

/** JSON config with "mcpServers" key and bare { url } entry (Gemini CLI) */
function writeMcpServersBareUrl(configPath: string, key: string): string {
  const config = readJsonSafe(configPath);
  if (!config.mcpServers) config.mcpServers = {};
  const existing = config.mcpServers[SERVER_NAME];
  if (existing && existing.url === serverUrl(key)) {
    return "already up to date";
  }
  const existed = SERVER_NAME in config.mcpServers;
  config.mcpServers[SERVER_NAME] = { url: serverUrl(key) };
  writeFileSafe(configPath, JSON.stringify(config, null, 2) + "\n");
  return existed ? "reconfigured" : "configured";
}

/** TOML config with [mcp_servers.*] tables (Codex CLI) */
function writeCodexToml(configPath: string, key: string): string {
  const content = readFileSafe(configPath);
  const sectionHeader = `[mcp_servers.${SERVER_NAME}]`;
  const newSection = `${sectionHeader}\nurl = "${serverUrl(key)}"\n`;
  const existed = content.includes(sectionHeader);

  if (existed) {
    if (content.includes(`url = "${serverUrl(key)}"`)) {
      return "already up to date";
    }
    const updated = content.replace(
      new RegExp(`\\[mcp_servers\\.${SERVER_NAME}\\][\\s\\S]*?(?=\\n\\[|$)`),
      newSection,
    );
    writeFileSafe(configPath, updated);
    return "reconfigured";
  } else {
    writeFileSafe(configPath, content + (content.endsWith("\n") ? "" : "\n") + newSection);
    return "configured";
  }
}

/** Install a rule as a standalone file. Returns "installed", "updated", or "already up to date". */
function installRule(ruleSource: string, ruleDest: string): string {
  const sourceContent = fs.readFileSync(ruleSource, "utf-8");
  if (fs.existsSync(ruleDest)) {
    const destContent = fs.readFileSync(ruleDest, "utf-8");
    if (sourceContent === destContent) {
      return "already up to date";
    }
    fs.copyFileSync(ruleSource, ruleDest);
    return "updated";
  }
  fs.mkdirSync(path.dirname(ruleDest), { recursive: true });
  fs.copyFileSync(ruleSource, ruleDest);
  return "installed";
}

const PL_SECTION_START = "<!-- paper-lantern:start -->";
const PL_SECTION_END = "<!-- paper-lantern:end -->";

/** Append or update a Paper Lantern section in a shared markdown file (AGENTS.md, GEMINI.md). */
function installRuleSection(ruleSource: string, destFile: string): string {
  const ruleContent = fs.readFileSync(ruleSource, "utf-8");
  const section = `${PL_SECTION_START}\n${ruleContent}\n${PL_SECTION_END}`;

  const existing = readFileSafe(destFile);
  const existed = existing.includes(PL_SECTION_START);

  if (existed) {
    if (existing.includes(section)) {
      return "already up to date";
    }
    const updated = existing.replace(
      new RegExp(`${PL_SECTION_START}[\\s\\S]*?${PL_SECTION_END}`),
      section,
    );
    writeFileSafe(destFile, updated);
    return "updated";
  } else {
    const separator = existing && !existing.endsWith("\n\n") ? "\n\n" : existing.endsWith("\n") ? "\n" : "\n\n";
    writeFileSafe(destFile, existing + separator + section + "\n");
    return "installed";
  }
}

/** Check all known config files for an existing Paper Lantern key. */
export function findExistingKey(): string | null {
  const home = os.homedir();
  const candidates: { path: string; rootKey: string }[] = [
    { path: path.join(home, ".claude", "settings.json"), rootKey: "mcpServers" },
    { path: path.join(home, ".cursor", "mcp.json"), rootKey: "mcpServers" },
    { path: path.join(home, ".codeium", "windsurf", "mcp_config.json"), rootKey: "mcpServers" },
    { path: path.join(home, ".gemini", "settings.json"), rootKey: "mcpServers" },
  ];

  // JSON configs
  for (const { path: configPath, rootKey } of candidates) {
    const config = readJsonSafe(configPath);
    const entry = config[rootKey]?.[SERVER_NAME];
    if (entry?.url) {
      const match = entry.url.match(/[?&]key=(pl_[a-f0-9]+)/);
      if (match) return match[1];
    }
  }

  // VS Code (servers key)
  for (const vscodePath of vsCodeConfigPaths()) {
    const config = readJsonSafe(vscodePath);
    const entry = config.servers?.[SERVER_NAME];
    if (entry?.url) {
      const match = entry.url.match(/[?&]key=(pl_[a-f0-9]+)/);
      if (match) return match[1];
    }
  }

  // Cline (globalStorage under VS Code)
  for (const clinePath of clineConfigPaths()) {
    const config = readJsonSafe(clinePath);
    const entry = config.mcpServers?.[SERVER_NAME];
    if (entry?.url) {
      const match = entry.url.match(/[?&]key=(pl_[a-f0-9]+)/);
      if (match) return match[1];
    }
  }

  // Codex TOML
  const codexPath = path.join(home, ".codex", "config.toml");
  const toml = readFileSafe(codexPath);
  const tomlMatch = toml.match(/url\s*=\s*"[^"]*[?&]key=(pl_[a-f0-9]+)/);
  if (tomlMatch) return tomlMatch[1];

  return null;
}

function vsCodeConfigPaths(): string[] {
  const home = os.homedir();
  const platform = process.platform;
  if (platform === "darwin") {
    return [path.join(home, "Library", "Application Support", "Code", "User", "mcp.json")];
  } else if (platform === "win32") {
    return [path.join(home, "AppData", "Roaming", "Code", "User", "mcp.json")];
  }
  return [path.join(home, ".config", "Code", "User", "mcp.json")];
}

function clineConfigPaths(): string[] {
  const home = os.homedir();
  const platform = process.platform;
  const suffix = ["globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"];
  if (platform === "darwin") {
    return [path.join(home, "Library", "Application Support", "Code", "User", ...suffix)];
  } else if (platform === "win32") {
    return [path.join(home, "AppData", "Roaming", "Code", "User", ...suffix)];
  }
  return [path.join(home, ".config", "Code", "User", ...suffix)];
}

// --- Client definitions ---

interface ClientDef {
  name: string;
  configWriter: (key: string) => { action: string; configPath: string };
  rule?: { source: string; dest: string };
  ruleSection?: { source: string; dest: string };
  postInstall?: string;
}

function defineClients(): Record<string, ClientDef> {
  const home = os.homedir();
  const ruleDir = path.join(__dirname, "..", "rules");

  return {
    "claude-code": {
      name: "Claude Code",
      configWriter: (key) => ({
        action: writeMcpServersUrl(path.join(home, ".claude", "settings.json"), key),
        configPath: path.join(home, ".claude", "settings.json"),
      }),
      rule: {
        source: path.join(ruleDir, "common_rule.md"),
        dest: path.join(home, ".claude", "rules", "paper-lantern.md"),
      },
    },
    "cursor": {
      name: "Cursor",
      configWriter: (key) => ({
        action: writeMcpServersUrl(path.join(home, ".cursor", "mcp.json"), key),
        configPath: path.join(home, ".cursor", "mcp.json"),
      }),
      rule: {
        source: path.join(ruleDir, "cursor.mdc"),
        dest: path.join(home, ".cursor", "rules", "paper-lantern.mdc"),
      },
    },
    "windsurf": {
      name: "Windsurf",
      configWriter: (key) => ({
        action: writeMcpServersUrl(
          path.join(home, ".codeium", "windsurf", "mcp_config.json"), key,
        ),
        configPath: path.join(home, ".codeium", "windsurf", "mcp_config.json"),
      }),
      ruleSection: {
        source: path.join(ruleDir, "common_rule.md"),
        dest: path.join(home, ".codeium", "windsurf", "memories", "global_rules.md"),
      },
    },
    "copilot": {
      name: "GitHub Copilot (VS Code)",
      configWriter: (key) => {
        const configPath = vsCodeConfigPaths()[0];
        return { action: writeServersHttp(configPath, key), configPath };
      },
      rule: {
        source: path.join(ruleDir, "common_rule.md"),
        dest: path.join(home, ".copilot", "instructions", "paper-lantern.instructions.md"),
      },
      postInstall: "Enable in VS Code: Settings > chat.instructionsFilesLocations > set ~/.copilot/instructions to true",
    },
    "codex": {
      name: "Codex",
      configWriter: (key) => {
        const configPath = path.join(home, ".codex", "config.toml");
        return { action: writeCodexToml(configPath, key), configPath };
      },
      ruleSection: {
        source: path.join(ruleDir, "common_rule.md"),
        dest: path.join(home, ".codex", "AGENTS.md"),
      },
    },
    "gemini": {
      name: "Gemini CLI",
      configWriter: (key) => ({
        action: writeMcpServersBareUrl(path.join(home, ".gemini", "settings.json"), key),
        configPath: path.join(home, ".gemini", "settings.json"),
      }),
      ruleSection: {
        source: path.join(ruleDir, "common_rule.md"),
        dest: path.join(home, ".gemini", "GEMINI.md"),
      },
    },
    "cline": {
      name: "Cline",
      configWriter: (key) => {
        const configPath = clineConfigPaths()[0];
        return { action: writeMcpServersBareUrl(configPath, key), configPath };
      },
      postInstall: "Cline's custom instructions live in VS Code settings (`cline.customInstructions`). Paste the Paper Lantern activation rule from paperlantern.ai/docs into that field if you want the agent to follow it.",
    },
  };
}

// --- Public API ---

export interface ConfigResult {
  name: string;
  steps: { action: string; detail: string }[];
}

export function configureMcp(client: string, key: string): ConfigResult | null {
  const clients = defineClients();
  const def = clients[client];
  if (!def) return null;

  const steps: { action: string; detail: string }[] = [];

  const { action, configPath } = def.configWriter(key);
  const mcpLabel = action === "already up to date"
    ? "MCP server already up to date"
    : `MCP server ${action} with API Key`;
  steps.push({ action: mcpLabel, detail: configPath });

  // Claude Code: clean stale entry from ~/.claude.json (wrong file from older installs)
  if (client === "claude-code") {
    const legacyPath = path.join(os.homedir(), ".claude.json");
    if (removeMcpEntry(legacyPath, "mcpServers")) {
      steps.push({ action: "Removed stale entry from wrong file", detail: legacyPath });
    }
  }

  if (def.rule) {
    try {
      const ruleAction = installRule(def.rule.source, def.rule.dest);
      steps.push({ action: `Rule ${ruleAction}`, detail: def.rule.dest });
    } catch {
      // rule install is best-effort
    }
  }

  if (def.ruleSection) {
    try {
      const ruleAction = installRuleSection(def.ruleSection.source, def.ruleSection.dest);
      steps.push({ action: `Rule ${ruleAction}`, detail: def.ruleSection.dest });
    } catch {
      // rule install is best-effort
    }
  }

  if (def.postInstall) {
    steps.push({ action: "Note", detail: def.postInstall });
  }

  return { name: def.name, steps };
}

export function printManualInstructions(key: string) {
  console.log("\nAdd this to your MCP client config:\n");
  console.log(`  Server name: ${SERVER_NAME}`);
  console.log(`  URL: ${serverUrl(key)}`);
  console.log(`  Transport: Streamable HTTP\n`);
}

// --- Uninstall ---

/** Remove the paper-lantern entry from a JSON config with a given root key. */
function removeMcpEntry(configPath: string, rootKey: string): boolean {
  if (!fs.existsSync(configPath)) return false;
  const config = readJsonSafe(configPath);
  if (!config[rootKey]?.[SERVER_NAME]) return false;
  delete config[rootKey][SERVER_NAME];
  writeFileSafe(configPath, JSON.stringify(config, null, 2) + "\n");
  return true;
}

/** Remove the paper-lantern section from a TOML config. */
function removeCodexTomlEntry(configPath: string): boolean {
  if (!fs.existsSync(configPath)) return false;
  const content = readFileSafe(configPath);
  const sectionHeader = `[mcp_servers.${SERVER_NAME}]`;
  if (!content.includes(sectionHeader)) return false;
  const updated = content.replace(
    new RegExp(`\\n?\\[mcp_servers\\.${SERVER_NAME}\\][\\s\\S]*?(?=\\n\\[|$)`),
    "",
  );
  writeFileSafe(configPath, updated);
  return true;
}

/** Remove a standalone rule file. */
function removeRule(rulePath: string): boolean {
  if (!fs.existsSync(rulePath)) return false;
  fs.unlinkSync(rulePath);
  return true;
}

/** Remove the paper-lantern section from a shared markdown file. */
function removeRuleSection(destFile: string): boolean {
  if (!fs.existsSync(destFile)) return false;
  const content = readFileSafe(destFile);
  if (!content.includes(PL_SECTION_START)) return false;
  const updated = content
    .replace(new RegExp(`\\n*${PL_SECTION_START}[\\s\\S]*?${PL_SECTION_END}\\n?`), "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd() + "\n";
  // If file is now empty (or just whitespace), delete it
  if (updated.trim() === "") {
    fs.unlinkSync(destFile);
  } else {
    writeFileSafe(destFile, updated);
  }
  return true;
}

export interface UninstallResult {
  name: string;
  steps: string[];
}

export function unconfigureMcp(client: string): UninstallResult | null {
  const home = os.homedir();
  const clients = defineClients();
  const def = clients[client];
  if (!def) return null;

  const steps: string[] = [];

  // Remove MCP server entry
  if (client === "codex") {
    if (removeCodexTomlEntry(path.join(home, ".codex", "config.toml"))) {
      steps.push("Removed MCP server from ~/.codex/config.toml");
    }
  } else if (client === "copilot") {
    for (const p of vsCodeConfigPaths()) {
      if (removeMcpEntry(p, "servers")) {
        steps.push(`Removed MCP server from ${p}`);
      }
    }
  } else if (client === "cline") {
    for (const p of clineConfigPaths()) {
      if (removeMcpEntry(p, "mcpServers")) {
        steps.push(`Removed MCP server from ${p}`);
      }
    }
  } else {
    const configPaths: Record<string, string> = {
      "claude-code": path.join(home, ".claude", "settings.json"),
      "cursor": path.join(home, ".cursor", "mcp.json"),
      "windsurf": path.join(home, ".codeium", "windsurf", "mcp_config.json"),
      "gemini": path.join(home, ".gemini", "settings.json"),
    };
    const configPath = configPaths[client];
    if (configPath && removeMcpEntry(configPath, "mcpServers")) {
      steps.push(`Removed MCP server from ${configPath}`);
    }
  }

  // Claude Code: also clean stale entry from ~/.claude.json (wrong file from older installs)
  if (client === "claude-code") {
    const legacyPath = path.join(home, ".claude.json");
    if (removeMcpEntry(legacyPath, "mcpServers")) {
      steps.push("Removed stale entry from ~/.claude.json");
    }
  }

  // Remove rule file or section
  if (def.rule) {
    if (removeRule(def.rule.dest)) {
      steps.push(`Removed rule file ${def.rule.dest}`);
    }
  }
  if (def.ruleSection) {
    if (removeRuleSection(def.ruleSection.dest)) {
      steps.push(`Removed rule section from ${def.ruleSection.dest}`);
    }
  }

  return { name: def.name, steps };
}
