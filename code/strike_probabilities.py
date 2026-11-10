"""The October 2026 forecast as a short script: the base rate, the chance of each strike, and the backtest.

Reads model/inputs.json and data/first_prints.csv, the same files the Model page reads.
The page's model/model.js is a line-for-line port; a change to the math goes in both.
Run: python code/strike_probabilities.py
"""
import csv
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def erf(z):
    # Abramowitz and Stegun 7.1.26, as in model.js (error below 1.5e-7)
    s = -1 if z < 0 else 1
    a = abs(z)
    t = 1 / (1 + 0.3275911 * a)
    y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * math.exp(-a * a)
    return s * y


def Phi(z):
    return 0.5 * (1 + erf(z / math.sqrt(2)))


def phi(z):
    return math.exp(-0.5 * z * z) / math.sqrt(2 * math.pi)


def shape(lean, tails):
    """Sinh-arcsinh shape Y = sinh((asinh(Z) + lean) / d), d = 1 / tails, Z standard normal.
    Mean, standard deviation, skewness and excess kurtosis by the trapezoid rule over Z in [-10, 10], as in model.js."""
    d = 1 / tails
    N, a = 2000, -10.0
    h = 20 / N
    m1 = m2 = m3 = m4 = 0.0
    for i in range(N + 1):
        z = a + i * h
        w = (0.5 if i in (0, N) else 1) * phi(z) * h
        y = math.sinh((math.asinh(z) + lean) / d)
        m1 += w * y; m2 += w * y * y; m3 += w * y ** 3; m4 += w * y ** 4
    v = m2 - m1 * m1
    s = math.sqrt(v)
    c3 = m3 - 3 * m1 * m2 + 2 * m1 ** 3
    c4 = m4 - 4 * m1 * m3 + 6 * m1 * m1 * m2 - 3 * m1 ** 4
    return {"d": d, "lean": lean, "m": m1, "s": s, "skew": c3 / s ** 3, "exkurt": c4 / v ** 2 - 3}


def bisect(f, lo, hi):
    for _ in range(30):
        mid = (lo + hi) / 2
        if f(mid) < 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def solve(skew, exkurt):
    """Shape parameters with the target skewness and excess kurtosis, by alternating bisection, as in model.js."""
    if abs(skew) < 1e-9 and abs(exkurt) < 1e-9:
        return shape(0, 1)
    lean, tails = 0.0, 1.0
    for _ in range(12):
        lean = bisect(lambda l: shape(l, tails)["skew"] - skew, -3, 3)
        tails = bisect(lambda t: shape(lean, t)["exkurt"] - exkurt, 0.4, 3)
    return shape(lean, tails)


def above(x, mu, sd, sh):
    """Chance the outcome is above x; the shape is rescaled to mean mu and standard deviation sd."""
    y0 = sh["m"] + sh["s"] * (x - mu) / sd
    return 1 - Phi(math.sinh(sh["d"] * math.asinh(y0) - sh["lean"]))


def first_prints():
    """Contiguous run of first prints, in $ billions, ending at the latest month."""
    rows = [r for r in csv.DictReader(open(ROOT / "data" / "first_prints.csv")) if r["first_print"]]
    out = [(r["reference_month"], float(r["first_print"]) / 1000) for r in rows]
    # keep the unbroken run at the end
    def next_month(m):
        y, mo = map(int, m.split("-"))
        return f"{y + (mo == 12)}-{mo % 12 + 1:02d}"
    run = [out[-1]]
    for m, v in reversed(out[:-1]):
        if next_month(m) == run[0][0]:
            run.insert(0, (m, v))
        else:
            break
    return run


def main():
    cfg = json.load(open(ROOT / "model" / "inputs.json"))
    p = {k: v["value"] for k, v in cfg["inputs"].items()}
    fp = first_prints()
    last = fp[-1][1]
    base = last + p["CHANGE"]
    centre = base + p["ADJUST"]
    print(f"{fp[-1][0]} first print {last:.3f}; change carried forward {p['CHANGE']:.3f}; base rate {base:.3f}")
    sh = solve(p["SKEW"], p["KURT"] - 3)
    print(f"adjustment {p['ADJUST']:+.3f}; mean {centre:.3f}; standard deviation {p['SPREAD']:.3f}")
    print(f"skewness {sh['skew']:.3f}; kurtosis {sh['exkurt'] + 3:.3f}\n")
    print("Chance the October first print is above each strike")
    for x in cfg["strikes"]:
        print(f"  {x:6.1f}  {above(x, centre, p['SPREAD'], sh) * 100:5.1f}%")
    print("\nBacktest: each month projected as the last first print plus the last change")
    for i in range(2, len(fp)):
        a, b = fp[i - 1][1], fp[i - 2][1]
        proj = a + (a - b)
        print(f"  {fp[i][0]}  projected {proj:6.2f}  actual {fp[i][1]:6.2f}  miss {fp[i][1] - proj:+6.2f}")


def moments(x):
    """Mean, sample standard deviation, skewness and kurtosis (moment estimators), as in model.js."""
    n = len(x)
    m = sum(x) / n
    d = [v - m for v in x]
    m2 = sum(v * v for v in d) / n
    m3 = sum(v ** 3 for v in d) / n
    m4 = sum(v ** 4 for v in d) / n
    return {"n": n, "mean": m, "sd": math.sqrt(m2 * n / (n - 1)), "skew": m3 / m2 ** 1.5, "kurt": m4 / m2 ** 2}


def shape_base(months=24):
    """The base case shape: the base rate's misses, as a share of the projection, on Census's current figures."""
    rows = list(csv.reader(open(ROOT / "data" / "census_now.csv")))[1:]
    v = [float(r[1]) for r in rows]
    miss = [(v[i] - (2 * v[i - 1] - v[i - 2])) / (2 * v[i - 1] - v[i - 2]) for i in range(2, len(v))]
    return moments(miss[-months:])


if __name__ == "__main__":
    main()
