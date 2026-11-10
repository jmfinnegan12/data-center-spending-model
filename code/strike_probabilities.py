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


def above(x, centre, sd):
    return 0.5 * (1 - erf((x - centre) / (sd * math.sqrt(2))))


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
    print(f"adjustment {p['ADJUST']:+.3f}; centre {centre:.3f}; spread (one standard deviation) {p['SPREAD']:.3f}\n")
    print("Chance the October first print is above each strike")
    for x in cfg["strikes"]:
        print(f"  {x:6.1f}  {above(x, centre, p['SPREAD']) * 100:5.1f}%")
    print("\nBacktest: each month projected as the last first print plus the last change")
    for i in range(2, len(fp)):
        a, b = fp[i - 1][1], fp[i - 2][1]
        proj = a + (a - b)
        print(f"  {fp[i][0]}  projected {proj:6.2f}  actual {fp[i][1]:6.2f}  miss {fp[i][1] - proj:+6.2f}")


if __name__ == "__main__":
    main()
