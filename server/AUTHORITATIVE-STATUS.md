# Authoritative combat implementation status

`game-runtime.mjs` executes the existing solo combat modules in a fresh context, with a seeded RNG and fixed 30 Hz steps. Only movement, move-slot changes and supported choices are accepted. Time, damage, death and eliminations are computed by the engine.

`action-session.mjs` binds actions to a wallet, limits each batch to 30 frames, checks sequence numbers and server elapsed time, and closes on simulation failures or disconnection.

This is an internal component, NOT an operational ranked-game verifier. It is deliberately not wired to `/verify`, public runs or payment eligibility.

Remaining integration requirements:
- Isolate active simulations in resource-limited workers; enforce wallet/session capacity and cleanup.
- Connect the browser to server-issued sessions and the authoritative world state without changing the existing game mechanics or allowing local upgrades to become trusted input.
- Complete bond choices, rerolls and all UI interactions, and verify long runs including bosses, rifts, pickups, biome transitions and upgrades. Current coverage exercises early combat and death only.
- Persist authoritative score checkpoints and round-boundary attribution atomically, including disconnect/restart handling.
- Perform real devnet three-recipient payout and reconciliation tests before considering mainnet.

No readiness flag or environment variable alone establishes these properties. The VM executes only bundled trusted code; it is not treated as a security boundary for arbitrary user programs.
