# ptcg-site-nova

Community site for Pokémon TCG events in Northern Virginia, hosted on GitHub Pages.

## Files

- `index.html`, `styles.css`, `app.js`: the site
- `events.json`: the event list. Add, edit or remove events here.
- `config.js`: Supabase keys for on-site sign-ups
- `supabase/schema.sql`: creates the sign-ups table

## Adding an event

Each entry in `events.json` looks like this:

```json
{
  "id": "fairfax-league-2026-11-12",
  "type": "hosted",
  "title": "Standard league night",
  "start": "2026-11-12T18:30:00-05:00",
  "venue": "Store name",
  "city": "Fairfax, VA",
  "address": "123 Main St, Fairfax, VA",
  "format": "Standard, best of 1",
  "fee": "$10",
  "capacity": 32
}
```

- `type: "hosted"` shows a Sign up button that saves to Supabase.
- `type: "store"` shows a Store details button that opens `link`.
- `id` must be unique; sign-ups are saved under it.
- Past events hide themselves automatically.

## Turning on sign-ups

1. Create a free project at supabase.com.
2. Open SQL Editor, paste `supabase/schema.sql`, and run it.
3. In Project Settings > API, copy the Project URL and the anon public key into `config.js`.
4. Sign-ups appear in Table Editor > signups.
