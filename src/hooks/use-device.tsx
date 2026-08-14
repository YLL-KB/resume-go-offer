"use client";

import { createContext, useContext, useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;

interface DeviceContextValue {
  isMobile: boolean;
}

const DeviceContext = createContext<DeviceContextValue>({ isMobile: false });

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <DeviceContext.Provider value={{ isMobile }}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useIsMobile() {
  return useContext(DeviceContext).isMobile;
}
