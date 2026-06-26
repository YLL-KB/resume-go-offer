import { TemplateComponentProps } from "../types";
import { TemplateClassic } from "@/components/resume/TemplateClassic";

/**
 * Classical single-column resume layout.
 *
 * Wraps the existing TemplateClassic component into the
 * template registry system so it can be selected by layout id.
 */
export function ClassicTemplate({ data }: TemplateComponentProps) {
  return <TemplateClassic data={data} />;
}
