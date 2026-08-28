import { formatMinor } from "@trocohq/core";

import type { CampaignPlan } from "../editorial/schema.js";

export function createThumbnailCopy(
  plan: Pick<CampaignPlan, "scenario">,
): string {
  const purchase = formatMinor(plan.scenario.purchaseMinor, "BRL", "pt-BR");
  const received = formatMinor(plan.scenario.receivedMinor, "BRL", "pt-BR");
  const question =
    plan.scenario.resultMinor === 0 ? "Tem troco?" : "Quanto volta?";
  return `${received} para pagar ${purchase}. ${question}`;
}
