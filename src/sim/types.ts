export type OperatingMode = "shutdown" | "startup" | "power" | "scram";
export type CoreField = "power" | "fuelTemperature" | "voidFraction" | "xenon" | "rodInsertion";

export interface ControlInput {
  rodTarget: number;
  coolantFlowTarget: number;
  feedwaterTarget: number;
  turbineValveTarget: number;
  az5: boolean;
}

export interface Alarm {
  id: string;
  severity: "info" | "warning" | "critical";
  message: string;
  active: boolean;
}

export interface ReactivityBreakdown {
  shutdown: number;
  rods: number;
  voids: number;
  fuelTemperature: number;
  xenon: number;
  total: number;
}

export interface CoreCellSnapshot {
  index: number;
  x: number;
  y: number;
  active: boolean;
  power: number;
  fuelTemperature: number;
  voidFraction: number;
  xenon: number;
  rodInsertion: number;
}

export interface ReactorSnapshot {
  time: number;
  mode: OperatingMode;
  thermalPowerMW: number;
  electricPowerMW: number;
  neutronPowerPercent: number;
  reactivityPcm: number;
  reactivity: ReactivityBreakdown;
  rodInsertionPercent: number;
  coolantFlowPercent: number;
  coolantTemperatureC: number;
  fuelTemperatureC: number;
  steamPressureMPa: number;
  steamFlowKgS: number;
  voidFractionPercent: number;
  xenonPercent: number;
  turbineRpm: number;
  periodSeconds: number;
  coreWidth: number;
  coreHeight: number;
  coreCells: CoreCellSnapshot[];
  alarms: Alarm[];
}

export interface TrendPoint {
  time: number;
  power: number;
  pressure: number;
  temperature: number;
}
