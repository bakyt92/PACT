import { Exa } from "exa-js";
import { z } from "zod";
import type { SearchProvider, SearchResult } from "../runtime/ports";
import { PactError } from "../runtime/errors";

const hitSchema = z.object({
  title: z.string().nullable().optional(),
  url: z.url(),
  highlights: z.array(z.string()).optional(),
  text: z.string().optional(),
});

function safePublicUrl(value: string): string {
  const url = new URL(value);
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password
  ) {
    throw new PactError("SEARCH_RESULT_INVALID", "Exa returned an unsafe source URL.", 502);
  }
  return url.toString();
}

export class ExaSearchProvider implements SearchProvider {
  constructor(private readonly apiKey: string) {}

  async search(input: {
    query: string;
    context: Parameters<SearchProvider["search"]>[0]["context"];
    maxResults: number;
  }): Promise<SearchResult[]> {
    const exa = new Exa(this.apiKey);
    const query = `${input.query}\nMarket: ${input.context.market}\nCategory rule: ${input.context.categoryRule}`;
    const response = await exa.searchAndContents(query, {
      type: "fast",
      numResults: input.maxResults,
      highlights: { numSentences: 2, highlightsPerUrl: 1 },
      text: { maxCharacters: 600 },
    });
    return response.results.map((candidate) => {
      const hit = hitSchema.parse(candidate);
      return {
        title: (hit.title || hit.url).slice(0, 300),
        url: safePublicUrl(hit.url),
        excerpt: (hit.highlights?.[0] || hit.text || "No excerpt returned.").slice(
          0,
          900,
        ),
      };
    });
  }
}

