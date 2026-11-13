# Extraction

Everything here is imported from `xcrap/extractor` (or `@xcrap/extractor`).

## Queries

Queries are always wrapped in a query builder, never passed as bare strings (except JMESPath in JSON models):

```ts
import { css, xpath } from "xcrap/extractor"

css(".card > h2")
xpath("//div[@class='card']/h2")
```

Prefer `css()`: it runs directly on the parsed tree. Use `xpath()` for what CSS cannot express (matching by text, `following-sibling::`, `ancestor::`, `count()`); each XPath query builds an XML mirror of the document, so it costs more. XPath results that are not elements (`//a/@href`, `//p/text()`, `count(//li)`) are exposed as text, so `extractText` reads them.

## HtmlParser

```ts
import { HtmlParser, css, extractText, extractHref } from "xcrap/extractor"

const parser = new HtmlParser(html)               // or response.asHtmlParser()
const fromFile = await HtmlParser.loadFile("./fixtures/page.html")

await parser.extractValue({ query: css("h1"), extractor: extractText })                // first match
await parser.extractValue({ query: css(".promo"), extractor: extractText, default: null })
await parser.extractValues({ query: css("a"), extractor: extractHref, limit: 10 })     // all matches
await parser.extractModel({ model: pageModel })                                         // whole document
await parser.extractModel({ model: detailsModel, query: css("#details") })              // first match only
await parser.extractModels({ model: cardModel, query: css(".card"), limit: 20 })        // one result per match
```

`extractValue` throws `HTMLElementNotFoundError` when nothing matches and no `default` is given. `extractValues`/`extractModels` return `[]`.

## Extractors

An extractor is a function `(element) => string | undefined` (it may be async). Built-ins:

| Kind | Extractors |
| --- | --- |
| Text | `extractText` and `extractTextContent` (entities decoded), `extractInnerText` and `extractRawText` (entities kept, e.g. `&amp;`) |
| Markup | `extractInnerHtml`, `extractOuterHtml`, `extractTagName`, `extractId`, `extractClassList`, `extractClassNames` |
| Attributes | `extractHref`, `extractSrc`, `extractValue`, `extractTitle`, `extractName`, `extractType`, `extractRole`, `extractStyle`, `extractPlaceholder`, `extractAriaLabel`, `extractChecked`, `extractSelected`, `extractDisabled`, … |
| Generic | `extractAttribute("data-sku")`, `extract("innerText")`, `extract("data-id", true)` |
| Combinators | `fromNextElementSibling(ext)`, `fromPreviousElementSibling(ext)`, `matchRegexFrom(ext, /re/g, index?)` |

- `extract(key)` reads an element property when `key` is a known property (`innerText`, `outerHTML`, …) and otherwise an attribute; pass `true` as second argument to force an attribute.
- Attributes return `undefined` when absent.
- `fromNextElementSibling(ext, { shouldExists: false })` returns `undefined` instead of throwing when there is no sibling. Typical use: definition lists and label/value tables.

```ts
// <dt>Brand</dt><dd>Acme</dd>
brand: { query: xpath("//dt[text()='Brand']"), extractor: fromNextElementSibling(extractText) },
// or let XPath take the sibling step itself:
brand: { query: xpath("//dt[text()='Brand']/following-sibling::dd[1]"), extractor: extractText },

// "Ref: 123 / Lot: 456" -> ["123", "456"] (capture group 1 of each match; needs the g flag)
codes: { query: css(".refs"), extractor: matchRegexFrom(extractText, /: (\d+)/g) },
ref:   { query: css(".refs"), extractor: matchRegexFrom(extractText, /: (\d+)/g, 0) },
```

A custom extractor is just a function, which is the right place for anything element-level the built-ins do not cover:

```ts
import type { ExtractorFunction } from "xcrap/extractor"

const extractBackgroundImage: ExtractorFunction = (el) => el.getAttribute("style")?.match(/url\(["']?(.*?)["']?\)/)?.[1]
```

Keep extractors about *reading*; parsing numbers, dates and URLs belongs in the transformer layer.

## HtmlExtractionModel

A model declares one field per key:

