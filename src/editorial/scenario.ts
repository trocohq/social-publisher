import { buildDenominationBreakdown, calculateChange } from "@trocohq/core";

import { scenarioSchema, type Scenario } from "./schema.js";

export function createScenario(
  purchaseMinor: number,
  receivedMinor: number,
): Scenario {
  const result = calculateChange({ purchaseMinor, receivedMinor });
  const breakdown =
    result.outcome === "change_due"
      ? buildDenominationBreakdown(result.resultMinor, "BRL").map(
          ({ denomination, quantity }) => ({
            denominationMinor: denomination.valueMinor,
            quantity,
          }),
        )
      : [];

  return scenarioSchema.parse({
    purchaseMinor,
    receivedMinor,
    resultMinor: result.resultMinor,
    outcome: result.outcome,
    breakdown,
  });
}
