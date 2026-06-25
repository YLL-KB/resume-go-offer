"use client";

import { useFieldArray, UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, GraduationCap } from "lucide-react";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
}

export function EducationStep({ form }: Props) {
  const { register, control } = form;
  const fields = useFieldArray({ control, name: "education" });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-sm">
          <GraduationCap className="size-4" />
          教育经历
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            fields.append({
              school: "",
              degree: "",
              major: "",
              startDate: "",
              endDate: "",
              gpa: "",
            })
          }
        >
          <Plus className="mr-1 size-3" />
          添加
        </Button>
      </div>

      {fields.fields.length === 0 && (
        <p className="text-sm text-muted-foreground">还没有教育经历，点击"添加"开始填写。</p>
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
      </div>
    </div>
  );
}
