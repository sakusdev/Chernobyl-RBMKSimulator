import { SixGroupPointKinetics } from "./kinetics";
import { SpatialCoreModel } from "./spatial-core";
import type { Alarm, ControlInput, OperatingMode, ReactivityBreakdown, ReactorSnapshot } from "./types";

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const approach = (value: number, target: number, ratePerSecond: number, dt: number): number => {
  const delta = target - value;
  return value + clamp(delta, -ratePerSecond * dt, ratePerSecond * dt);
};

export class ReactorSimulation {
  private time = 0;
  private neutronPower = 0.0001;
  private thermalPower = 0.1;
  private electricPower = 0;
  private rodInsertion = 100;
  private coolantFlow = 35;
  private coolantTemperature = 265;
  private fuelTemperature = 290;
  private steamPressure = 2.1;
  private steamFlow = 0;
  private voidFraction = 0;
  private xenon = 18;
  private turbineRpm = 0;
  private periodSeconds = Number.POSITIVE_INFINITY;
  private mode: OperatingMode = "shutdown";
  private readonly kinetics = new SixGroupPointKinetics(0.0001);
  private readonly spatialCore = new SpatialCoreModel();
  private controls: ControlInput = {
    rodTarget: 100,
    coolantFlowTarget: 35,
    feedwaterTarget: 35,
    turbineValveTarget: 0,
    az5: false,
  };

  public setControls(next: Partial<ControlInput>): void {
    this.controls = {
      ...this.controls,
      ...next,
      rodTarget: clamp(next.rodTarget ?? this.controls.rodTarget, 0, 100),
      coolantFlowTarget: clamp(next.coolantFlowTarget ?? this.controls.coolantFlowTarget, 10, 110),
      feedwaterTarget: clamp(next.feedwaterTarget ?? this.controls.feedwaterTarget, 0, 110),
      turbineValveTarget: clamp(next.turbineValveTarget ?? this.controls.turbineValveTarget, 0, 100),
    };
  }

  public reset(): void {
    this.time = 0;
    this.neutronPower = 0.0001;
    this.thermalPower = 0.1;
    this.electricPower = 0;
    this.rodInsertion = 100;
    this.coolantFlow = 35;
    this.coolantTemperature = 265;
    this.fuelTemperature = 290;
    this.steamPressure = 2.1;
    this.steamFlow = 0;
    this.voidFraction = 0;
    this.xenon = 18;
    this.turbineRpm = 0;
    this.periodSeconds = Number.POSITIVE_INFINITY;
    this.mode = "shutdown";
    this.kinetics.reset(0.0001);
    this.spatialCore.reset();
    this.controls = { rodTarget: 100, coolantFlowTarget: 35, feedwaterTarget: 35, turbineValveTarget: 0, az5: false };
  }

