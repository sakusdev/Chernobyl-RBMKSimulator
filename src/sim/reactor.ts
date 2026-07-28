import { SixGroupPointKinetics } from "./kinetics";
import { SpatialCoreModel } from "./spatial-core";
import type { Alarm, ControlInput, OperatingMode, ReactivityBreakdown, ReactorSnapshot, RodBankTuple } from "./types";

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const approach = (value: number, target: number, ratePerSecond: number, dt: number): number => {
  const delta = target - value;
  return value + clamp(delta, -ratePerSecond * dt, ratePerSecond * dt);
};
const average = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const bankSpread = (values: readonly number[]): number => Math.max(...values) - Math.min(...values);
const normaliseBanks = (values: readonly number[] | undefined, fallback: RodBankTuple): RodBankTuple => {
  if (!values || values.length !== 4) return [...fallback] as RodBankTuple;
  return [
    clamp(values[0] ?? fallback[0], 0, 100),
    clamp(values[1] ?? fallback[1], 0, 100),
    clamp(values[2] ?? fallback[2], 0, 100),
    clamp(values[3] ?? fallback[3], 0, 100),
  ];
};

const defaultControls = (): ControlInput => ({
  rodTarget: 100,
  rodBankTargets: [100, 100, 100, 100],
  coolantFlowTarget: 35,
  feedwaterTarget: 35,
  turbineValveTarget: 0,
  bypassValveTarget: 0,
  mainCirculationPumps: 2,
  feedwaterPumps: 1,
  separatorLevelTarget: 50,
  generatorBreakerClosed: false,
  turbineTrip: false,
  az5: false,
});

export class ReactorSimulation {
  private time = 0;
  private neutronPower = 0.0001;
  private thermalPower = 0.1;
  private electricPower = 0;
  private rodInsertion = 100;
  private rodBankPositions: RodBankTuple = [100, 100, 100, 100];
  private coolantFlow = 35;
  private coolantTemperature = 265;
  private fuelTemperature = 290;
  private steamPressure = 2.1;
  private steamFlow = 0;
  private voidFraction = 0;
  private xenon = 18;
  private turbineRpm = 0;
  private periodSeconds = Number.POSITIVE_INFINITY;
  private separatorLevel = 50;
  private condenserVacuum = 72;
  private gridFrequency = 50;
  private generatorVoltage = 0;
  private mode: OperatingMode = "shutdown";
  private readonly kinetics = new SixGroupPointKinetics(0.0001);
  private readonly spatialCore = new SpatialCoreModel();
  private controls: ControlInput = defaultControls();

  public setControls(next: Partial<ControlInput>): void {
    const explicitBanks = next.rodBankTargets;
    const masterTarget = clamp(next.rodTarget ?? this.controls.rodTarget, 0, 100);
    const bankTargets = explicitBanks
      ? normaliseBanks(explicitBanks, this.controls.rodBankTargets)
      : next.rodTarget !== undefined
        ? [masterTarget, masterTarget, masterTarget, masterTarget] as RodBankTuple
        : [...this.controls.rodBankTargets] as RodBankTuple;

    this.controls = {
      ...this.controls,
      ...next,
      rodTarget: explicitBanks ? average(bankTargets) : masterTarget,
      rodBankTargets: bankTargets,
      coolantFlowTarget: clamp(next.coolantFlowTarget ?? this.controls.coolantFlowTarget, 10, 110),
      feedwaterTarget: clamp(next.feedwaterTarget ?? this.controls.feedwaterTarget, 0, 110),
      turbineValveTarget: clamp(next.turbineValveTarget ?? this.controls.turbineValveTarget, 0, 100),
      bypassValveTarget: clamp(next.bypassValveTarget ?? this.controls.bypassValveTarget, 0, 100),
      mainCirculationPumps: Math.round(clamp(next.mainCirculationPumps ?? this.controls.mainCirculationPumps, 0, 8)),
      feedwaterPumps: Math.round(clamp(next.feedwaterPumps ?? this.controls.feedwaterPumps, 0, 3)),
      separatorLevelTarget: clamp(next.separatorLevelTarget ?? this.controls.separatorLevelTarget, 20, 80),
    };
  }

