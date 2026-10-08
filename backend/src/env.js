// 环境变量加载：读取 backend/.env（无第三方依赖）。
// 密钥绝不写进源码：.env 已被 .gitignore 排除。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ENV_PATH = path.join(__dirname, '..', '.env');

let loaded = false;

export function loadEnv(force = false) {
  if (loaded && !force) return;
  loaded = true;
  if (!fs.existsSync(ENV_PATH)) return;
  const text = fs.readFileSync(ENV_PATH, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

export function llmConfig() {
  return {
    base: (process.env.LLM_BASE_URL || '').trim(),
    key: (process.env.LLM_API_KEY || '').trim(),
    model: (process.env.LLM_MODEL || '').trim(),
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 20000),
  };
}

/** LLM 是否可用（三项齐全才算）。缺任一 → 走规则兜底。 */
export function llmAvailable() {
  const c = llmConfig();
  return !!(c.base && c.key && c.model);
}

export function llmStatus() {
  const c = llmConfig();
  return {
    available: llmAvailable(),
    base_url: c.base || null,
    model: c.model || null,
    has_key: !!c.key,
    env_file: fs.existsSync(ENV_PATH) ? ENV_PATH : null,
  };
}
