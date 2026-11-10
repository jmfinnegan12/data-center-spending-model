# Data center spending model

A model from [Event Neutral](https://eventneutral.com): how much will the Census Bureau report for US private data center construction spending in October 2026? Built around Kalshi's `KXDATACENTCON` markets.

- `index.html`: the Question page (served at data-center-spending-model.eventneutral.com). `rules/`: the market's rules.
- `model/`: the interactive Model page. `model/model.js` is a line-for-line port of the Python; a change to the math goes in both.
- `model/inputs.json`: the forecast's inputs, read by both the Python and the pages. Edit inputs here only.
- `data/first_prints.csv`: each month's first published figure, with the Internet Archive copy of the Census file it came from. `data/census_now.csv`: the whole series as Census shows it now.
- `code/strike_probabilities.py`: the same model as a short script. Run it to print the base rate, the chance above each strike and the backtest.
- The look shared by Event Neutral pages (styles, light/dark switch, D3, sliders) is loaded from `https://eventneutral.com/kit/v1/`. Its source is in the `event-neutral-site` repository.

---

Started 2026-11-10. Nothing here is financial advice.

License: MIT, see [LICENSE](LICENSE).