  public reset(): void {
    this.time = 0;
    this.neutronPower = 0.0001;
    this.thermalPower = 0.1;
    this.electricPower = 0;
    this.rodInsertion = 100;
    this.rodBankPositions = [100, 100, 100, 100];
    this.coolantFlow = 35;
    this.coolantTemperature = 265;
    this.fuelTemperature = 290;
    this.steamPressure = 2.1;
    this.steamFlow = 0;
    this.voidFraction = 0;
    this.xenon = 18;
    this.turbineRpm = 0;
    this.periodSeconds = Number.POSITIVE_INFINITY;
    this.separatorLevel = 50;
    this.condenserVacuum = 72;
    this.gridFrequency = 50;
    this.generatorVoltage = 0;
    this.mode = "shutdown";
    this.kinetics.reset(0.0001);
    this.spatialCore.reset();
    this.controls = defaultControls();
  }

  public step(dt: number): ReactorSnapshot {
    const safeDt = clamp(dt, 0.001, 0.1);
    this.time += safeDt;

    if (this.controls.az5) {
      this.controls.rodTarget = 100;
      this.controls.rodBankTargets = [100, 100, 100, 100];
      this.mode = "scram";
    }
    if (this.controls.turbineTrip) {
      this.controls.turbineValveTarget = 0;
      this.controls.generatorBreakerClosed = false;
    }

    const rodRate = this.controls.az5 ? 24 : 1.8;
    this.rodBankPositions = this.rodBankPositions.map((position, index) => (
      approach(position, this.controls.rodBankTargets[index] ?? this.controls.rodTarget, rodRate, safeDt)
    )) as RodBankTuple;
    this.rodInsertion = average(this.rodBankPositions);

    const pumpFlow = this.controls.mainCirculationPumps * 12.5;
    const requestedFlow = Math.min(this.controls.coolantFlowTarget, pumpFlow + 10);
    this.coolantFlow = approach(this.coolantFlow, requestedFlow, 4.2, safeDt);

    const reactivity = this.calculateReactivity();
    const kinetics = this.kinetics.step(reactivity.total * 1e-5, safeDt, 1.8e-8);
    this.neutronPower = clamp(kinetics.neutronDensity, 0.00001, 180);
    this.periodSeconds = clamp(kinetics.periodSeconds, -9999, 9999);

    const targetThermal = this.neutronPower * 32;
    this.thermalPower = approach(this.thermalPower, targetThermal, 180 + targetThermal * 0.22, safeDt);
    const heatInput = this.thermalPower / 3200;
    const feedwaterCapacity = this.controls.feedwaterPumps * 38;
    const effectiveFeedwater = Math.min(this.controls.feedwaterTarget, feedwaterCapacity);
    const targetCoolantTemp = 255 + heatInput * 52 - (this.coolantFlow / 100) * 7 - (effectiveFeedwater / 100) * 2.5;
    this.coolantTemperature = approach(this.coolantTemperature, targetCoolantTemp, 5.2, safeDt);
    this.fuelTemperature = approach(this.fuelTemperature, this.coolantTemperature + 25 + heatInput * 510, 24, safeDt);

    const boilingDrive = clamp((this.coolantTemperature - 274) / 18, 0, 1.4);
    const flowSuppression = clamp(this.coolantFlow / 105, 0.1, 1.2);
    this.voidFraction = approach(this.voidFraction, clamp((boilingDrive * 58) / flowSuppression, 0, 85), 12, safeDt);

    this.steamFlow = clamp(this.thermalPower * 0.52 * (0.3 + this.voidFraction / 100), 0, 1900);
    const bypassRelief = this.controls.bypassValveTarget * 0.011;
    const pressureTarget = 2 + clamp(this.steamFlow / 1750, 0, 1.2) * 5.1;
    this.steamPressure = approach(this.steamPressure, pressureTarget - (this.controls.turbineValveTarget / 100) * 0.65 - bypassRelief, 0.34, safeDt);

    const levelBalance = (effectiveFeedwater - this.steamFlow / 17) * 0.012;
    this.separatorLevel = clamp(this.separatorLevel + levelBalance * safeDt + (this.controls.separatorLevelTarget - this.separatorLevel) * 0.02 * safeDt, 0, 100);

    const rpmTarget = clamp(this.steamFlow * (this.controls.turbineValveTarget / 100) * 2.15, 0, 3150);
    this.turbineRpm = approach(this.turbineRpm, rpmTarget, this.controls.turbineTrip ? 220 : 95, safeDt);
    this.condenserVacuum = approach(this.condenserVacuum, 92 - this.controls.bypassValveTarget * 0.17 - this.steamFlow / 120, 2.5, safeDt);
    this.generatorVoltage = approach(this.generatorVoltage, this.turbineRpm > 2850 ? 20 : 0, 5, safeDt);
    this.gridFrequency = this.controls.generatorBreakerClosed ? 50 : clamp(this.turbineRpm / 60, 0, 52.5);
    const generated = this.steamFlow * 0.69 * clamp(this.turbineRpm / 3000, 0, 1);
    this.electricPower = this.controls.generatorBreakerClosed ? clamp(generated, 0, 1100) : 0;

    const xenonProduction = clamp(this.neutronPower / 100, 0, 1.8) * 0.08;
    const xenonBurnoff = clamp(this.neutronPower / 100, 0, 2) * this.xenon * 0.0017;
    this.xenon = clamp(this.xenon + (xenonProduction - xenonBurnoff - 0.003) * safeDt, 0, 100);

    this.spatialCore.update({
      globalPowerPercent: this.neutronPower,
      averageFuelTemperatureC: this.fuelTemperature,
      averageVoidFractionPercent: this.voidFraction,
      averageXenonPercent: this.xenon,
      averageRodInsertionPercent: this.rodInsertion,
      rodBankInsertions: this.rodBankPositions,
      coolantFlowPercent: this.coolantFlow,
    }, safeDt);

    if (this.controls.az5 && this.neutronPower < 0.08) {
      this.mode = "shutdown";
      this.controls.az5 = false;
    } else if (!this.controls.az5) {
      this.mode = this.neutronPower < 0.2 ? "startup" : "power";
    }

    return this.snapshot(reactivity);
  }

