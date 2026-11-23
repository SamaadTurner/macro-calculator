# Macro Calculator

Daily calories and protein, carb and fat targets in four short steps: about you, your body, how
active you are, and your goal (lose fat, maintain or build muscle).

**Live:** https://samaadturner.github.io/macro-calculator/

<p>
  <img src="docs/screenshots/goal-step.png" alt="Goal step with three goal cards" width="260">
  <img src="docs/screenshots/results.png" alt="Results page with a macro ring and grams per macro" width="260">
  <img src="docs/screenshots/results-dark.png" alt="The same results page in dark mode" width="260">
</p>

No sign-up and no server. Answers and saved plans stay in the browser's local storage, so a
returning visitor lands straight on their results.

## What it does

- Four steps, one group of questions per screen, with messages next to the field that needs fixing.
- Pounds and feet or kilograms and centimetres. Switching converts both weight and height, and
  switching back and forth never changes the numbers.
- Results: a ring of calories by macro, grams and share for each macro, a goal switcher that
  updates the numbers right away, grams per meal for 3 to 6 meals, and the working behind the
  numbers.
- Save up to ten plans on the device, copy a plan as text, or share it from a phone.
- A daily log (the Log tab): weight, calories eaten and optional protein, carbs and fats for
  each day. A chart shows each weigh-in and a smoothed trend (an exponential moving average
  that moves 10% toward each new weigh-in, from John Walker's *The Hacker's Diet*), the trend
  weight, and how much it moved over the last 7 days. The chart has a hover readout and can be
  read with the arrow keys; the history table below it lists every number.
- A weekly check-in (the Check-in tab) that estimates what you really burn from your log and
  suggests new targets. See below.
- Export the log as a JSON backup and import it on another device. Days in the backup replace
  the same days on the device; anything unreadable is skipped and counted.
- Light and dark themes in warm gym colours (cream walls, wood, black iron), following the
  phone's setting.

## How the numbers are worked out

