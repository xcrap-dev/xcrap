---
name: xcrap
description: How to build web scrapers in Node.js/TypeScript with the Xcrap framework (the `xcrap` package and the `@xcrap/*` ecosystem). Use whenever code imports `xcrap`, `xcrap/core`, `xcrap/extractor`, `xcrap/transformer` or any `@xcrap/*` package, or when the user asks to scrape, crawl or extract data from HTML, JSON, Markdown or XML (RSS, Atom, sitemaps) with Xcrap — choosing an HTTP client, writing extraction models, cleaning data with Zod schemas, paginating, or fetching many pages.
---

# Xcrap

Xcrap splits every scraper into three decoupled layers. Keep them separate:

```
[ Client ]  ──HttpResponse──▶  [ Extractor ]  ──raw strings──▶  [ Transformer ]
 xcrap/core or @xcrap/*-client   xcrap/extractor                  xcrap/transformer
 fetch / fetchMany               declarative models               Zod schemas (t.*)
```

1. **Client** fetches a page and returns an `HttpResponse`.
2. **Extractor** turns the source into raw values using a declarative *extraction model* (CSS/XPath for HTML and Markdown, XPath for XML, JMESPath for JSON).
3. **Transformer** cleans, converts and validates those raw values with Zod schemas.

## Installation

```bash
npm install xcrap
```

`xcrap` bundles `@xcrap/core`, `@xcrap/extractor`, `@xcrap/xml-extractor`, `@xcrap/transformer` and `zod`. Import from the **subpaths** — the root `xcrap` entry exports nothing:

| Import | Contents |
| --- | --- |
| `xcrap/core` | `FetchClient`, `HttpClient`, `BaseClient`, `HttpResponse`, `Rotator`, `Randomizer`, `StaticPaginator`, `delay` |
| `xcrap/extractor` | `HtmlParser`, `JsonParser`, `MarkdownParser`, `XmlParser`, `*ExtractionModel`, `css`, `xpath`, extractors, `xml` namespace |
| `xcrap/transformer` | `t` (scraping schemas), every schema by name, `parseNumber`, and `z` (Zod re-export) |

This skill describes `@xcrap/core` ≥ 0.2.4, `@xcrap/extractor` ≥ 0.3.3 and the client releases that followed them (real status on failed responses, per-request proxies, XPath results with parent and siblings). Older versions differ in those points; upgrade if the behavior does not match.

Clients other than `FetchClient`/`HttpClient` are separate installs (`@xcrap/got-scraping-client`, `@xcrap/puppeteer-client`, …). See [references/clients.md](references/clients.md).

## End-to-end example

```ts
import { FetchClient } from "xcrap/core"
import { HtmlExtractionModel, css, extractText, extractHref } from "xcrap/extractor"
import { t, z } from "xcrap/transformer"

// 1. Extraction: what to read and where (raw strings only)
const productModel = new HtmlExtractionModel({
    name: { query: css(".product__title"), extractor: extractText },
    price: { query: css(".product__price"), extractor: extractText },
    url: { query: css("a.product__link"), extractor: extractHref },
    badge: { query: css(".product__badge"), extractor: extractText, default: null },
})

const pageModel = new HtmlExtractionModel({
    products: { query: css(".grid .product"), multiple: true, model: productModel },
})

// 2. Transformation: how to clean and validate it
const productSchema = (pageUrl: string) =>
    z.object({
        name: t.text(),
        price: t.price({ locale: "en-US" }),
        url: t.url({ base: pageUrl }),
        badge: t.text().nullable(),
    })

type Product = z.infer<ReturnType<typeof productSchema>>

// 3. Execution
export async function scrapeCatalog(pageUrl: string): Promise<Product[]> {
    const client = new FetchClient()
    const response = await client.fetch({ url: pageUrl, maxRetries: 2, retryDelay: 1000 })

    if (!response.isSuccess()) {
        throw new Error(`GET ${pageUrl} failed (${response.status}): ${response.text}`)
    }

    const { products } = await response.asHtmlParser().extractModel({ model: pageModel })

    return z.array(productSchema(pageUrl)).parse(products)
}
```

## Layer references

Read the reference that matches the task:

- [references/clients.md](references/clients.md) — choosing a client, `fetch`/`fetchMany`, retries, user agents, proxies, Puppeteer actions, pagination with `StaticPaginator`.
- [references/extraction.md](references/extraction.md) — `HtmlParser` and `HtmlExtractionModel`, extractors, nested models, embedded JSON (`__NEXT_DATA__`, JSON-LD), `JsonParser`/`JsonExtractionModel`, Markdown.
- [references/xml.md](references/xml.md) — RSS, Atom and sitemaps with `XmlParser`/`XmlExtractionModel`, and the HTML/XML extractor name clash.
- [references/transformation.md](references/transformation.md) — the `t.*` Zod schemas, locales, URLs, dates, optional fields, cross-field logic.

For conventions, project layout, testing and common mistakes, use the `xcrap-best-practices` skill.

## Other ecosystem packages

| Package | Use it for |
| --- | --- |
| `@xcrap/dom` | Extraction inside a browser (extensions, userscripts): `DomParser`, `DomExtractionModel`, same model style on the native DOM. Never ship `xcrap/extractor` to the browser. |
| `@xcrap/decryptor` | `injectDecryptor(client, config)` wraps a client so AES-encrypted response bodies arrive decrypted. |
| `@xcrap/image-text-extractor` | `extractImageText()` — an HTML extractor that runs OCR (tesseract) on an image element. |
| `@xcrap/factory` | `createClient` / `createExtractionModel` — build clients and models from plain config objects (e.g. JSON stored in a database). |

## Migrating from xcrap 2.x / @xcrap/parser

- `@xcrap/parser` is now `@xcrap/extractor`; `parser.parseFirst`/`parseMany` are now `extractValue`/`extractValues`/`extractModel`/`extractModels`.
- `Transformer`, `TransformingModel`, `transform()`, `StringTransformer`, `StringValidator` no longer exist. Replace each transforming model with a `z.object()` built from `t.*` schemas (see [references/transformation.md](references/transformation.md)).
- `fetchMany` takes `requests: [{ url }]`, not `urls`.