  public getSnapshot(): ReactorSnapshot {
    return this.snapshot(this.calculateReactivity());
  }

  private calculateReactivity(): ReactivityBreakdown {
    const breakdown: ReactivityBreakdown = {
      shutdown: -520,
      rods: (64 - this.rodInsertion) * 17,
      voids: Math.max(0, this.voidFraction - 4) * 9.5,
      fuelTemperature: -(this.fuelTemperature - 300) * 1.7,
      xenon: -(this.xenon - 15) * 7.5,
      total: 0,
    };
    breakdown.total = breakdown.shutdown + breakdown.rods + breakdown.voids + breakdown.fuelTemperature + breakdown.xenon;
    return breakdown;
  }

  private snapshot(reactivity: ReactivityBreakdown): ReactorSnapshot {
    const diagnostics = this.spatialCore.getDiagnostics();
    return {
      time: this.time,
      mode: this.mode,
      thermalPowerMW: this.thermalPower,
      electricPowerMW: this.electricPower,
      neutronPowerPercent: this.neutronPower,
      reactivityPcm: reactivity.total,
      reactivity,
      rodInsertionPercent: this.rodInsertion,
      rodBankPositions: [...this.rodBankPositions] as RodBankTuple,
      rodBankSpreadPercent: bankSpread(this.rodBankPositions),
      coolantFlowPercent: this.coolantFlow,
      coolantTemperatureC: this.coolantTemperature,
      fuelTemperatureC: this.fuelTemperature,
      steamPressureMPa: this.steamPressure,
      steamFlowKgS: this.steamFlow,
      voidFractionPercent: this.voidFraction,
      xenonPercent: this.xenon,
      turbineRpm: this.turbineRpm,
      periodSeconds: this.periodSeconds,
      systems: {
        mainCirculationPumps: this.controls.mainCirculationPumps,
        feedwaterPumps: this.controls.feedwaterPumps,
        separatorLevelPercent: this.separatorLevel,
        bypassValvePercent: this.controls.bypassValveTarget,
        condenserVacuumKPa: this.condenserVacuum,
        generatorBreakerClosed: this.controls.generatorBreakerClosed,
        gridFrequencyHz: this.gridFrequency,
        generatorVoltageKV: this.generatorVoltage,
      },
      coreWidth: this.spatialCore.width,
      coreHeight: this.spatialCore.height,
      coreCells: this.spatialCore.snapshot(),
      corePeakFactor: diagnostics.peakFactor,
      corePeakChannelIndex: diagnostics.peakChannelIndex,
      alarms: this.buildAlarms(),
    };
  }

