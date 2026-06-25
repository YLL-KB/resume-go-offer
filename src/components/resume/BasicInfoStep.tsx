"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UseFormReturn } from "react-hook-form";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
}

export function BasicInfoStep({ form }: Props) {
  const { register, formState: { errors } } = form;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">姓名 *</Label>
          <Input id="name" {...register("basic.name")} placeholder="张三" />
          {(errors as any).basic?.name && (
            <p className="text-xs text-destructive">{(errors as any).basic?.name?.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">邮箱</Label>
          <Input id="email" {...register("basic.email")} placeholder="zhangsan@example.com" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">目标岗位</Label>
        <Input id="title" {...register("basic.title")} placeholder="前端开发工程师" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">手机</Label>
          <Input id="phone" {...register("basic.phone")} placeholder="13800138000" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">所在地</Label>
          <Input id="location" {...register("basic.location")} placeholder="北京" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="website">个人网站 / GitHub</Label>
        <Input id="website" {...register("basic.website")} placeholder="https://github.com/zhangsan" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="summary">个人总结</Label>
        <Textarea
          id="summary"
          {...register("summary")}
          placeholder="简要描述你的职业背景和核心竞争力（2-3句话）"
          rows={3}
        />
      </div>
    </div>
  );
}
