// templates.json をロードしてレジストリ化する。
// AE スキャン JSX が出力した templates/templates.json を最優先、
// 無ければ templates/templates.sample.json にフォールバック。
//
// docs/03_templates.md の「templates.json 契約」に準拠。

const SUPPORTED_VERSION = 1;
const VALID_SLOTS = ["entry", "hold", "exit", "design", "title"];

let _registry = null;
let _meta = { source: "none", path: null, scannedAt: null, sourceFile: null };

export function getTemplatesRegistry() {
  return _registry || { version: SUPPORTED_VERSION, templates: [] };
}

export function getTemplatesMeta() {
  return _meta;
}

// Promise 解決後、_registry と _meta がセットされる。
// 戻り値も同じ内容を返す。
export async function loadTemplatesRegistry() {
  const candidates = [
    { path: "../templates/templates.json",        source: "templates.json" },
    { path: "../templates/templates.sample.json", source: "templates.sample.json" },
  ];

  for (const { path, source } of candidates) {
    try {
      const res = await fetch(path);
      if (!res.ok) continue;
      const data = await res.json();
      const validated = validateRegistry(data);
      _registry = validated;
      _meta = {
        source,
        path,
        scannedAt: validated.scannedAt,
        sourceFile: validated.sourceFile,
      };
      console.log(`[templates] loaded ${validated.templates.length} entries from ${source}`);
      return { registry: _registry, meta: _meta };
    } catch (e) {
      console.warn(`[templates] ${path} failed:`, e.message);
    }
  }

  // どちらも読めなかった
  _registry = { version: SUPPORTED_VERSION, templates: [], scannedAt: null, sourceFile: null };
  _meta = { source: "none", path: null, scannedAt: null, sourceFile: null };
  console.warn("[templates] no registry available, dropdowns will be empty");
  return { registry: _registry, meta: _meta };
}

function validateRegistry(data) {
  if (!data || typeof data !== "object") throw new Error("not an object");
  if (data.version !== SUPPORTED_VERSION) {
    throw new Error(`unsupported version: ${data.version} (expected ${SUPPORTED_VERSION})`);
  }
  if (!Array.isArray(data.templates)) throw new Error("templates is not an array");

  const seen = new Set();
  const valid = [];
  for (const t of data.templates) {
    if (!t || typeof t !== "object") {
      console.warn("[templates] skipping non-object entry");
      continue;
    }
    if (!t.name || typeof t.name !== "string") {
      console.warn("[templates] skipping entry without name", t);
      continue;
    }
    if (!VALID_SLOTS.includes(t.slot)) {
      console.warn(`[templates] ${t.name}: invalid slot ${t.slot}`);
      continue;
    }
    if (seen.has(t.name)) {
      console.warn(`[templates] duplicate name: ${t.name}`);
      continue;
    }
    if (t.slot !== "design" && t.emphasisLayers) {
      console.warn(`[templates] ${t.name}: emphasisLayers on non-design slot, ignored`);
    }
    seen.add(t.name);
    valid.push({
      name: t.name,
      slot: t.slot,
      displayName: typeof t.displayName === "string" && t.displayName.length > 0
        ? t.displayName : t.name,
      duration: typeof t.duration === "number" ? t.duration : 0,
      tags: Array.isArray(t.tags) ? t.tags.slice() : [],
      emphasisLayers: (t.slot === "design" && Array.isArray(t.emphasisLayers))
        ? t.emphasisLayers.slice() : undefined,
      hasTarget: (t.slot === "title") ? !!t.hasTarget : undefined,
    });
  }

  return {
    version: data.version,
    scannedAt: data.scannedAt || null,
    sourceFile: data.sourceFile || null,
    templates: valid,
  };
}
