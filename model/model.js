// The forecast's arithmetic. code/strike_probabilities.py is the same model in Python; a change to the math goes in both.
//
// The outcome is drawn from a sinh-arcsinh distribution (Jones and Pewsey, 2009), rescaled so that its mean and
// standard deviation are exactly the ones the inputs set. Lean bends it to one side (skewness); tail weight fattens or
// thins both tails (kurtosis). With lean 0 and tail weight 1 it is the ordinary bell curve.
(function () {
  // erf by Abramowitz and Stegun 7.1.26 (error below 1.5e-7), as in the Python
  function erf(z) {
    const s = z < 0 ? -1 : 1;
    const a = Math.abs(z);
    const t = 1 / (1 + 0.3275911 * a);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
    return s * y;
  }
  const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  const phi = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

  // The unscaled shape: Y = sinh((asinh(Z) + lean) / d), Z standard normal, d = 1 / tail weight.
  // Its mean, standard deviation, skewness and excess kurtosis, by the trapezoid rule over Z in [-10, 10].
  function shape(lean, tails) {
    const d = 1 / tails;
    const N = 4000, a = -10, h = 20 / N;
    let m1 = 0, m2 = 0, m3 = 0, m4 = 0;
    for (let i = 0; i <= N; i++) {
      const z = a + i * h;
      const w = (i === 0 || i === N ? 0.5 : 1) * phi(z) * h;
      const y = Math.sinh((Math.asinh(z) + lean) / d);
      m1 += w * y; m2 += w * y * y; m3 += w * y * y * y; m4 += w * y * y * y * y;
    }
    const v = m2 - m1 * m1, s = Math.sqrt(v);
    const c3 = m3 - 3 * m1 * m2 + 2 * m1 ** 3;
    const c4 = m4 - 4 * m1 * m3 + 6 * m1 * m1 * m2 - 3 * m1 ** 4;
    return { d, lean, m: m1, s, skew: c3 / s ** 3, exkurt: c4 / (v * v) - 3 };
  }

  // the chance the outcome is above x, and its density at x, for mean mu and standard deviation sd
  function above(x, mu, sd, sh) {
    const y0 = sh.m + sh.s * (x - mu) / sd;
    return 1 - Phi(Math.sinh(sh.d * Math.asinh(y0) - sh.lean));
  }
  function density(x, mu, sd, sh) {
    const y0 = sh.m + sh.s * (x - mu) / sd;
    const u = sh.d * Math.asinh(y0) - sh.lean;
    return (sh.s / sd) * phi(Math.sinh(u)) * Math.cosh(u) * sh.d / Math.sqrt(1 + y0 * y0);
  }

  // first prints: [{ month: 'YYYY-MM', value }] in order, contiguous
  function fromConfig(cfg, firstPrints) {
    const last = firstPrints[firstPrints.length - 1];
    const prev = firstPrints[firstPrints.length - 2];
    const DEFAULTS = {};
    Object.keys(cfg.inputs).forEach((k) => { DEFAULTS[k] = cfg.inputs[k].value; });
    let cache = null;
    const sh = (p) => {
      if (!cache || cache.lean !== p.LEAN || cache.tails !== p.TAILS) cache = { lean: p.LEAN, tails: p.TAILS, v: shape(p.LEAN, p.TAILS) };
      return cache.v;
    };
    const mean = (p) => last.value + p.CHANGE + p.ADJUST;
    return {
      AS_OF: cfg.as_of, MONTH: cfg.month, RELEASE: cfg.release, STRIKES: cfg.strikes, DEFAULTS,
      LAST: last, PREV: prev,
      lastChange: last.value - prev.value,
      // the base rate (M1): last first print plus the change carried forward
      baseRate: (p) => last.value + p.CHANGE,
      centre: mean,
      moments: (p) => { const s = sh(p); return { mean: mean(p), sd: p.SPREAD, skew: s.skew, exkurt: s.exkurt }; },
      above: (x, p) => above(x, mean(p), p.SPREAD, sh(p)),
      density: (x, p) => density(x, mean(p), p.SPREAD, sh(p)),
      // the value with chance q below it
      quantile: (q, p) => {
        let lo = mean(p) - 20 * p.SPREAD, hi = mean(p) + 20 * p.SPREAD;
        for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (1 - above(mid, mean(p), p.SPREAD, sh(p)) < q) lo = mid; else hi = mid; }
        return (lo + hi) / 2;
      },
    };
  }

  // How M1 would have done: each month projected from the two first prints before it.
  function backtest(firstPrints) {
    const out = [];
    for (let i = 2; i < firstPrints.length; i++) {
      const a = firstPrints[i - 1].value, b = firstPrints[i - 2].value;
      const projected = a + (a - b);
      out.push({ month: firstPrints[i].month, projected, actual: firstPrints[i].value, miss: firstPrints[i].value - projected });
    }
    return out;
  }

  window.ForecastModel = { fromConfig, backtest, shape };
})();
