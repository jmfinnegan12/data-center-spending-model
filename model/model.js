// The forecast's arithmetic. code/strike_probabilities.py is the same model in Python; a change to the math goes in both.
(function () {
  // Normal distribution: chance a value is above x, given its centre and standard deviation.
  // erf by Abramowitz and Stegun 7.1.26 (error below 1.5e-7), as in the Python.
  function erf(z) {
    const s = z < 0 ? -1 : 1;
    const a = Math.abs(z);
    const t = 1 / (1 + 0.3275911 * a);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
    return s * y;
  }
  const above = (x, centre, sd) => 0.5 * (1 - erf((x - centre) / (sd * Math.SQRT2)));
  const density = (x, centre, sd) => Math.exp(-0.5 * ((x - centre) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));

  // first prints: [{ month: 'YYYY-MM', value }] in order, contiguous
  function fromConfig(cfg, firstPrints) {
    const last = firstPrints[firstPrints.length - 1];
    const prev = firstPrints[firstPrints.length - 2];
    const DEFAULTS = {};
    Object.keys(cfg.inputs).forEach((k) => { DEFAULTS[k] = cfg.inputs[k].value; });
    return {
      AS_OF: cfg.as_of, MONTH: cfg.month, RELEASE: cfg.release, STRIKES: cfg.strikes, DEFAULTS,
      LAST: last, PREV: prev,
      lastChange: last.value - prev.value,
      // the base rate (M1): last first print plus the change carried forward
      baseRate: (p) => last.value + p.CHANGE,
      centre: (p) => last.value + p.CHANGE + p.ADJUST,
      above: (x, p) => above(x, last.value + p.CHANGE + p.ADJUST, p.SPREAD),
      density: (x, p) => density(x, last.value + p.CHANGE + p.ADJUST, p.SPREAD),
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

  window.ForecastModel = { fromConfig, backtest, above, density };
})();
