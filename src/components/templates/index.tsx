"use client";

import { useEffect, useState, useMemo } from "react";
import type { ResumeData } from "@/lib/validators/resume.schema";
import {
  resolveTemplateLayout,
  getTemplateComponent,
} from "./registry";
import type { RegistryEntry } from "./registry";

interface ResumeTemplateComponentProps {
  data: ResumeData;
  /** Template UUID or built-in id */
  templateId?: string;
  /** Layout id directly (overrides templateId resolution) */
  layout?: string;
}

/**
 * Renders the right template component for the given templateId.
 *
 * All templates receive the same `ResumeData` structure.
 * The component is selected via the registry by layout id.
 *
 * Supports async resolution for uploaded templates (fetches
 * layout mapping from the templates API on first call).
 */
export function ResumeTemplateComponent({
  data,
  templateId,
  layout,
}: ResumeTemplateComponentProps) {
  const [resolvedComponent, setResolvedComponent] =
    useState<RegistryEntry["Component"] | null>(null);

  useEffect(() => {
    if (layout) {
      setResolvedComponent(() => getTemplateComponent(layout));
      return;
    }
    if (templateId) {
      resolveTemplateLayout(templateId).then((Component) => {
        setResolvedComponent(() => Component);
      });
    } else {
      setResolvedComponent(() => getTemplateComponent("classic"));
    }
  }, [layout, templateId]);

  const Component = resolvedComponent;

  if (!Component) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        加载模板中...
      </div>
    );
  }

  return <Component data={data} />;
}
