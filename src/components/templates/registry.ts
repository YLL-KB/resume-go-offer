import type { TemplateConfig, TemplateComponentProps } from "./types";
import type { ReactNode } from "react";
import { classicConfig } from "./classic/config";
import { ClassicTemplate } from "./classic/index";

// ── Registry entry ──

export interface RegistryEntry {
  config: TemplateConfig;
  Component: (props: TemplateComponentProps) => ReactNode;
}

/**
 * Template registry.
 *
 * To add a new template:
 *   1. Create a directory under templates/ with config.ts + index.tsx
 *   2. Import the config and component here
 *   3. Add one entry to the REGISTRY array
 *
 * That's it — no other files need to change.
 */
const REGISTRY: RegistryEntry[] = [
  { config: classicConfig, Component: ClassicTemplate },
];

// ── Lookup helpers ──

const byLayout = new Map<string, RegistryEntry>();
for (const entry of REGISTRY) {
  byLayout.set(entry.config.layout, entry);
}

const defaultEntry = REGISTRY[0];

/**
 * Get a template component by layout id.
 * Falls back to the first registered template if the layout is unknown.
 */
export function getTemplateComponent(
  layout: string
): RegistryEntry["Component"] {
  return byLayout.get(layout)?.Component ?? defaultEntry.Component;
}

/**
 * Get template config by layout id.
 */
export function getTemplateConfig(layout: string): TemplateConfig {
  return byLayout.get(layout)?.config ?? defaultEntry.config;
}

/**
 * Get all registered template configs (for the template picker UI).
 */
export function getAllTemplateConfigs(): TemplateConfig[] {
  return Array.from(byLayout.values()).map((e) => e.config);
}

// Cache: template UUID → layout lookup (fetched once)
let layoutCache: Record<string, string> | null = null;
let layoutCachePromise: Promise<void> | null = null;

async function ensureLayoutCache() {
  if (layoutCache) return;
  if (layoutCachePromise) return layoutCachePromise;
  
  layoutCachePromise = (async () => {
    try {
      const res = await fetch("/api/templates");
      const list: { id: string; layout?: string }[] = await res.json();
      const cache: Record<string, string> = {};
      for (const t of list) {
        cache[t.id] = t.layout ?? "classic";
      }
      layoutCache = cache;
    } catch {
      layoutCache = {};
    }
  })();
  
  await layoutCachePromise;
}

/**
 * Resolve an uploaded template UUID or built-in id to a layout component.
 *
 * Fetches the template list once to discover the layout mapping.
 * Falls back to the default component when unknown.
 */
export async function resolveTemplateLayout(
  templateId: string
): Promise<RegistryEntry["Component"]> {
  // Built-in template ids
  const builtIn = byLayout.get(templateId);
  if (builtIn) return builtIn.Component;

  // Uploaded template — resolve via layout field
  await ensureLayoutCache();
  const layout = layoutCache?.[templateId] ?? "classic";
  return byLayout.get(layout)?.Component ?? defaultEntry.Component;
}
