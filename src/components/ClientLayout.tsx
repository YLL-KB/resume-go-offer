"use client";

import { DeviceProvider } from "@/hooks/use-device";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return <DeviceProvider>{children}</DeviceProvider>;
}
