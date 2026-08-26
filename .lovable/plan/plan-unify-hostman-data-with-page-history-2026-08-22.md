# Plan - Unify Hostman Data with Page History

The user wants the "Hostman Branco" section to display the same result data as the main page history while maintaining its current layout.

## Current State Analysis

- `HostmanSection.tsx` fetches data directly from the `blaze_results` table using `blazeSupabase`.
- The main page history (`app.tsx`) also fetches data from the `blaze_results` table using `blazeSupabase`.
- `SinaisSection.tsx` and `PredictiveSignals.tsx` also fetch from `blaze_results`.
- The issue is likely that `HostmanSection` performs its own standalone query without the real-time synchronization, deduplication, or complex filtering used in the main application.

## Proposed Changes

### 1. Data Source Unification

- Instead of `HostmanSection` having its own `useEffect` for fetching, it should ideally use a shared data source if possible, or at least replicate the logic from `app.tsx`.
- However, since `app.tsx` and `HostmanSection` are different routes/sections, the most robust way to ensure they see the same "stones" is to ensure `HostmanSection` uses the same normalization and filtering logic.

### 2. Implementation Details

- Update `HostmanSection.tsx` to:
  - Increase its fetch limit to match the application's context (if necessary).
  - Ensure it uses the same deduplication logic if duplicates are an issue in the raw table.
  - Add a real-time subscription (Supabase `.on()`) to the `blaze_results` table so it updates immediately when a new result comes in, just like the main history.

### 3. Verification Plan

- Open the dashboard history and the Hostman history side-by-side (or switch between them).
- Verify that the last result (the "stone") is identical in both.
- Wait for a new result to appear and confirm both sections update simultaneously.

## Technical Details

- Use `blazeSupabase` subscription in `HostmanSection.tsx`.
- Sync `PAGE_SIZE` or handling to ensure consistent "view" of recent history.
- Ensure `rowToSpin` normalization is identical across all components.
