# StayCertain v1

One booking in, cancellation risk and action out. Plain HTML/CSS/JS, no build step.
The prediction comes only from the trained Logistic Regression formula in `predict.js` (no AI service).

## Files
- `index.html`, `styles.css`, `app.js`: form, validation, result card, limitations
- `predict.js`: the ONE `predict(inputs)` function, with the model parameters embedded
- `test_predict.js`: checks the 10 Orange reference cases (`node test_predict.js`)
- `log.js`, `config.js`, `supabase.sql`: optional prediction log in Supabase

## 1. Supabase (optional, about 3 minutes)
1. Create a project at supabase.com.
2. SQL Editor > New query > paste `supabase.sql` > Run. This creates the `predictions` table; the app can only add rows.
3. Project Settings > API: copy the Project URL and the `anon` public key into `config.js`.
Leave `config.js` empty to run without Supabase; the app works the same.

## 2. Deploy on Vercel
1. Put this folder in a GitHub repository (or use `npx vercel` from inside the folder).
2. On vercel.com: Add New > Project > import the repo.
3. Framework preset: **Other**. Leave the build command empty. Output directory: `./` (the root).
4. Deploy. Open the URL and run test case 8: expected "High risk: 61%".

## 3. Verify
- `node test_predict.js` should print `10 of 10 match Orange.`
- In the live app, enter the 10 cases from `StayCertain_10_test_cases.xlsx` and record the results.
- If Supabase is on, each check appears in Table Editor > predictions.
