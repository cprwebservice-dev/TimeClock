Time-Clock Enterprise V6.14.10 — Independent Team/Time Period State

- TEAM + TIME share one 15-day period state.
- PERSON keeps its own month independently.
- Fixed lower period context showing PERSON month instead of the active TEAM/TIME range.
- Prev/Next now updates both hidden period control and in-memory teamPeriodStart.
- Lower period UI is read-only compact context; the top navigator is the only controller.
- No SQL migration required.