  public step(dt: number): ReactorSnapshot {
    const safeDt = clamp(dt, 0.001, 0.1);
    this.time += safeDt;

    if (this.controls.az5) {
      this.controls.rodTarget = 100;
      this.mode = "scram";
    }

    this.rodInsertion = approach(this.rodInsertion, this.controls.rodTarget, this.controls.az5 ? 24 : 1.8, safeDt);
    this.coolantFlow = approach(this.coolantFlow, this.controls.coolantFlowTarget, 3.5, safeDt);

    const reactivity = this.calculateReactivity();
    const kinetics = this.kinetics.step(reactivity.total * 1e-5, safeDt, 1.8e-8);
    this.neutronPower = clamp(kinetics.neutronDensity, 0.00001, 180);
    this.periodSeconds = clamp(kinetics.periodSeconds, -9999, 9999);

    const targetThermal = this.neutronPower * 32;
    this.thermalPower = approach(this.thermalPower, targetThermal, 180 + targetThermal * 0.22, safeDt);
    const heatInput = this.thermalPower / 3200;
    const targetCoolantTemp = 255 + heatInput * 52 - (this.coolantFlow / 100) * 7 - (this.controls.feedwaterTarget / 100) * 2.5;
    this.coolantTemperature = approach(this.coolantTemperature, targetCoolantTemp, 5.2, safeDt);
    this.fuelTemperature = approach(this.fuelTemperature, this.coolantTemperature + 25 + heatInput * 510, 24, safeDt);

    const boilingDrive = clamp((this.coolantTemperature - 274) / 18, 0, 1.4);
    const flowSuppression = clamp(this.coolantFlow / 105, 0.1, 1.2);
    this.voidFraction = approach(this.voidFraction, clamp((boilingDrive * 58) / flowSuppression, 0, 85), 12, safeDt);

    this.steamFlow = clamp(this.thermalPower * 0.52 * (0.3 + this.voidFraction / 100), 0, 1900);
    const pressureTarget = 2 + clamp(this.steamFlow / 1750, 0, 1.2) * 5.1;
    this.steamPressure = approach(this.steamPressure, pressureTarget - (this.controls.turbineValveTarget / 100) * 0.65, 0.28, safeDt);
    const rpmTarget = clamp(this.steamFlow * (this.controls.turbineValveTarget / 100) * 2.15, 0, 3150);
    this.turbineRpm = approach(this.turbineRpm, rpmTarget, 95, safeDt);
    this.electricPower = clamp(this.steamFlow * 0.69 * clamp(this.turbineRpm / 3000, 0, 1), 0, 1100);

    const xenonProduction = clamp(this.neutronPower / 100, 0, 1.8) * 0.08;
    const xenonBurnoff = clamp(this.neutronPower / 100, 0, 2) * this.xenon * 0.0017;
    this.xenon = clamp(this.xenon + (xenonProduction - xenonBurnoff - 0.003) * safeDt, 0, 100);

    this.spatialCore.update({
      globalPowerPercent: this.neutronPower,
      averageFuelTemperatureC: this.fuelTemperature,
      averageVoidFractionPercent: this.voidFraction,
      averageXenonPercent: this.xenon,
      averageRodInsertionPercent: this.rodInsertion,
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
    return {
      time: this.time,
      mode: this.mode,
      thermalPowerMW: this.thermalPower,
      electricPowerMW: this.electricPower,
      neutronPowerPercent: this.neutronPower,
      reactivityPcm: reactivity.total,
      reactivity,
      rodInsertionPercent: this.rodInsertion,
      coolantFlowPercent: this.coolantFlow,
      coolantTemperatureC: this.coolantTemperature,
      fuelTemperatureC: this.fuelTemperature,
      steamPressureMPa: this.steamPressure,
      steamFlowKgS: this.steamFlow,
      voidFractionPercent: this.voidFraction,
      xenonPercent: this.xenon,
      turbineRpm: this.turbineRpm,
      periodSeconds: this.periodSeconds,
      coreWidth: this.spatialCore.width,
      coreHeight: this.spatialCore.height,
      coreCells: this.spatialCore.snapshot(),
      alarms: this.buildAlarms(),
    };
  }

  private buildAlarms(): Alarm[] {
    return [
      { id: "high-power", severity: "critical", message: "REACTOR POWER HIGH", active: this.neutronPower > 108 },
      { id: "short-period", severity: "critical", message: "REACTOR PERIOD SHORT", active: this.periodSeconds > 0 && this.periodSeconds < 10 },
      { id: "high-pressure", severity: "critical", message: "DRUM PRESSURE HIGH", active: this.steamPressure > 7.25 },
      { id: "low-flow", severity: "warning", message: "MAIN CIRCULATION FLOW LOW", active: this.coolantFlow < 28 && this.neutronPower > 8 },
      { id: "high-fuel-temp", severity: "warning", message: "FUEL TEMPERATURE HIGH", active: this.fuelTemperature > 760 },
      { id: "high-void", severity: "warning", message: "CORE VOID FRACTION HIGH", active: this.voidFraction > 55 },
      { id: "turbine-overspeed", severity: "critical", message: "TURBINE OVERSPEED", active: this.turbineRpm > 3060 },
      { id: "scram", severity: "info", message: "AZ-5 ACTIVE", active: this.mode === "scram" },
    ];
  }
}
