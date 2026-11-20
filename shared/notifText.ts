/**
 * Notification text marks its key details (names, dates, scores, courts, IDs) with **double asterisks**.
 * New notifications are written that way; `emphasise` adds the marks to older plain-text ones
 * by recognising the sentences 30-All has always used. `plain` strips the marks for email.
 */
const LEGACY: Array<[RegExp, string]> = [
  [/^(.+?) (submitted (?:a|your doubles) score (?:vs you )?from) (.+?): (.+?) \((your side first)\)/, "**$1** $2 **$3**: **$4** ($5)"],
  [/^(.+?) (submitted your doubles score from) (.+?): (.+?)\. /, "**$1** $2 **$3**: **$4**. "],
  [/^(.+?) (accepted the score from) (.+?) \((.+?)\)\./, "**$1** $2 **$3** (**$4**)."],
  [/^(.+?) (rejected the score from) (.+?) \((.+?)\)\./, "**$1** $2 **$3** (**$4**)."],
  [/^(.+?) (deleted a pending score from) (.+?) \((.+?)\)\./, "**$1** $2 **$3** (**$4**)."],
  [/^The score from (.+?) \((.+?)\) wasn't accepted/, "The score from **$1** (**$2**) wasn't accepted"],
  [/^Good news: (.+?) was approved/, "Good news: **$1** was approved"],
  [/^(.+?) wasn't approved, so/, "**$1** wasn't approved, so"],
  [/^(.+?) matched an existing court, (.+?)\. Your profile now shows (.+?)\.$/, "**$1** matched an existing court, **$2**. Your profile now shows **$3**."],
  [/home court to (.+?)\. You can/, "home court to **$1**. You can"],
  [/Your player ID is ([A-Z]{2}\d+)\./, "Your player ID is **$1**."],
];

export function emphasise(text: string): string {
  if (text.includes("**")) return text;
  for (const [re, to] of LEGACY) if (re.test(text)) return text.replace(re, to);
  return text;
}

export const plain = (text: string) => text.replace(/\*\*/g, "");
