/**
 * v3 产业链引擎 — 分段传导引擎
 * 非线性 + 非对称传导率
 */

interface TransmissionResult {
  cotton: { old: number; new: number; change: number };
  yarn: { old: number; new: number; change: number };
  fob: { old: number; new: number; change: number };
  retail: { old: number; new: number; change: number };
  profit: { old: number; new: number; change: number };
  coefficient: number;
  absorption: number;
}

class TransmissionEngine {
  private thresholds = { small: 0.05, medium: 0.15 };
  private coefficients = {
    up_small: 0.043, up_medium: 0.051, up_large: 0.068,
    down_small: 0.016, down_medium: 0.019, down_large: 0.025,
  };

  getCoefficient(shockPct: number): number {
    const dir = shockPct > 0 ? 'up' : 'down';
    const mag = Math.abs(shockPct);
    if (mag < this.thresholds.small) return this.coefficients[`${dir}_small` as keyof typeof this.coefficients];
    if (mag < this.thresholds.medium) return this.coefficients[`${dir}_medium` as keyof typeof this.coefficients];
    return this.coefficients[`${dir}_large` as keyof typeof this.coefficients];
  }

  propagate(cottonChangePct: number): TransmissionResult {
    const coeff = this.getCoefficient(cottonChangePct);
    const yarnNew = 15300 * (1 + cottonChangePct) + 6000;
    const yarnChg = (yarnNew - 21300) / 21300;
    const fobNew = 4.00 * (1 + yarnChg) + 0.80 + 7.50 + 3.00;
    const fobChg = (fobNew - 15.00) / 15.00;
    const retailChg = fobChg * coeff;

    return {
      cotton: { old: 15300, new: 15300 * (1 + cottonChangePct), change: cottonChangePct },
      yarn: { old: 21300, new: yarnNew, change: yarnChg },
      fob: { old: 15.00, new: fobNew, change: fobChg },
      retail: { old: 60.00, new: 60.00 * (1 + retailChg), change: retailChg },
      profit: { old: 3.00, new: fobNew * 0.20, change: fobChg },
      coefficient: coeff,
      absorption: 1 - coeff,
    };
  }
}

export { TransmissionEngine };
export type { TransmissionResult };
