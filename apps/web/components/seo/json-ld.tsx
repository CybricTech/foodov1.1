import type { JsonLdNode } from "@/lib/seo/json-ld";

/**
 * Emits a `<script type="application/ld+json">` block.
 *
 * The `<` escape is not optional. JSON-LD has to go in via
 * dangerouslySetInnerHTML (React would HTML-escape the quotes and break the
 * JSON), and this payload contains merchant-authored strings — names, menu item
 * descriptions. Without escaping, a description containing `</script>` would
 * close the tag early and everything after it becomes live markup: stored XSS
 * through the menu editor. Replacing every `<` with its unicode escape keeps the
 * JSON equivalent for parsers while making that impossible.
 */
export function JsonLd({ data }: { data: JsonLdNode | JsonLdNode[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