  private buildAlarms(): Alarm[] {
    const diagnostics = this.spatialCore.getDiagnostics();
    const spread = bankSpread(this.rodBankPositions);
    return [
      { id: "high-power", severity: "critical", message: "МОЩНОСТЬ РЕАКТОРА ВЫСОКА", active: this.neutronPower > 108 },
      { id: "short-period", severity: "critical", message: "МАЛЫЙ ПЕРИОД РЕАКТОРА", active: this.periodSeconds > 0 && this.periodSeconds < 10 },
      { id: "high-pressure", severity: "critical", message: "ДАВЛЕНИЕ БС ВЫСОКО", active: this.steamPressure > 7.25 },
      { id: "low-flow", severity: "warning", message: "РАСХОД ГЦК НИЗКИЙ", active: this.coolantFlow < 28 && this.neutronPower > 8 },
      { id: "low-level", severity: "critical", message: "УРОВЕНЬ БС НИЗКИЙ", active: this.separatorLevel < 25 },
      { id: "high-level", severity: "warning", message: "УРОВЕНЬ БС ВЫСОКИЙ", active: this.separatorLevel > 75 },
      { id: "high-fuel-temp", severity: "warning", message: "ТЕМПЕРАТУРА ТОПЛИВА ВЫСОКА", active: this.fuelTemperature > 760 },
      { id: "high-void", severity: "warning", message: "ПАРОСОДЕРЖАНИЕ ВЫСОКО", active: this.voidFraction > 55 },
      { id: "rod-bank-deviation", severity: spread > 22 ? "critical" : "warning", message: "制御棒バンク偏差大", active: spread > 12 },
      { id: "local-power-peak", severity: diagnostics.peakFactor > 1.72 ? "critical" : "warning", message: "局所出力ピーク高", active: this.neutronPower > 8 && diagnostics.peakFactor > 1.48 },
      { id: "turbine-overspeed", severity: "critical", message: "РАЗГОН ТУРБИНЫ", active: this.turbineRpm > 3060 },
      { id: "low-vacuum", severity: "warning", message: "ВАКУУМ КОНДЕНСАТОРА НИЗКИЙ", active: this.condenserVacuum < 55 && this.turbineRpm > 500 },
      { id: "generator-unsynchronised", severity: "warning", message: "ГЕНЕРАТОР НЕ СИНХРОНИЗИРОВАН", active: this.controls.generatorBreakerClosed && Math.abs(this.gridFrequency - 50) > 0.25 },
      { id: "scram", severity: "info", message: "АЗ-5 ВВЕДЕНА", active: this.mode === "scram" },
    ];
  }
}
