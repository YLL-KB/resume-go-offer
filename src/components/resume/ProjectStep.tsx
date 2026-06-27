"use client";

import { useFieldArray, UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, FolderCode } from "lucide-react";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
}

export function ProjectStep({ form }: Props) {
  const { register, control } = form;
  const fields = useFieldArray({ control, name: "projects" });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-sm">
          <FolderCode className="size-4" />
          项目经验
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            fields.append({
              name: "",
              description: "",
              url: "",
              techStack: "",
              highlights: [],
            })
          }
        >
          <Plus className="mr-1 size-3" />
          添加
        </Button>
      </div>

      {fields.fields.length === 0 && (
        <p className="text-sm text-muted-foreground">还没有项目经验，点击「添加」开始填写。</p>
      )}

      <div className="space-y-4">
        {fields.fields.map((field, i) => (
          <Card key={field.id}>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">#{i + 1}</span>
                <Button variant="ghost" size="icon" onClick={() => fields.remove(i)}>
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
      </div>
    </div>
  );
}
