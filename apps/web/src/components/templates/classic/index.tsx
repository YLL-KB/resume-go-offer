import { TemplateComponentProps } from "../types";
import { TemplateResume } from "@/components/resume/TemplateResume";

export function ClassicTemplate({ data }: TemplateComponentProps) {
  return <TemplateResume data={data} />;
}
