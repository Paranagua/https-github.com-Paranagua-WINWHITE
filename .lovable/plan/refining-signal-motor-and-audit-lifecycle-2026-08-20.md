# Refining Signal Motor and Audit Lifecycle

This plan refines the predictive engine logic, restructuring the "Green Seal" mechanism, correcting assertivity calculations to be dynamic rather than fixed, and implementing proximity filters for "Top 1" signals.

## User-facing changes

- **Green Seal (Selo Verde)**: Now functions as a confirmation badge on existing signal cards instead of generating independent cards.
- **Dynamic Assertivity**: Signal cards will display real-time win rates based on historical data rather than static 100% values.
- **Improved Feed Quality**: The system will automatically filter out overlapping "Top 1" signals in consecutive minutes, prioritizing the highest quality predictions.

## Technical details

- **Logic Refinement**:
  - Update `src/lib/predictive.ts` to remove the `pedra anterior >= 2` constraint from `buildSeloVerde`.
  - Modify `src/components/double/PredictiveSignals.tsx` to stop generating cards for soma 17, 19, 21, and 7-11/11-7 triggers. Instead, these will be used to flag the `isGreenSeal` property on other active signals.
- **Assertivity Calculation**:
  - Introduce `src/lib/signalStatsStore.ts` (Zustand with persistence) to track `green` vs `red` outcomes per strategy.
  - Update `SinaisSection.tsx` to call `updateStats` when a signal transitions from `pending` to `green` or `red`.
  - Update card rendering to use `getAssertivity(strategyKey)` for the percentage display.
- **Proximity Filtering**:
  - Implement a sorting and filtering pass in `PredictiveSignals.tsx` to detect "Top 1 + Confluência" signals in consecutive minutes.
  - Logic: Keep the one with more confluences; if equal, keep the later one (giving users more time).
- **Rarity Badge**:
  - Restrict the "RARO" badge to "Top 1" signals that meet high-confluence criteria after proximity filtering.
