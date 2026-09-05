# Government interface mode

This folder contains the optional institutional/public-health presentation layer.

Design rule: Government mode must stay presentation-only. It must not fetch data,
subscribe to Supabase, change forecasting logic, or duplicate application state.
The existing Light and Dark interfaces remain the functional baseline.

## Files
- `GovernmentAppearanceSwitch.jsx`: three-state Light / Dark / Government selector.
- `government.css`: styles scoped under `html.dengue-government`.

## Integration contract
`AppShell.jsx` only needs to:
1. accept `government` as a saved appearance value;
2. add/remove `dengue-government` on `<html>`;
3. render `GovernmentAppearanceSwitch` and pass the existing local `theme` state.

No backend, API service, DataContext, forecasting, map, upload, or Supabase code is
required for this mode.
