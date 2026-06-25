"use client";

import { useState } from "react";
import { useFieldArray, UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Tag } from "lucide-react";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
}

export function SkillsStep({ form }: Props) {
  const { control } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "skills" });
  const [input, setInput] = useState("");

  const addSkill = () => {
    const skill = input.trim();
    if (skill && !fields.map((f: any) => f.value ?? f).includes(skill)) {
      append(skill);
    }
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSkill();
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Tag className="size-4" />
        技能标签
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入技能后按回车添加，例如：React"
        />
        <Button variant="outline" size="icon" onClick={addSkill} disabled={!input.trim()}>
          <Plus className="size-4" />
        </Button>
      </div>

      {fields.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {fields.map((field: any, i: number) => (
            <Badge key={field.id} variant="secondary" className="gap-1 pr-1">
              {field.value ?? field}
              <button
                type="button"
                onClick={() => remove(i)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">还没有添加技能。输入后按回车或点击 + 添加。</p>
      )}
    </div>
  );
}
