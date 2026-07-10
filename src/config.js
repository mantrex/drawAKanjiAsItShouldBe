// config.js
// Merges the library's default config with per-instance overrides. Every
// field is independently overridable; unspecified fields fall back to
// defaultConfig.json.
import defaultConfig from "./defaultConfig.json" with { type: "json" };

export function resolveConfig(overrides = {}) {
  return {
    ...defaultConfig,
    ...overrides,
  };
}

export { defaultConfig };