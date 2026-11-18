# Macro Calculator

A web page that works out daily calories and protein, carb and fat targets from age, sex, height,
weight, activity level and goal (cut, maintain or bulk).

**Live:** https://samaadturner.github.io/macro-calculator/

It is a single HTML file with no dependencies and no build step. Nothing is sent to a server;
saved results stay in your browser's local storage.

## How the numbers are worked out

1. **Resting energy (BMR)** with the Mifflin-St Jeor equation:
   `10 × kg + 6.25 × cm − 5 × age`, then `+5` for men and `−161` for women.
   "Other" uses the average of the two (`−78`).
2. **Daily energy (TDEE)** = BMR × activity factor (1.2 sedentary to 1.9 athlete).
3. **Goal:** cut = TDEE minus 20%, but never more than 500 calories; maintain = TDEE;
   bulk = TDEE + 300.
4. **Calorie floor:** the target is never below 1,200 (women), 1,500 (men) or 1,350 (other).
   When the floor applies, the page says so.
5. **Protein:** 2.2 g per kg when cutting and 1.8 g per kg otherwise. Muscle gains level off at
   around 1.6 g/kg ([Morton et al. 2018](https://pubmed.ncbi.nlm.nih.gov/28698222/)), and a bit
   more helps keep muscle during a cut. Above a BMI of 25 the weight used is the weight at BMI 25
   for that height, because total weight overstates muscle at higher body fat. Protein is capped
   at 40% of calories.
6. **Fat:** 25% of calories. **Carbs:** whatever is left, which is always at least about 35%.

Cutting is not offered to anyone under 18.

These are estimates. Real energy needs can be a few hundred calories away from any formula, which
is why the page suggests checking your weight trend after 2 to 3 weeks.

## Input rules

| Field | Imperial | Metric |
|---|---|---|
| Age | 13 to 100, whole years | same |
| Weight | 50 to 500 lb, decimals allowed | 23 to 227 kg |
| Height | 4 ft 0 in to 7 ft 6 in, whole feet, inches 0 to 11 (decimals allowed, blank means 0) | 120 to 230 cm |

Switching between imperial and metric converts both weight and height. The exact value is kept
behind the rounded number on screen, so switching back and forth does not change it.

## Run it locally

```bash
git clone https://github.com/SamaadTurner/macro-calculator.git
cd macro-calculator
```

Then open `index.html` in a browser.

## Known limits

- One file, no automated tests yet. Changes are checked in a browser.
- Uses a formula only. It does not learn from your real weight changes.

## Planned

The next version moves to TypeScript with tests, adds a daily log of weight and calories, and
estimates your real energy use from your weight trend so the targets adjust each week.

## License

MIT, see [LICENSE](LICENSE).
