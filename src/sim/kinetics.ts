const BETA_FRACTIONS = [0.000215, 0.001424, 0.001274, 0.002568, 0.000748, 0.000273] as const;
const DECAY_CONSTANTS = [0.0124, 0.0305, 0.111, 0.301, 1.14, 3.01] as const;

export const TOTAL_DELAYED_NEUTRON_FRACTION = BETA_FRACTIONS.reduce((sum, value) => sum + value, 0);

export interface KineticsState {
  neutronDensity: number;
  precursors: Float64Array;
}

export interface KineticsResult {
  neutronDensity: number;
  promptRate: number;
  delayedRate: number;
  periodSeconds: number;
}

export class SixGroupPointKinetics {
  readonly state: KineticsState;
  private readonly generationTimeSeconds: number;

  constructor(initialPower = 1e-8, generationTimeSeconds = 0.001): void {
    this.generationTimeSeconds = generationTimeSeconds;
    this.state = {
      neutronDensity: Math.max(initialPower, 1e-12),
      precursors: new Float64Array(BETA_FRACTIONS.length),
    };
    this.setEquilibrium(initialPower);
  }

  reset(initialPower = 1e-8): void {
    this.state.neutronDensity = Math.max(initialPower, 1e-12);
    this.setEquilibrium(initialPower);
  }

  step(reactivityDeltaKOverK: number, dt: number, source = 1e-11): KineticsResult {
    const n0 = Math.max(this.state.neutronDensity, 1e-15);
    let delayedRate = 0;

    for (let i = 0; i < this.state.precursors.length; i += 1) {
      delayedRate += DECAY_CONSTANTS[i]! * this.state.precursors[i]!;
    }

    const promptRate = ((reactivityDeltaKOverK - TOTAL_DELAYED_NEUTRON_FRACTION) / this.generationTimeSeconds) * n0;
    const derivative = promptRate + delayedRate + source;
    const n1 = Math.max(1e-15, n0 + derivative * dt);

    for (let i = 0; i < this.state.precursors.length; i += 1) {
      const concentration = this.state.precursors[i]!;
      const production = (BETA_FRACTIONS[i]! / this.generationTimeSeconds) * n0;
      const loss = DECAY_CONSTANTS[i]! * concentration;
      this.state.precursors[i] = Math.max(0, concentration + (production - loss) * dt);
    }

    this.state.neutronDensity = n1;
    const logarithmicRate = Math.log(n1 / n0) / Math.max(dt, 1e-9);
    const periodSeconds = Math.abs(logarithmicRate) < 1e-8 ? Number.POSITIVE_INFINITY : 1 / logarithmicRate;

    return { neutronDensity: n1, promptRate, delayedRate, periodSeconds };
  }

  private setEquilibrium(power: number): void {
    const neutronDensity = Math.max(power, 1e-12);
    for (let i = 0; i < this.state.precursors.length; i += 1) {
      this.state.precursors[i] = (BETA_FRACTIONS[i]! / (this.generationTimeSeconds * DECAY_CONSTANTS[i]!)) * neutronDensity;
    }
  }
}
