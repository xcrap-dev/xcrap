---
name: xcrap-best-practices
description: Conventions, project structure, testing strategy and common mistakes for scrapers built with the Xcrap framework (`xcrap`, `@xcrap/*`). Use when writing, reviewing, refactoring or debugging an Xcrap scraper, when a scraper breaks after a site change, returns empty or wrong data, gets blocked, or when setting up a new scraping project. Complements the `xcrap` skill, which documents the API.
---

# Xcrap best practices

API details live in the `xcrap` skill. This skill is about *how* to build scrapers that stay correct and maintainable.

## Rules

1. **Three layers, never mixed.** Client fetches, extraction model reads raw strings, Zod schema cleans and validates. No `parseFloat`, `trim()` or URL joining inside extractors or execution code; no CSS selectors inside schemas.
2. **Declarative over imperative.** Describe data with `HtmlExtractionModel`/`JsonExtractionModel`/`XmlExtractionModel` instead of walking the DOM by hand. Add a custom extractor function only for element-level reads the built-ins cannot do.
3. **Lightest client that works.** `FetchClient` → `GotScrapingClient`/`ImpitClient` → Puppeteer clients. A browser is the last resort, not the default.
4. **Look for structured data first.** JSON endpoints (DevTools → Network), `__NEXT_DATA__`, JSON-LD and inline state are more stable than markup. Chain them with a nested field that has both `extractor` and `model`.
5. **Validate everything.** Every scraper output goes through a Zod schema and its type comes from `z.infer`/`z.output`. Never hand-write the output type.
6. **Fail loudly on required data, tolerate optional data explicitly.** Required fields: no `default` in the model, no `.catch()` in the schema — a site change should throw, not silently produce garbage. Optional fields: `default: null` in the model and `.nullable()`/`.optional()` in the schema, declared on purpose.
7. **Check `response.isSuccess()`.** Clients return failed requests as responses (the real status, or 500 when nothing was received) instead of throwing.
8. **Be polite and predictable.** Bounded `concurrency`, a `requestDelay`, `maxRetries` with `retryDelay`, a realistic user agent. Respect the site's terms and `robots.txt`, and do not collect personal data you are not allowed to.

## Project layout

One folder per target site, one file per concern:

```
src/scrapers/
└── example-store/
    ├── client.ts        # configured client instance (UA, proxy, retries)
    ├── models.ts        # extraction models (raw shape)
    ├── schemas.ts       # Zod schemas + exported types
    ├── scraper.ts       # fetch → extract → parse orchestration
    └── __tests__/
        ├── fixtures/    # saved HTML/JSON responses
        └── scraper.test.ts
```

- Models and schemas are pure and side-effect free, so they can be tested without network.
- Scraper functions take the client as a parameter (typed as `ClientInterface` from `xcrap/core`) so tests and callers can swap it.
- Name raw fields after what the page shows and clean fields after what your domain needs; do the renaming in the schema's `.transform()`.

```ts
// scraper.ts
import type { ClientInterface } from "xcrap/core"
import { z } from "xcrap/transformer"

import { listingModel } from "./models"
import { productSchema, type Product } from "./schemas"

export async function scrapeListing(client: ClientInterface, url: string): Promise<Product[]> {
    const response = await client.fetch({ url, maxRetries: 2, retryDelay: 1500 })

    if (!response.isSuccess()) {
        throw new Error(`GET ${url} -> ${response.status}`)
    }

    const raw = await response.asHtmlParser().extractModel({ model: listingModel })

    return z.array(productSchema(url)).parse(raw.products)
}
```

## Selectors that survive redesigns

- Prefer stable hooks: `id`, `data-*`, `itemprop`, ARIA attributes, semantic tags (`h1`, `article`, `time[datetime]`), over generated class names (`.css-1x2y3z`, `.sc-bdVaJa`).
- Keep selectors short and scoped by nested models: the card model uses `css("h2")`, not `css(".grid > div:nth-child(2) .card h2")`.
- Prefer `css()`. Use `xpath()` for text matching or axes (`following-sibling::`, `ancestor::`); it costs more because each query mirrors the document as XML.
- Read machine-readable attributes when available: `time[datetime]`, `meta[itemprop=price][content]`, `data-price`, instead of the formatted text.

## Data cleaning

