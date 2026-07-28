export type OperatingMode = "shutdown" | "startup" | "power" | "scram";
export type CoreField = "power" | "fuelTemperature" | "voidFraction" | "xenon" | "rodInsertion";
export type RodBankTuple = [number, number, number, number];

export interface ControlInput {
  rodTarget: number;
  rodBankTargets: RodBankTuple;
  coolantFlowTarget: number;
  feedwaterTarget: number;
  turbineValveTarget: number;
  bypassValveTarget: number;
  mainCirculationPumps: number;
  feedwaterPumps: number;
  separatorLevelTarget: number;
  generatorBreakerClosed: boolean;
  turbineTrip: boolean;
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
  bankIndex: 0 | 1 | 2 | 3;
  power: number;
  fuelTemperature: number;
  voidFraction: number;
  xenon: number;
  rodInsertion: number;
}

export interface PlantSystemSnapshot {
  mainCirculationPumps: number;
  feedwaterPumps: number;
  separatorLevelPercent: number;
  bypassValvePercent: number;
  condenserVacuumKPa: number;
  generatorBreakerClosed: boolean;
  gridFrequencyHz: number;
  generatorVoltageKV: number;
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
  rodBankPositions: RodBankTuple;
  rodBankSpreadPercent: number;
  coolantFlowPercent: number;
  coolantTemperatureC: number;
  fuelTemperatureC: number;
  steamPressureMPa: number;
  steamFlowKgS: number;
  voidFractionPercent: number;
  xenonPercent: number;
  turbineRpm: number;
  periodSeconds: number;
  systems: PlantSystemSnapshot;
  coreWidth: number;
  coreHeight: number;
  coreCells: CoreCellSnapshot[];
  corePeakFactor: number;
  corePeakChannelIndex: number;
  alarms: Alarm[];
}

export interface TrendPoint {
  time: number;
  power: number;
  pressure: number;
  temperature: number;
}
