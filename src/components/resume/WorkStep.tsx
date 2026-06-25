"use client";

import { useFieldArray, UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Building2 } from "lucide-react";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
}

export function WorkStep({ form }: Props) {
  const { register, control } = form;
  const fields = useFieldArray({ control, name: "experience" });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-sm">
          <Building2 className="size-4" />
          工作经历
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            fields.append({
              company: "",
              title: "",
              startDate: "",
              endDate: "",
              description: "",
              highlights: [],
            })
          }
        >
          <Plus className="mr-1 size-3" />
          添加
        </Button>
      </div>

      {fields.fields.length === 0 && (
        <p className="text-sm text-muted-foreground">还没有工作经历，点击"添加"开始填写。</p>
      )}

      <div className="space-y-4">
        {fields.fields.map((field: any, i: number) => (
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
      </div>
    </div>
  );
}