```ts
const cardModel = new HtmlExtractionModel({
    title:  { query: css("h2"), extractor: extractText },
    image:  { query: css("img"), extractor: extractSrc, default: null }, // optional element
    tags:   { query: css(".tag"), extractor: extractText, multiple: true }, // string[]
    top3:   { query: css(".tag"), extractor: extractText, multiple: true, limit: 3 },
    sku:    { query: css(".card"), extractor: extractAttribute("data-sku") }, // the card's own attribute
})
```

| Option | Meaning |
| --- | --- |
| `query` | Where to look. Omit it to run the extractor on the document root (fine for text, useless for attributes). Required with `multiple`. |
| `extractor` | What to read from the matched element. |
| `default` | Returned when the element is missing. **Without it a missing element throws `HTMLElementNotFoundError`.** |
| `multiple` | Read every match into an array (empty array when none). |
| `limit` | Max items with `multiple`. |
| `model` | Nested model, applied to the matched element(s). |

Types are inferred: `Awaited<ReturnType<typeof model.extract>>` gives the raw shape.

### Nested models

```ts
const pageModel = new HtmlExtractionModel({
    category: { query: css("h1"), extractor: extractText },
    products: { query: css(".card"), multiple: true, model: cardModel }, // one object per card
    seller:   { query: css(".seller"), model: sellerModel },                     // single object
})
```

Each nested model runs on the matched element's `outerHTML`, so its queries are relative to that element — and the element itself still matches, which is how you read the card's own attributes (`query: css(".card")` inside `cardModel`). Models are reusable and composable — define small models per component (card, seller box, pagination) and assemble the page model from them.

### Embedded JSON (`__NEXT_DATA__`, JSON-LD, inline state)

A nested field with both `model` **and** `extractor` feeds the extractor's output into the nested model. This chains formats: HTML → JSON.

```ts
import { HtmlExtractionModel, JsonExtractionModel, css, extractText } from "xcrap/extractor"

const nextDataModel = new JsonExtractionModel({
    name: { query: "props.pageProps.product.name" },
    price: { query: "props.pageProps.product.price.amount" },
    images: { query: "props.pageProps.product.images[*].url", default: [] },
})

const pageModel = new HtmlExtractionModel({
    product: { query: css("script#__NEXT_DATA__"), extractor: extractText, model: nextDataModel },
})
```

Prefer embedded JSON over scraping rendered markup when it exists: it is structured, typed and changes less often than CSS classes.

## JSON

`JsonExtractionModel` fields use [JMESPath](https://jmespath.org) queries:

```ts
import { JsonParser, JsonExtractionModel } from "xcrap/extractor"

const model = new JsonExtractionModel({
    total: { query: "meta.total", default: 0 },
    names: { query: "data[*].name" },
    // JMESPath projection: list of objects with renamed keys
    items: { query: "data[*].{ id: id, name: attributes.title, price: attributes.price.value }" },
    first: { query: "data[0]", model: itemModel },                // nested JsonExtractionModel
    all:   { query: "data", model: itemModel, multiple: true, limit: 50 }, // one object per item
})

const parser = new JsonParser(jsonString) // or response.asJsonParser()
parser.extract("data[0].name")           // ad hoc JMESPath query
const data = await parser.extractWithModel(model)
```

- `default` is used when the query returns `null` (missing path).
- For lists of objects use either a JMESPath projection (`data[*].{ ... }`) or a nested model with `multiple: true`, and validate the result with a Zod array schema.
- A nested JSON model receives the value as JSON. A nested HTML/Markdown model receives the value itself, which must be a string (e.g. an HTML snippet stored in the JSON).
- `JsonParser` has `extract(query)` and `extractWithModel(model)`; it has no `extractModel`/`extractModels`.

## Markdown

`MarkdownParser` and `MarkdownExtractionModel` render Markdown to HTML (headings get slug ids via markdown-it-anchor) and then behave exactly like their HTML counterparts, with the same shape options and CSS/XPath queries:

```ts
import { MarkdownParser, MarkdownExtractionModel, css, extractText, extractHref } from "xcrap/extractor"

const model = new MarkdownExtractionModel({
    title: { query: css("h1"), extractor: extractText },
    links: { query: css("a"), extractor: extractHref, multiple: true },
})

const data = await new MarkdownParser(markdown).extractModel({ model })
```

## Custom models

Anything with `extract(source: string): T | Promise<T>` is an `ExtractionModel` and can be nested inside the built-in models or passed to `extractModel`. Use this to plug in a format Xcrap does not cover.
