import fr from "./fr.json";

const messages: Record<string, string> = fr;
const pluralRules = new Intl.PluralRules("fr-FR");
const countFormat = new Intl.NumberFormat("fr-FR");

// A missing key returns the key itself, so that it shows up in review.
export function t(key: string, params: Record<string, string | number> = {}): string {
  const message = messages[key] ?? key;
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}

// `{key}.one` or `{key}.other` after the French plural rule of `count`, which it receives as `{count}`.
export function tp(key: string, count: number, params: Record<string, string | number> = {}): string {
  // French also has a `many` category (exact millions): its wording is the `other` one.
  const category = pluralRules.select(count) === "one" ? "one" : "other";
  return t(`${key}.${category}`, { count: countFormat.format(count), ...params });
}
