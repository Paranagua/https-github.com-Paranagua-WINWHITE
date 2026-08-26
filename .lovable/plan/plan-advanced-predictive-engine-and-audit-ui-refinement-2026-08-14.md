# Plan: Advanced Predictive Engine and Audit UI Refinement

Restructure the predictive engine to include secondary analyses (#1-#9), implement signal unification with level elevation, and refine the audit dashboard to consume autonomous motor data with visual indicators like the Blue Verified Badge.

## Technical Details

### 1. Predictive Engine Enhancements (`src/lib/predictive.ts`)

- Implement `buildSecondaryAnalyses`: Logic for positions #1 to #9 using the same 1st/2nd stone reading as #0.
- Update `Cycle` type to support secondary analyses and verification flags.
- Export helpers for signal verification against secondary projections.

### 2. Signal Processing Logic (`src/components/double/PredictiveSignals.tsx`)

- **Secondary Analysis (#1-#9):**
  - Run analyses for minutes #1 to #9.
  - Match main signals (A1-A7) against these secondary projections.
  - Set `is_verified: true` and display the **Blue Check Badge (✓ Verified)** on match.
- **Unification & Level Elevation:**
  - Detect consecutive target minutes (e.g., 20:14, 20:15).
  - **2 consecutive:** Group into 1 card, use the highest assertive time, elevate level (e.g., Top 1 -> Top 1 + Confluence or Bronze).
  - **3+ consecutive:** Group into 1 card, use the **middle time**, elevate to ranking: Prata, Ouro, Diamante, or Supremo.
- **Hierarchical Medal Scale:**
  - Implement the 7-level scale: Top 1 Isolado, Top 1 + Confluência, Bronze 🥉, Prata 🥈, Ouro 🥇, Diamante 💎, Supremo 👑.
  - Maintain the "🔥 Alta Tendência" tag.

### 3. Audit Dashboard Refinement (`src/components/sections/SinaisSection.tsx`)

- **Default [Visão Geral]:** Show Top 5-10 strategies from the database.
- **[Rodadas Atuais]:** Filter and show accuracy/score strictly for active visible signals.
- **Simplified Calculation:** Use binary WIN (±1 min) / LOSS logic.
- **Real-time Sync:** Ensure the audit UI consumes data from the background autonomous motor without user interaction.

### 4. UI/UX Consistency

- Update `Card` components and `SinaisSection` table to show the new verified badges and hierarchical medals.
- Standardize stone formatting across all views.
