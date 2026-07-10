// config.js
// Merges the library's default config with per-instance overrides. Every
// field is independently overridable; unspecified fields fall back to
// defaultConfig.json.
import defaultConfig from "./defaultConfig.json" with { type: "json" };

export function resolveConfig(overrides = {}) {
  const merged = { ...defaultConfig };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

export { defaultConfig };