# Emergency Restore and New Audit Dashboard Plan

The objective is to revert unstable changes to the predictive motor while implementing a new consolidated Audit Dashboard at the top of the "Sinais" section.

## User Review Required

> [!IMPORTANT]
>
> - Reverting the predictive motor will restore the previously stable logic for 7 analyses and 120-minute window.
> - The new "Top Summary" card will follow the visual pattern: `[Analysis/Source] · [Type/Level] · [🔥 High Tendency] · [Qty Analyzed] · [% Assertiveness]`.
> - Filters "Current Rounds" (default) and "General Overview" will be implemented in this new card.

## Proposed Changes

### 1. Emergency Restore

- Revert `src/lib/predictive.ts`, `src/lib/useGatilhos.ts`, and `src/components/double/PredictiveSignals.tsx` to the state requested (ensuring 120m/14 tempos logic is stable).
- Fix the "This page didn't load" error which is likely caused by a runtime exception in the data processing loop or a missing import.

### 2. New Summary Card (Audit Dashboard)

- **Location**: Positioned at the very top of `SinaisSection.tsx`, above the projections.
- **Visuals**: Premium glassmorphism card with horizontal stats layout.
- **Content**:
  - Placar/Scoreboard based on the current cycle (WIN DIRECT or WIN MARGIN vs LOSS).
  - Assertiveness percentage calculation based on binary results (1 win max per prediction).
- **Filter logic**:
  - **Current Rounds**: Filter audit logs from the most recent cycle.
  - **General Overview**: Historical view (Today, Yesterday, etc.).

### 3. Logic & Validation

- **Binary Outcome**: TARGET MINUTE ±1 min = WIN. Otherwise = LOSS.
- **Deduplication**: Ensure multiple whites in the same 3-minute window only count as one WIN.

## Technical Details

- **Database**: Use the existing `historico_sinais_audit` table to fetch data for the summary.
- **State Management**: Use local React state for the toggle filters.
- **Components**: Modify `src/components/sections/SinaisSection.tsx` to include the new `SummaryHeader` component.
