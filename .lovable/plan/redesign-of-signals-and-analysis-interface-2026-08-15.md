# Redesign of Signals and Analysis Interface

Redesign the user interface to separate Signals and Analyses into two dedicated tabs within the `Sinais` section, following the "Freitas White" premium style.

## User Changes

### Tab 1: "ANÁLISES" (Intelligence & Audit)

- **Strategy Ranking**: Cards or table showing performance of strategies A1 to A9.
- **Real-time Metrics**: Display assertiveness %, WIN/LOSS counts, and "🔥 High Trend" badges.
- **Pattern Details**: Transparency for A8 (Double White) and A9 (Bread of White) with their specific formulas and recent triggers.

### Tab 2: "SINAIS" (Live Feed)

- **Actionable Signal Cards**: Only show unified signals active for the target window (±1 min).
- **Advanced Indicators**:
  - **Verified Badge**: Blue seal for signals confirmed by secondary analyses (#1-#9).
  - **💎 RARE Badge**: Highlight when 2+ Top 1 strategies align.
- **Traceability**: Tags on each signal card linking back to the source strategy (e.g., "Strategy A9") with tooltips.

## Technical Details

### Components & Logic

- **`SinaisSection.tsx`**: Add a local state for tab selection (`sinais` | `analises`).
- **State Management**:
  - Centralize A1-A9 assertiveness calculation in a shared utility or inside `SinaisSection`.
  - `predictiveList` will feed the "SIGNALS" tab.
  - `historico_sinais_audit` data will feed the "ANALYSES" ranking.
- **UI Components**:
  - Create a `StrategyRankingCard` for the Analyses tab.
  - Enhance `SignalCard` (inside `PredictiveSignals`) with source tags and RARE badges.
  - Implement a tooltipped badge component for strategy details.

### Data Flow

- The background auditor already saves results to `historico_sinais_audit`. I will use these rows to calculate the Top ranking dynamically.
- "High Trend" will be determined by checking if the last 3 outcomes for a strategy were WINs.
