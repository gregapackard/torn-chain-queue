# Chain Queue

Lightweight live Torn chaining rotation.

## Rules
- First queued player is NEXT.
- At 4:00 or less, NEXT is told to hit.
- Any queued player who makes a qualifying successful faction attack is moved to the bottom, even out of order.
- Join adds you to the bottom; Leave removes you immediately.
- Torn API keys are stored only in the user's browser.
- Shared storage contains only queue/session state.

## One-time shared queue setup
1. Create a free Supabase project.
2. Run `supabase.sql` in its SQL editor.
3. Copy Project URL and anon/publishable key into `config.js`.
4. GitHub Pages serves this folder at `/chain/`.

The permissive RLS policies are intentional for the first prototype and should be hardened before broad public use.
