// The cloud voice: an OpenAI speech clip for a line, and Whisper's word onsets
// for it. Needs the user's own API key.
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const MODEL = "gpt-4o-mini-tts";
const KEYCHAIN_SERVICE = "explaincast";
const KEY_STEPS = [
  "1. Create a key at https://platform.openai.com/api-keys (the account needs billing set up)",
  "2. In Terminal, run this and paste the key when it says Key: (nothing shows as you paste):",
  `     printf 'Key: '; read -rs k; echo; security add-generic-password -s ${KEYCHAIN_SERVICE} -a openai -U -w "$k"; unset k`,
  "   Or set OPENAI_API_KEY instead. Never paste the key into your coding agent's chat.",
  "   Step by step: https://github.com/gug007/explaincast#set-up-your-openai-key",
].map((l) => `      ${l}`).join("\n");

function hasKey() {
  if (process.env.OPENAI_API_KEY) return true;
  return spawnSync("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", "openai"], { stdio: "ignore" }).status === 0;
}

function apiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    return execFileSync("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", "openai", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // no key under this name
  }
  throw new Error(`no OpenAI API key found:\n${KEY_STEPS}`);
}

// A 401 is most often a key cut short when it was saved, so it says how to
// save it again; a 429 for quota is an account with no credit left.
async function apiError(label, res) {
  const body = await res.text();
  if (res.status === 429 && body.includes("insufficient_quota")) {
    return new Error(`${label}: the OpenAI account is out of credit (429). Add a payment method or credits at https://platform.openai.com/settings/organization/billing, then run again.\n      OpenAI said: ${body}`);
  }
  if (res.status !== 401) return new Error(`${label}: ${res.status} ${body}`);
  return new Error(`${label}: OpenAI refused the API key (401). Check it is the right key and save it again:\n${KEY_STEPS}\n      OpenAI said: ${body}`);
}

const TRIES = 3;
const RETRY_AFTER_MAX_MS = 30000;

// How long a rate-limited reply asks to wait, from its retry-after header.
function retryAfterMs(res) {
  const s = parseFloat(res.headers.get("retry-after"));
  return Number.isFinite(s) && s >= 0 ? Math.min(s * 1000, RETRY_AFTER_MAX_MS) : 0;
}

// A dropped connection, a 5xx or a rate limit (429) is tried again, a rate
// limit no sooner than its retry-after; anything else, an account out of
// credit included, is a real error. `waitMs` is the pause before attempt n+1.
async function post(url, init, label, { waitMs = (n) => 1500 * n } = {}) {
  for (let attempt = 1; ; attempt++) {
    let wait = waitMs(attempt);
    try {
      const res = await fetch(url, init);
      const limited = res.status === 429 && !(await res.clone().text()).includes("insufficient_quota");
      if ((res.status < 500 && !limited) || attempt === TRIES) return res;
      if (limited) wait = Math.max(wait, retryAfterMs(res));
      console.log(`${label}: ${res.status}${limited ? " (rate limited)" : ""}, trying again (${attempt}/${TRIES})`);
    } catch (e) {
      if (attempt === TRIES) throw e;
      console.log(`${label}: ${e.cause?.code || e.message}, trying again (${attempt}/${TRIES})`);
    }
    await new Promise((r) => setTimeout(r, wait));
  }
}

async function speak(text, { voice, style, label }) {
  const res = await post("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, voice, input: text, instructions: style, response_format: "wav" }),
  }, label);
  if (!res.ok) throw await apiError(label, res);
  return Buffer.from(await res.arrayBuffer());
}

async function transcribe(wav, { label }) {
  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("file", new Blob([fs.readFileSync(wav)], { type: "audio/wav" }), path.basename(wav));
  const res = await post("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  }, label);
  if (!res.ok) throw await apiError(label, res);
  return ((await res.json()).words || []).map((w) => ({ word: w.word, start: w.start, end: w.end }));
}

module.exports = {
  name: "openai",
  model: MODEL,
  voice: "marin",
  // Lines voiced at once: each is a speech call and a transcription call, well
  // under a paid account's per-minute limits.
  jobs: 4,
  styled: true,
  // The model sometimes swallows a short closing sentence, and says it right
  // when asked again.
  respeaks: true,
  speak,
  transcribe,
  post,
  hasKey,
  KEY_STEPS,
};
