"use client";

import { useFieldArray } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, GraduationCap, Building2, FolderCode } from "lucide-react";
import { ResumeForm } from "@/hooks/use-resume-form";

export function ExperienceStep({ form }: { form: ResumeForm }) {
  const { register, control } = form;

  const educationFields = useFieldArray({ control, name: "education" });
  const workFields = useFieldArray({ control, name: "experience" });
  const projectFields = useFieldArray({ control, name: "projects" });

  return (
    <div className="space-y-10">
      {/* 教育经历 */}
      <Section
        title="教育经历"
        icon={<GraduationCap className="size-4" />}
        onAdd={() => educationFields.append({ school: "", degree: "", major: "", startDate: "", endDate: "", gpa: "" })}
      >
        {educationFields.fields.map((field, i) => (
          <Card key={field.id}>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">#{i + 1}</span>
                <Button variant="ghost" size="icon" onClick={() => educationFields.remove(i)}>
                  <Trash2 className="size-4 text-muted-foreground" />
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>学校</Label>
                  <Input {...register(`education.${i}.school`)} placeholder="北京大学" />
                </div>
                <div className="space-y-2">
                  <Label>学位</Label>
                  <Input {...register(`education.${i}.degree`)} placeholder="本科" />
                </div>
                <div className="space-y-2">
                  <Label>专业</Label>
                  <Input {...register(`education.${i}.major`)} placeholder="计算机科学与技术" />
                </div>
                <div className="space-y-2">
                  <Label>GPA</Label>
                  <Input {...register(`education.${i}.gpa`)} placeholder="3.8/4.0" />
                </div>
                <div className="space-y-2">
                  <Label>开始时间</Label>
                  <Input {...register(`education.${i}.startDate`)} placeholder="2020-09" />
                </div>
                <div className="space-y-2">
                  <Label>结束时间</Label>
                  <Input {...register(`education.${i}.endDate`)} placeholder="2024-06" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </Section>

      {/* 工作经历 */}
      <Section
        title="工作经历"
        icon={<Building2 className="size-4" />}
        onAdd={() => workFields.append({ company: "", title: "", startDate: "", endDate: "", description: "", highlights: [] })}
      >
        {workFields.fields.map((field, i) => (
          <Card key={field.id}>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">#{i + 1}</span>
                <Button variant="ghost" size="icon" onClick={() => workFields.remove(i)}>
                  <Trash2 className="size-4 text-muted-foreground" />
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>公司</Label>
                  <Input {...register(`experience.${i}.company`)} placeholder="字节跳动" />
                </div>
                <div className="space-y-2">
                  <Label>职位</Label>
                  <Input {...register(`experience.${i}.title`)} placeholder="前端开发工程师" />
                </div>
                <div className="space-y-2">
                  <Label>开始时间</Label>
                  <Input {...register(`experience.${i}.startDate`)} placeholder="2024-07" />
                </div>
                <div className="space-y-2">
                  <Label>结束时间</Label>
                  <Input {...register(`experience.${i}.endDate`)} placeholder="至今" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>工作描述</Label>
                <Textarea
                  {...register(`experience.${i}.description`)}
                  placeholder="描述你的工作内容和成果..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </Section>

      {/* 项目经验 */}
      <Section
        title="项目经验"
        icon={<FolderCode className="size-4" />}
        onAdd={() => projectFields.append({ name: "", description: "", url: "", techStack: "", highlights: [] })}
      >
        {projectFields.fields.map((field, i) => (
          <Card key={field.id}>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">#{i + 1}</span>
                <Button variant="ghost" size="icon" onClick={() => projectFields.remove(i)}>
                  <Trash2 className="size-4 text-muted-foreground" />
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>项目名称</Label>
                  <Input {...register(`projects.${i}.name`)} placeholder="Resume Go Offer" />
                </div>
                <div className="space-y-2">
                  <Label>项目链接</Label>
                  <Input {...register(`projects.${i}.url`)} placeholder="https://..." />
                </div>
              </div>
              <div className="space-y-2">
                <Label>技术栈</Label>
                <Input {...register(`projects.${i}.techStack`)} placeholder="React, TypeScript, Next.js" />
              </div>
              <div className="space-y-2">
                <Label>项目描述</Label>
                <Textarea
                  {...register(`projects.${i}.description`)}
                  placeholder="描述项目背景、你的角色和成果..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  onAdd,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2 font-semibold text-sm">
          {icon}
          {title}
        </h3>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="mr-1 size-3" />
          添加
        </Button>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
