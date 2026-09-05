# Government Interface Mode - Safe Integration Notes

Base archive: `sources(20260904-235646).zip`

## What changed

### Existing file changed
- `src/components/AppShell.jsx`
  - accepts `government` as a third saved appearance mode;
  - adds/removes only the `dengue-government` class on `<html>`;
  - replaces the two-state desktop appearance control with Light / Dark / Government;
  - adds the same three-state selector inside Display Settings for compact/mobile view.

### New files
- `src/government/GovernmentAppearanceSwitch.jsx`
- `src/government/government.css`
- `src/government/README.md`

## What was intentionally NOT changed
- `backend/**`
- `src/services/api.js`
- `src/context/DataContext.jsx`
- `src/App.jsx`
- `src/main.jsx`
- `src/index.css`
- every file in `src/pages/**`
- forecast/model logic
- upload/integration logic
- map logic
- Supabase queries, subscriptions, persistence, and notification polling

## Supabase / egress impact
Government mode is presentation-only. It introduces no query, fetch, subscription,
listener to Supabase, API request, or polling interval. Switching appearance only
updates React local state, a class on `<html>`, and the existing localStorage theme
value.

## Debug rollback
If the new mode causes a visual issue, Light and Dark remain available. For a code
rollback, restore the original `AppShell.jsx` and remove `src/government/`.
