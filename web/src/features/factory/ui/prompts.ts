import type { FactoryBoard, FactoryNextPrompt, FactoryPrompt } from "../data/factoryTypes.ts";

const IMPLEMENT_PREFIX = "/factory:implement ";
const FINAL_REVIEW_SUFFIX = " — final review";

export interface PromptChoices {
  prompts: FactoryPrompt[];
  // Whether a prompt of the list takes the marker of the switch, so that the switch is shown only then.
  hasReviewSwitch: boolean;
  hasBrowserSwitch: boolean;
}

// FR-18: the mod's exported markers go at the end of a stage prompt (review), of the chained prompt (review) and of the
// autopilot prompt (browser test). The markers are the mod's, never literal strings here.
export function promptsOf(
  next: FactoryNextPrompt | null,
  markers: FactoryBoard["markers"],
  { isReview, isBrowser }: { isReview: boolean; isBrowser: boolean },
): PromptChoices {
  if (next === null) return { prompts: [], hasReviewSwitch: false, hasBrowserSwitch: false };
  const takesReview = next.prompt.startsWith(IMPLEMENT_PREFIX) && !next.prompt.endsWith(FINAL_REVIEW_SUFFIX);
  const prompts: FactoryPrompt[] = [
    { label: next.label, prompt: isReview && takesReview ? next.prompt + markers.review : next.prompt },
  ];
  const { all, autopilot } = next;
  if (all !== null) prompts.push({ label: all.label, prompt: isReview ? all.prompt + markers.review : all.prompt });
  if (autopilot !== null) {
    prompts.push({ label: autopilot.label, prompt: isBrowser ? autopilot.prompt + markers.browser : autopilot.prompt });
  }
  return { prompts, hasReviewSwitch: takesReview || all !== null, hasBrowserSwitch: autopilot !== null };
}
