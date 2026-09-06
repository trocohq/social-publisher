import { designTokens } from "@trocohq/design-tokens";
import type { VerticalTreatment } from "./vertical-treatment.js";

export type LessonIllustration = "receipt" | "calculator" | "checklist";

export function lessonIllustrationFor(headline: string): LessonIllustration {
  if (/pix|pagamento|chave/i.test(headline)) return "receipt";
  if (/\d|%|peças|troco/i.test(headline)) return "calculator";
  return "checklist";
}

export function lessonAccent(treatment: VerticalTreatment): string {
  return treatment.id === "yellow" || treatment.id === "primary"
    ? designTokens.colors.purple
    : treatment.id === "coral"
      ? designTokens.colors.blue
      : designTokens.colors.yellow;
}

export function lessonIllustrationSvg(
  kind: LessonIllustration,
  top: number,
  treatment: VerticalTreatment,
): string {
  const ink = designTokens.colors.ink;
  const paper = designTokens.colors.paper;
  const accent = lessonAccent(treatment);
  const common = `fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"`;
  const content =
    kind === "receipt"
      ? `<path d="M-63 14H49L67 32V144L51 135 35 144 19 135 3 144-13 135-29 144-45 135-63 144Z" fill="${paper}" stroke="${ink}" stroke-width="4"/>
       <path d="M-39 43H25M-39 65H10M-39 88H-11M-39 111H-15" ${common}/>
       <circle cx="50" cy="103" r="31" fill="${accent}" stroke="${ink}" stroke-width="4"/>
       <path d="M36 103L46 113 65 92" ${common}/>`
      : kind === "calculator"
        ? `<rect x="-60" y="12" width="120" height="140" rx="15" fill="${paper}" stroke="${ink}" stroke-width="4"/>
         <rect x="-42" y="30" width="84" height="29" rx="5" fill="${accent}" stroke="${ink}" stroke-width="3"/>
         <path d="M-38 81H-25M-31.5 74.5V87.5M6 81H19M-38 113L-25 126M-25 113L-38 126M6 114H19M6 124H19" ${common}/>`
        : `<rect x="-65" y="20" width="130" height="132" rx="9" fill="${paper}" stroke="${ink}" stroke-width="4"/>
         <rect x="-29" y="9" width="58" height="25" rx="7" fill="${accent}" stroke="${ink}" stroke-width="4"/>
         <path d="M-44 61L-37 68-25 52M-44 95L-37 102-25 86M-10 61H42M-10 95H42M-10 126H25" ${common}/>`;
  return `<g data-lesson-illustration="${kind}" aria-hidden="true" transform="translate(0 ${top})">
    <path d="M-81 30Q-50 2 10 10Q74 15 91 75Q98 141 35 154Q-37 163-76 125Q-107 76-81 30Z" fill="${accent}"/>
    ${content}
  </g>`;
}
