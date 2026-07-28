export type OperatingMode = "shutdown" | "startup" | "power" | "scram";

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

export interface ReactorSnapshot {
  time: number;
  mode: OperatingMode;
  thermalPowerMW: number;
  electricPowerMW: number;
  neutronPowerPercent: number;
  reactivityPcm: number;
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
  alarms: Alarm[];
}

export interface TrendPoint {
  time: number;
  power: number;
  pressure: number;
  temperature: number;
}
