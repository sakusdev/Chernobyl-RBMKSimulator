use wasm_bindgen::prelude::*;

const BETA: [f64; 6] = [0.000_215, 0.001_424, 0.001_274, 0.002_568, 0.000_748, 0.000_273];
const LAMBDA: [f64; 6] = [0.0124, 0.0305, 0.111, 0.301, 1.14, 3.01];
const BETA_TOTAL: f64 = 0.006_502;

#[wasm_bindgen]
pub struct PointKinetics {
    neutron_density: f64,
    precursors: [f64; 6],
    generation_time: f64,
    period_seconds: f64,
}

#[wasm_bindgen]
impl PointKinetics {
    #[wasm_bindgen(constructor)]
    pub fn new(initial_power: f64) -> Self {
        let neutron_density = initial_power.max(1.0e-12);
        let generation_time = 0.001;
        let mut precursors = [0.0; 6];
        for index in 0..6 {
            precursors[index] = BETA[index] * neutron_density / (generation_time * LAMBDA[index]);
        }

        Self {
            neutron_density,
            precursors,
            generation_time,
            period_seconds: f64::INFINITY,
        }
    }

    pub fn reset(&mut self, initial_power: f64) {
        self.neutron_density = initial_power.max(1.0e-12);
        for index in 0..6 {
            self.precursors[index] =
                BETA[index] * self.neutron_density / (self.generation_time * LAMBDA[index]);
        }
        self.period_seconds = f64::INFINITY;
    }

    pub fn step(&mut self, reactivity: f64, dt: f64, source: f64) -> f64 {
        let dt = dt.clamp(0.000_1, 0.1);
        let previous = self.neutron_density.max(1.0e-15);
        let delayed_rate = self
            .precursors
            .iter()
            .zip(LAMBDA)
            .map(|(concentration, decay)| concentration * decay)
            .sum::<f64>();
        let prompt_rate = ((reactivity - BETA_TOTAL) / self.generation_time) * previous;
        self.neutron_density = (previous + (prompt_rate + delayed_rate + source) * dt).max(1.0e-15);

        for index in 0..6 {
            let production = BETA[index] * previous / self.generation_time;
            let loss = LAMBDA[index] * self.precursors[index];
            self.precursors[index] = (self.precursors[index] + (production - loss) * dt).max(0.0);
        }

        let logarithmic_rate = (self.neutron_density / previous).ln() / dt;
        self.period_seconds = if logarithmic_rate.abs() < 1.0e-10 {
            f64::INFINITY
        } else {
            1.0 / logarithmic_rate
        };

        self.neutron_density
    }

    #[wasm_bindgen(getter)]
    pub fn neutron_density(&self) -> f64 {
        self.neutron_density
    }

    #[wasm_bindgen(getter)]
    pub fn period_seconds(&self) -> f64 {
        self.period_seconds
    }

    pub fn precursor(&self, index: usize) -> f64 {
        self.precursors.get(index).copied().unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equilibrium_stays_near_constant_at_zero_reactivity() {
        let mut model = PointKinetics::new(1.0);
        for _ in 0..1_000 {
            model.step(0.0, 0.001, 0.0);
        }
        assert!((model.neutron_density() - 1.0).abs() < 0.02);
    }

    #[test]
    fn positive_reactivity_increases_power() {
        let mut model = PointKinetics::new(1.0);
        for _ in 0..500 {
            model.step(0.001, 0.001, 0.0);
        }
        assert!(model.neutron_density() > 1.0);
    }
}
