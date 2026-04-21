import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

const BASE = process.env.PAPERLANTERN_BASE_URL ?? "https://paperlantern.ai";
const DEVICE_CODE_URL = `${BASE}/api/auth/device`;
const DEVICE_TOKEN_URL = `${BASE}/api/auth/device/token`;
const CREDENTIALS_DIR = path.join(os.homedir(), ".paperlantern");
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, "credentials.json");

const MAX_SERVER_ERRORS = 3;

function openBrowser(url: string) {
  const platform = process.platform;
  try {
    if (platform === "darwin") execSync(`open "${url}"`);
    else if (platform === "win32") execSync(`start "" "${url}"`);
    else execSync(`xdg-open "${url}"`);
  } catch {
    // browser open failed — user will use the printed URL
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Load cached credentials from ~/.paperlantern/credentials.json */
export function loadCachedKey(): string | null {
  try {
    const data = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));
    if (data.key && typeof data.key === "string") return data.key;
  } catch {
    // no cached credentials
  }
  return null;
}

/** Save credentials to ~/.paperlantern/credentials.json (mode 600) */
function saveCredentials(key: string) {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    CREDENTIALS_FILE,
    JSON.stringify({ key }, null, 2) + "\n",
    { mode: 0o600 },
  );
}

/** Device code authentication flow (RFC 8628). */
export async function authenticate(): Promise<string> {
  // Step 1: Request a device code
  const codeResp = await fetch(DEVICE_CODE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!codeResp.ok) {
    const body = await codeResp.json().catch(() => ({}));
    throw new Error(body.error || `Failed to get device code (HTTP ${codeResp.status})`);
  }

  const codeData = await codeResp.json();
  const { device_code, user_code, verification_uri, expires_in, interval } = codeData;

  if (!user_code || !device_code) {
    throw new Error("Server did not return a device code");
  }

  // Step 2: Show code and open browser
  const activateUrl = verification_uri || `${BASE}/auth/device`;
  console.log(`Go to: ${activateUrl}`);
  console.log(`Enter code: ${user_code}\n`);
  openBrowser(activateUrl);

  // Step 3: Poll for completion
  let pollInterval = (interval || 5) * 1000;
  const deadline = Date.now() + (expires_in || 600) * 1000;
  let serverErrors = 0;

  while (Date.now() < deadline) {
    await sleep(pollInterval);

    let resp: Response;
    try {
      resp = await fetch(DEVICE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_code }),
      });
    } catch {
      // Network error — keep polling
      serverErrors++;
      if (serverErrors >= MAX_SERVER_ERRORS) {
        throw new Error("Too many network errors while polling. Please try again.");
      }
      continue;
    }

    const body = await resp.json().catch(() => ({}));

    // Success
    if (resp.ok && body.access_token) {
      console.log("Login successful!\n");
      saveCredentials(body.access_token);
      return body.access_token;
    }

    // Error handling per RFC 8628
    const error = body.error;

    if (error === "authorization_pending") {
      serverErrors = 0;
      continue;
    }

    if (error === "slow_down") {
      pollInterval += 5000;
      serverErrors = 0;
      continue;
    }

    if (error === "access_denied") {
      throw new Error("Access denied. Please try again.");
    }

    if (error === "expired_token") {
      throw new Error("Device code expired. Please try again.");
    }

    if (error === "invalid_request") {
      throw new Error("Invalid request. The code may have already been used.");
    }

    if (resp.status >= 500) {
      serverErrors++;
      if (serverErrors >= MAX_SERVER_ERRORS) {
        throw new Error("Server error. Please try again later.");
      }
      continue;
    }

    // Unknown error
    throw new Error(body.error || `Unexpected response (HTTP ${resp.status})`);
  }

  throw new Error("Login timed out. Please try again.");
}
