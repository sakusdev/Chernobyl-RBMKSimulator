import type { CoreCellSnapshot, RodBankTuple } from "./types";

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

interface CoreInputs {
  globalPowerPercent: number;
  averageFuelTemperatureC: number;
  averageVoidFractionPercent: number;
  averageXenonPercent: number;
  averageRodInsertionPercent: number;
  rodBankInsertions: RodBankTuple;
  coolantFlowPercent: number;
}

export interface CoreDiagnostics {
  peakFactor: number;
  peakChannelIndex: number;
  maximumPowerPercent: number;
  averagePowerPercent: number;
}

export class SpatialCoreModel {
  public readonly width = 15;
  public readonly height = 15;
  private readonly cells: CoreCellSnapshot[];
  private diagnostics: CoreDiagnostics = {
    peakFactor: 1,
    peakChannelIndex: -1,
    maximumPowerPercent: 0,
    averagePowerPercent: 0,
  };

  constructor() {
    this.cells = [];
    const centerX = (this.width - 1) / 2;
    const centerY = (this.height - 1) / 2;

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const radius = Math.hypot(x - centerX, y - centerY);
        const active = radius <= 7.1;
        this.cells.push({
          index: y * this.width + x,
          x,
          y,
          active,
          bankIndex: this.bankIndexFor(x, y),
          power: 0,
          fuelTemperature: 280,
          voidFraction: 0,
          xenon: 18,
          rodInsertion: 100,
        });
      }
    }
  }

  public reset(): void {
    for (const cell of this.cells) {
      cell.power = 0;
      cell.fuelTemperature = 280;
      cell.voidFraction = 0;
      cell.xenon = 18;
      cell.rodInsertion = 100;
    }
    this.diagnostics = { peakFactor: 1, peakChannelIndex: -1, maximumPowerPercent: 0, averagePowerPercent: 0 };
  }

  public update(inputs: CoreInputs, dt: number): void {
    const centerX = (this.width - 1) / 2;
    const centerY = (this.height - 1) / 2;
    const flowFactor = clamp(inputs.coolantFlowPercent / 100, 0.1, 1.2);
    const rawWeights = new Map<number, number>();
    let rawWeightTotal = 0;
    let activeCount = 0;

    for (const cell of this.cells) {
      if (!cell.active) continue;
      const dx = cell.x - centerX;
      const dy = cell.y - centerY;
      const radius = Math.hypot(dx, dy);
      const radialShape = Math.max(0.06, 1 - (radius / 7.8) ** 1.75);
      const channelBias = 1 + Math.sin(cell.x * 1.61 + cell.y * 0.73) * 0.035;
      const axialProjectionBias = 1 + (centerY - cell.y) * 0.008;
      const bankInsertion = this.blendedBankInsertion(cell.x, cell.y, inputs.rodBankInsertions);
      const channelRodRipple = Math.sin(cell.x * 0.9) * Math.cos(cell.y * 0.7) * 1.8;
      const localRodInsertion = clamp(bankInsertion + channelRodRipple, 0, 100);
      const rodShape = clamp(Math.exp((inputs.averageRodInsertionPercent - localRodInsertion) / 31), 0.55, 1.75);
      const xenonBias = 1 + Math.sin(cell.x * 0.34 - cell.y * 0.48) * 0.045;
      const rawWeight = radialShape * channelBias * axialProjectionBias * rodShape * xenonBias;
      rawWeights.set(cell.index, rawWeight);
      rawWeightTotal += rawWeight;
      activeCount += 1;
      cell.rodInsertion = localRodInsertion;
    }

    const averageRawWeight = activeCount > 0 ? rawWeightTotal / activeCount : 1;
    const globalPower = Math.max(inputs.globalPowerPercent, 0.00001);
    const relaxation = 1 - Math.exp(-dt * 3.2);

    for (const cell of this.cells) {
      if (!cell.active) continue;
      const normalizedWeight = (rawWeights.get(cell.index) ?? averageRawWeight) / Math.max(averageRawWeight, 1e-6);
      const targetPower = clamp(globalPower * normalizedWeight, 0, 240);
      cell.power += (targetPower - cell.power) * relaxation;

      const relativePower = clamp(cell.power / globalPower, 0, 3);
      const xenonTarget = clamp(
        inputs.averageXenonPercent * (1 + (1 - relativePower) * 0.09),
        0,
        100,
      );
      cell.xenon += (xenonTarget - cell.xenon) * (1 - Math.exp(-dt * 0.28));

      const localVoidTarget = clamp(
        inputs.averageVoidFractionPercent * (0.58 + relativePower * 0.48) / flowFactor,
        0,
        95,
      );
      cell.voidFraction += (localVoidTarget - cell.voidFraction) * (1 - Math.exp(-dt * 1.6));

      const localFuelTarget = inputs.averageFuelTemperatureC + (cell.power - globalPower) * 2.1;
      cell.fuelTemperature += (localFuelTarget - cell.fuelTemperature) * (1 - Math.exp(-dt * 2.0));
    }

    this.diffuse("power", 0.036);
    this.diffuse("fuelTemperature", 0.022);
    this.diffuse("voidFraction", 0.016);
    this.updateDiagnostics();
  }

  public snapshot(): CoreCellSnapshot[] {
    return this.cells.map((cell) => ({ ...cell }));
  }

  public getDiagnostics(): CoreDiagnostics {
    return { ...this.diagnostics };
  }

  private bankIndexFor(x: number, y: number): 0 | 1 | 2 | 3 {
    const centerX = (this.width - 1) / 2;
    const centerY = (this.height - 1) / 2;
    const right = x > centerX;
    const rear = y > centerY;
    if (!rear && !right) return 0;
    if (!rear && right) return 1;
    if (rear && !right) return 2;
    return 3;
  }

  private blendedBankInsertion(x: number, y: number, banks: RodBankTuple): number {
    const centerX = (this.width - 1) / 2;
    const centerY = (this.height - 1) / 2;
    const blendWidth = 1.6;
    const rightWeight = clamp((x - centerX + blendWidth) / (blendWidth * 2), 0, 1);
    const rearWeight = clamp((y - centerY + blendWidth) / (blendWidth * 2), 0, 1);
    const front = 1 - rearWeight;
    const left = 1 - rightWeight;
    return (
      banks[0] * left * front
      + banks[1] * rightWeight * front
      + banks[2] * left * rearWeight
      + banks[3] * rightWeight * rearWeight
    );
  }

  private updateDiagnostics(): void {
    let total = 0;
    let count = 0;
    let maximum = -Infinity;
    let peakChannelIndex = -1;
    for (const cell of this.cells) {
      if (!cell.active) continue;
      total += cell.power;
      count += 1;
      if (cell.power > maximum) {
        maximum = cell.power;
        peakChannelIndex = cell.index;
      }
    }
    const average = count > 0 ? total / count : 0;
    this.diagnostics = {
      peakFactor: average > 0.001 ? maximum / average : 1,
      peakChannelIndex,
      maximumPowerPercent: Number.isFinite(maximum) ? maximum : 0,
      averagePowerPercent: average,
    };
  }

  private diffuse(field: "power" | "fuelTemperature" | "voidFraction", strength: number): void {
    const next = this.cells.map((cell) => cell[field]);

    for (const cell of this.cells) {
      if (!cell.active) continue;
      let sum = 0;
      let count = 0;
      const neighbours = [
        [cell.x - 1, cell.y],
        [cell.x + 1, cell.y],
        [cell.x, cell.y - 1],
        [cell.x, cell.y + 1],
      ] as const;

      for (const [x, y] of neighbours) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
        const neighbour = this.cells[y * this.width + x];
        if (!neighbour?.active) continue;
        sum += neighbour[field];
        count += 1;
      }

      if (count > 0) {
        const average = sum / count;
        next[cell.index] = cell[field] + (average - cell[field]) * strength;
      }
    }

    for (const cell of this.cells) cell[field] = next[cell.index] ?? cell[field];
  }
}