1. **Resting energy (BMR)** with the Mifflin-St Jeor equation:
   `10 × kg + 6.25 × cm − 5 × age`, then `+5` for men and `−161` for women.
   "Other" uses the average of the two (`−78`). It is the best-tested equation for adults,
   and still more than 10% off for about one person in four
   ([Frankenfield 2013](https://pubmed.ncbi.nlm.nih.gov/23631843/)).
2. **Maintenance** = BMR × activity factor (1.2 mostly sitting to 1.9 athlete). The activity
   choices name both the job and the training, because people who sit at work and lift tend to
   pick too high.
3. **Goal pace,** as a share of body weight per week:
   - Lose fat: 0.25%, 0.5% (default), 0.75% or 1%. Losing 0.5 to 1% a week helps keep muscle
     ([Helms et al. 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492)).
   - Build muscle: 0.15%, 0.25% (default) or 0.5%. Newer lifters can gain faster; experienced
     ones should go slower ([Iraki et al. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6680710)).
   - The pace becomes calories at 7,700 calories per kg of body weight, the simple rule Hall
     found fits weight change over months reasonably well
     ([Hall 2008](https://pmc.ncbi.nlm.nih.gov/articles/PMC2376744)). The first weeks of a diet
     lose more water, so the scale moves faster at first.
   - The deficit is capped at 25% of maintenance and the surplus at 20%, and the results say
     when a cap applies. The results show the expected change in lb or kg per week.
4. **Calorie floor, fat loss only:** not below 1,200 (women), 1,500 (men) or 1,350 (other). This
   is a common rule of thumb, not a formal guideline. It never pushes a target above
   maintenance: if maintenance is already below the floor, the fat loss target is maintenance
   and the results suggest planning any loss with a doctor or dietitian. When the floor applies,
   the results say so.
5. **Protein:** 2.2 g per kg when losing fat, 1.8 g per kg otherwise. Muscle gains level off at
   around 1.6 g/kg ([Morton et al. 2018](https://pubmed.ncbi.nlm.nih.gov/28698222/)), and more
   helps keep muscle during a cut ([ISSN 2017](https://pubmed.ncbi.nlm.nih.gov/28642676/)). Above
   a BMI of 25 the weight used is the weight at BMI 25 for that height, because total weight
   overstates muscle at higher body fat. Capped at 40% of calories.
6. **Fat:** 25% of calories, inside the 20 to 35% of the US Dietary Guidelines. **Carbs:** the
   rest, always at least about 35%.

Fat loss plans are not offered under 18, and under 18 the results note that the formula was
built from adults. These are estimates: real energy needs can be a few hundred calories away
from any formula, which is why the results suggest checking your weight trend after 2 to 3
weeks.

The math was checked against a separate version written from the papers on 3,375 combinations
of sex, age, weight, height, activity and goal; the unit tests keep worked examples from that
check and run 9,000 combinations (every pace included) on every push.

## The weekly check-in

The formula above is a starting guess, and for about one person in four it is off by more than
10%. After about two weeks of logging, the check-in works out your real maintenance from the log:

1. **Weight change:** a least-squares line through the weigh-ins of the last 28 days. Missed
   weigh-ins need no filling in; the line spans them.
2. **Calories eaten:** the average of the days with calories logged between the first and the
   last weigh-in (food on the day of the last weigh-in shows up on the scale the next day, so it
   is left out). Days with no calories are skipped, not counted as zero. It uses what you ate,
   not the plan, so eating off plan does not throw it off. Someone who always forgets the
   cooking oil gets an estimate in their own logged calories, which is what they compare
   against anyway.
3. **Energy in a kg of weight change:** not a fixed 7,700. A kg of fat holds about 9,440
   calories and a kg of lean tissue about 1,820 ([Hall 2008](https://pmc.ncbi.nlm.nih.gov/articles/PMC2376744)).
   The share of a change that is fat follows Forbes' curve, fat mass / (fat mass + 10.4 kg),
   with body fat estimated from BMI, age and sex
   ([Deurenberg 1991](https://pubmed.ncbi.nlm.nih.gov/2043597/)). For a 180 lb, 5 ft 10 in,
   30 year old man that is about 6,620 calories per kg; leaner people get less, heavier people more.
4. **Burn from the log** = average calories eaten − weight change per day × energy per kg.
5. **Mixed with the formula** by how certain each one is (inverse-variance weighting): the
   formula is taken as ±15%, the log's uncertainty comes from the scatter of the weigh-ins
   around the line (at least 0.4 kg a day) and of the logged calories. A short or noisy log
   leans on the formula; with four weeks of daily data the log does almost all of the work. The
   page shows the split and a likely range.
6. **Weekly limit:** between saved check-ins the estimate moves at most 200 calories a week, so
   one odd week does not swing the targets.

The suggested targets then use the same rules as the plan (pace, caps, the floor, the macro
split), with the measured maintenance and the energy per kg above. The first estimate needs 5
weigh-ins spread over at least 10 days and 7 days with calories. The page says when the log is
far (35%) from the formula and suggests checking the logging. Check-ins are saved on the device
with a history.

## Built with

React 18 and TypeScript on Vite. No UI or chart library: the ring is a small SVG component and
the styles are one CSS file of design tokens (colours, type, spacing) in
[`src/styles.css`](src/styles.css), with a light set and a dark set. The macro colours were
checked for colour-blind separation and contrast against both card colours. Fonts (Inter and Barlow Condensed) are bundled, not loaded
from Google.

```
src/
  engine/       the math, no React: checks, unit conversion, the plan
  form.ts       form state, unit switching, which step is complete
  storage.ts    local storage, guarded against blocked or broken data
  log/          the daily log: dates, entries, form checks, trend, backup files
  coach/        the weekly check-in: energy per kg, the expenditure estimate, saved check-ins
  components/   the steps, the results page, the ring, the log and check-in pages and the weight chart
e2e/            Playwright tests, including axe accessibility scans
```

## Tests

- **109 unit tests** (Vitest) for the math (worked examples and 9,000 generated plans), the checks, unit switching, storage, the log
  (dates across month ends and daylight saving, the trend after gaps, backup files), the chart, and the check-in (hand-worked
  energy per kg and expenditure examples, scale noise, missed weigh-ins and calories, the 28-day window, the weekly limit). Every bug
  fixed in the old single-file version has a test, and one test runs 360 combinations of sex,
  goal, activity and extreme bodies to check no macro goes negative and the shares add to 100.
- **44 end-to-end tests** (Playwright) on a desktop and a touch phone screen (86 runs; one
  test is mouse-only and one is touch-only), against the production build. They cover the full flow in both unit systems, every error message, unit
  switching, the goal pace, the calorie floor (and that it never goes above maintenance), the under-18 rule, pill rows on a 320 px phone, saved plans, returning visitors, broken saved
  data, keyboard use, mouse hover versus touch on the ring, no sideways scrolling, logging,
  editing and deleting days, backup export and import, the chart with the keyboard, the check-in (exact numbers checked
  against a separate Python version, saving, the weekly limit, three tabs on a 320 px phone), and an
  [axe](https://github.com/dequelabs/axe-core) scan for WCAG 2.1 A and AA rules on every step,
  with and without errors showing, in light and dark mode.

GitHub Actions runs lint, type checks, unit tests, the build and the end-to-end tests on every
push. The site is deployed to GitHub Pages from `main` only after all of them pass.

## Run it locally

Needs Node 20 or newer.

```bash
git clone https://github.com/SamaadTurner/macro-calculator.git
cd macro-calculator
npm install
npm run dev            # http://localhost:5173/macro-calculator/
```

| Command | What it does |
|---|---|
| `npm test` | Unit tests |
| `npx playwright install chromium` then `npm run e2e` | End-to-end tests (builds the site first) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run build` | Production build in `dist/` |

## Known limits

- The Plan tab shows the formula; the measured targets are on the Check-in tab. The plan turns
  the pace into calories with the simple 7,700 per kg rule, the check-in with the energy per kg
  for your body, so the two can differ by a few dozen calories at the same maintenance.
- How accurate the check-in is has not been measured yet; a simulation study is next.
- The log is kept in this browser's local storage (a few hundred bytes a day, so years fit
  well under the browser's limit). Clearing site data deletes it, which is why there is an
  export button. There is no account or sync.
- `npm audit` reports moderate advisories in development-only packages (the Vite dev server and
  Vitest). None of that code is in the built site.

## Planned

A simulation study of the check-in (how far off it is after 1, 2 and 4 weeks compared with the
formula), importing daily totals from Cronometer and MyFitnessPal, and an installable offline app.

## License

MIT, see [LICENSE](LICENSE).
