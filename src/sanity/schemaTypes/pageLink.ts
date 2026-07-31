import { defineField } from "sanity";
import { createPageLinkInput } from "../components/PageLinkInput";

/**
 * "Page link" — the first field on every document that has a slug, rendering
 * that document's public URL with a copy button. See PageLinkInput for how the
 * URL is built; this file only decides where the field appears.
 *
 * It stores nothing. The field exists purely to give the custom input a slot in
 * the form, so it never reaches the dataset and never shows up in a GROQ result.
 *
 * On a document with field groups it is assigned to every one of them, so it
 * stays pinned to the top whichever tab is open — the whole point being that
 * grabbing the link should never require hunting for the Route tab.
 */

type FieldGroup = { name: string; title?: string };

/** Component identities must be stable across renders — one per base path. */
const inputs = new Map<string, ReturnType<typeof createPageLinkInput>>();

function inputFor(basePath: string) {
  const existing = inputs.get(basePath);
  if (existing) return existing;
  const input = createPageLinkInput(basePath);
  inputs.set(basePath, input);
  return input;
}

/**
 * @param groups   The document's field groups, so the link shows on every tab.
 * @param basePath Route prefix the slug sits under — "" for root-level pages,
 *                 "/legal" for legal documents, "/careers" for job openings.
 */
export function pageLinkField(
  opts: { groups?: readonly FieldGroup[]; basePath?: string } = {},
) {
  const { groups, basePath = "" } = opts;
  const field = defineField({
    name: "pageLink",
    title: "Page link",
    type: "string",
    components: { input: inputFor(basePath) },
    description:
      "This page's address — click to open it, or Copy to share it. It follows the Route field below, and a change only reaches the live site once you publish.",
  });
  return groups?.length
    ? { ...field, group: groups.map((g) => g.name) }
    : field;
}
