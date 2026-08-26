export const campaignFamilies = [
  "change_challenge",
  "cashier_shortcut",
  "troco_explains",
  "quick_calculation",
  "safe_checkout",
  "checkout_situation",
  "save_this_rule",
] as const;

export type CampaignFamily = (typeof campaignFamilies)[number];

const familyByUtcWeekday: Readonly<Record<number, CampaignFamily>> = {
  0: "save_this_rule",
  1: "change_challenge",
  2: "cashier_shortcut",
  3: "troco_explains",
  4: "quick_calculation",
  5: "safe_checkout",
  6: "checkout_situation",
};

export function campaignFamilyForDate(localDate: string): CampaignFamily {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    throw new Error("Invalid local date");
  }

  const parsed = new Date(`${localDate}T12:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== localDate) {
    throw new Error("Invalid local date");
  }

  return familyByUtcWeekday[parsed.getUTCDay()]!;
}
