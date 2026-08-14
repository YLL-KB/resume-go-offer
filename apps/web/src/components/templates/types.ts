import type { ResumeData } from "@/lib/validators/resume.schema";

/**
 * Template configuration — describes one template's metadata + layout type.
 */
export interface TemplateConfig {
  /** Unique template id (UUID for uploaded, slug for built-in) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Layout identifier — used as lookup key in the registry */
  layout: string;
  /** Optional description */
  description?: string;
  /** Whether this is a built-in template (vs user-uploaded) */
  builtIn?: boolean;
  /** Color scheme hints (preview only, templates use own styles) */
  colorScheme?: {
    primary?: string;
    background?: string;
    text?: string;
  };
}

/**
 * Props every template component receives.
 */
export interface TemplateComponentProps {
  data: ResumeData;
}
