import { createContext, useContext, type ReactNode } from "react";
import { useSchedule, type ScheduleState } from "./useSchedule";

const ScheduleContext = createContext<ScheduleState | null>(null);

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const value = useSchedule();
  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useScheduleContext(): ScheduleState {
  const value = useContext(ScheduleContext);
  if (!value) throw new Error("useScheduleContext must be used inside ScheduleProvider");
  return value;
}