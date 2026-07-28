import type { CoreCellSnapshot } from "./types";

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

interface CoreInputs {
  globalPowerPercent: number;
  averageFuelTemperatureC: number;
  averageVoidFractionPercent: number;
  averageXenonPercent: number;
  averageRodInsertionPercent: number;
  coolantFlowPercent: number;
}

export class SpatialCoreModel {
  public readonly width = 15;
  public readonly height = 15;
  private readonly cells: CoreCellSnapshot[];

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
  }

  public update(inputs: CoreInputs, dt: number): void {
    const centerX = (this.width - 1) / 2;
    const centerY = (this.height - 1) / 2;
    const normalizedPower = inputs.globalPowerPercent / 100;
    const flowFactor = clamp(inputs.coolantFlowPercent / 100, 0.1, 1.2);

    for (const cell of this.cells) {
      if (!cell.active) continue;

      const dx = cell.x - centerX;
      const dy = cell.y - centerY;
      const radius = Math.hypot(dx, dy);
      const radialShape = Math.max(0.05, 1 - (radius / 7.8) ** 1.7);
      const azimuthalBias = 1 + Math.sin(cell.x * 1.61 + cell.y * 0.73) * 0.055;
      const verticalBias = 1 + (centerY - cell.y) * 0.012;
      const rodBankWave = Math.sin(cell.x * 0.9) * Math.cos(cell.y * 0.7) * 5;
      const rodInsertion = clamp(inputs.averageRodInsertionPercent + rodBankWave, 0, 100);
      const rodSuppression = 1 - rodInsertion / 135;
      const xenonBias = 1 + Math.sin(cell.x * 0.34 - cell.y * 0.48) * 0.06;
      const xenon = clamp(inputs.averageXenonPercent * xenonBias, 0, 100);
      const xenonSuppression = 1 - xenon / 260;
      const targetPower = clamp(
        normalizedPower * radialShape * azimuthalBias * verticalBias * rodSuppression * xenonSuppression * 1.95,
        0,
        2.2,
      );

      const relaxation = 1 - Math.exp(-dt * 3.5);
      cell.power += (targetPower - cell.power) * relaxation;
      cell.rodInsertion = rodInsertion;
      cell.xenon += (xenon - cell.xenon) * (1 - Math.exp(-dt * 0.35));

      const localVoidTarget = clamp(
        inputs.averageVoidFractionPercent * (0.6 + cell.power * 0.55) / flowFactor,
        0,
        95,
      );
      cell.voidFraction += (localVoidTarget - cell.voidFraction) * (1 - Math.exp(-dt * 1.8));

      const localFuelTarget = inputs.averageFuelTemperatureC + (cell.power - normalizedPower) * 210;
      cell.fuelTemperature += (localFuelTarget - cell.fuelTemperature) * (1 - Math.exp(-dt * 2.2));
    }

    this.diffuse("power", 0.045);
    this.diffuse("fuelTemperature", 0.025);
    this.diffuse("voidFraction", 0.018);
  }

  public snapshot(): CoreCellSnapshot[] {
    return this.cells.map((cell) => ({ ...cell }));
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