- Pass `locale` to numeric schemas when you know the site's format; the separator heuristic cannot resolve `"1.234"` on its own.
- Build URL schemas per page (`t.url({ base: pageUrl })`) so relative links resolve against the page they came from.
- `extractText`/`extractTextContent` decode HTML entities; `extractInnerText`/`extractRawText` keep them. `t.text()` decodes and collapses whitespace either way.
- Parse lists item by item with `safeParse` when one broken card must not drop the page; log the failures instead of ignoring them.

## Testing

Test against saved fixtures, never against the live site in unit tests:

```ts
import { HtmlParser } from "xcrap/extractor"

import { listingModel } from "../models"
import { productSchema } from "../schemas"

it("extracts the listing", async () => {
    const parser = await HtmlParser.loadFile(`${__dirname}/fixtures/listing.html`)
    const raw = await parser.extractModel({ model: listingModel })
    const products = productSchema("https://example.com/c/1").array().parse(raw.products)

    expect(products).toHaveLength(24)
    expect(products[0]).toEqual({ name: "…", price: 129.9, url: "https://example.com/p/…" })
})
```

- Save fixtures from real responses (`response.text`), including an edge case (empty listing, missing optional field, last page).
- Test the schema separately with tricky strings (`"R$ 1.234,56"`, `"Esgotado"`, relative URLs).
- Keep a small, opt-in smoke test against the live site to detect markup changes early.

## Scale and resilience

- Batch with `fetchMany({ requests, concurrency, requestDelay })` and handle each response's success individually.
- Reuse one client instance per configuration; for Puppeteer clients, always `await client.close()` in a `finally`.
- Pass proxies as functions (`proxy: () => rotator.rotate()`) to rotate per request; credentials go in the proxy URL.
- Record `response.attempts` and `response.failedAttempts` in logs to spot blocking and flaky targets.

## Debugging checklist

When a scraper returns empty or wrong data:

1. **Is the response what you think?** Log `response.status` and save `response.text` to a file. Bot-protection pages, consent walls and login redirects return 200 with the wrong HTML.
2. **Is the data in the HTML at all?** If it only appears in the browser, it is rendered by JavaScript: find the JSON endpoint or embedded state before switching to Puppeteer.
3. **Does the selector match the fetched HTML?** Test it against the saved file with `HtmlParser.loadFile`, not against the browser DevTools DOM (which reflects JavaScript changes).
4. **`HTMLElementNotFoundError`?** A required field is missing on some items. Decide whether it is really optional (`default: null` + `.nullable()`) or the selector is wrong.
5. **Zod error?** Read the path in the issue (`products[3].price`) and inspect that raw value; usually a locale, a placeholder (`"Consulte"`) or an unexpected format.
6. **Blocked (403/429, captchas)?** Lower concurrency, add `requestDelay`, rotate user agents, then move to `GotScrapingClient`/`ImpitClient`, proxies, and only then a browser client.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| `import { HtmlParser } from "xcrap"` | Import from subpaths: `xcrap/core`, `xcrap/extractor`, `xcrap/transformer`. |
| Bare string queries: `query: ".title"` | Wrap with `css(".title")` / `xpath("…")`. JSON models are the exception (JMESPath strings). |
| HTML extractors in XML models | Use `xml.extractText`, `xml.extractAttribute(…)` from the `xml` namespace. |
| `fetchMany({ urls })` | `fetchMany({ requests: urls.map((url) => ({ url })) })`. |
| Parsing without checking the status | `if (!response.isSuccess()) …` before `asHtmlParser()`. |
| Cleaning inside the model (`extractor: (el) => parseFloat(…)`) | Extract the string, convert with `t.number()`/`t.price()`. |
| `default` on every field "to be safe" | Defaults only on truly optional fields; required ones should fail. |
| `extractor` without `query` to read a card's attribute | Query the card itself inside its model: `{ query: css(".card"), extractor: extractAttribute("data-id") }`. |
| Using `TransformingModel` / `@xcrap/parser` | Removed. Use `z.object()` with `t.*`, and `@xcrap/extractor`. |
| `@xcrap/extractor` in a browser extension or userscript | Use `@xcrap/dom`. |
| Forgetting `client.close()` with Puppeteer | `try { … } finally { await client.close() }`. |
