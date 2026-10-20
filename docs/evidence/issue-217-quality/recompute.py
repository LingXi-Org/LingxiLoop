"""Independent arithmetic for the two unchanged synthetic inputs.

No generated HTML, model answer, or model evaluation is used as an oracle.
Run from the repository root. Prints the complete result and checks oracle.json.
"""

from fractions import Fraction
import json
from pathlib import Path

fixed_a, rate_a, rate_b = 100, 2, 5
intersection = Fraction(fixed_a, rate_b - rate_a)
sales = [12, 18, 17, 25, 31, 40]
costs = [8, 11, 12, 15, 17, 20]
profit = [s - c for s, c in zip(sales, costs)]


def changes(series):
    return [current - previous for previous, current in zip(series, series[1:])]


def percentages(series):
    return [Fraction(100 * delta, previous) for delta, previous in zip(changes(series), series)]


def fastest_month(series):
    return max(range(len(series)), key=series.__getitem__) + 2


sales_delta, profit_delta = changes(sales), changes(profit)
assert fastest_month(sales_delta) == fastest_month(profit_delta)
result = {
    "method": "Independent exact rational arithmetic from the unchanged synthetic test inputs; no provider output used as an answer key.",
    "comparison": {
        "intersectionN": str(intersection),
        "intersectionCost": str(rate_b * intersection),
        "samples": [
            {"n": n, "A": fixed_a + rate_a * n, "B": rate_b * n,
             "lower": "A" if fixed_a + rate_a * n < rate_b * n else "B"}
            for n in [0, 20, 33, 34, 50, 100]
        ],
    },
    "trend": {
        "sales": sales,
        "costs": costs,
        "profit": profit,
        "salesAbsoluteChange": sales_delta,
        "profitAbsoluteChange": profit_delta,
        "salesPercentChangeExact": [str(value) for value in percentages(sales)],
        "profitPercentChangeExact": [str(value) for value in percentages(profit)],
        "largestAbsoluteIncreaseMonth": fastest_month(sales_delta),
        "salesLargestPercentageIncreaseMonth": fastest_month(percentages(sales)),
        "profitLargestPercentageIncreaseMonth": fastest_month(percentages(profit)),
    },
}
print(json.dumps(result, ensure_ascii=False, indent=2))
assert result == json.loads(Path("artifacts/issue-217-quality/oracle.json").read_text())
