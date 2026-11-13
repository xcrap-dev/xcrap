# 🕷️ xcrap

**xcrap** is a web scraping framework for Node.js. This package bundles the basic Xcrap packages into a single install, so you can extract data from HTML, JSON, Markdown and XML with declarative models and then clean and validate it with [Zod](https://zod.dev) schemas.

---

## 📦 Installation

```bash
npm install xcrap
```

Everything below comes with it, no extra installs needed:

| Import | Bundles | What it is for |
| --- | --- | --- |
| `xcrap/core` | [`@xcrap/core`](https://www.npmjs.com/package/@xcrap/core) | `HttpClient`, `BaseClient`, `Randomizer`, `Rotator`, proxy and pagination support |
| `xcrap/extractor` | [`@xcrap/extractor`](https://www.npmjs.com/package/@xcrap/extractor) + [`@xcrap/xml-extractor`](https://www.npmjs.com/package/@xcrap/xml-extractor) | Declarative extraction from HTML, JSON, Markdown and XML |
| `xcrap/transformer` | [`@xcrap/transformer`](https://www.npmjs.com/package/@xcrap/transformer) + [`zod`](https://www.npmjs.com/package/zod) | Ready-made Zod schemas for scraped data, plus `z` itself |

HTTP clients (`@xcrap/axios-client`, `@xcrap/puppeteer-client`, …) are separate packages; install the one you need.

---

## 📚 Quick Start

### 1. Extraction

Extract raw data from an HTML source using `HtmlParser` and `HtmlExtractionModel`.

```typescript
import { HtmlParser, HtmlExtractionModel, css, extract } from "xcrap/extractor"

const html = `
<html>
  <body>
    <div class="product">
      <h1 id="title">  Cool Gadget  </h1>
      <span class="price">$1,099.99</span>
      <span class="stock">In stock</span>
      <a href="/specs.pdf">Download Specs</a>
    </div>
  </body>
</html>
`

const extractionModel = new HtmlExtractionModel({
    name: { query: css("#title"), extractor: extract("innerText") },
    price: { query: css(".price"), extractor: extract("innerText") },
    inStock: { query: css(".stock"), extractor: extract("innerText") },
    specsUrl: { query: css("a"), extractor: extract("href") },
})

const parser = new HtmlParser(html)
const rawData = await parser.extractModel({ model: extractionModel })

console.log(rawData)
/*
{
    name: "  Cool Gadget  ",
    price: "$1,099.99",
    inStock: "In stock",
    specsUrl: "/specs.pdf"
}
*/
```

### 2. Transformation

Scraped values are messy strings. `xcrap/transformer` gives you field schemas (`t.*`) that solve the common cases and compose with everything Zod offers. `z` is re-exported, so you do not need to install Zod yourself.

```typescript
import { t, z } from "xcrap/transformer"

const productSchema = z.object({
    name: t.text(),
    price: t.price(),
    inStock: t.boolean({ truthy: ["in stock"], falsy: ["sold out"] }),
    specsUrl: t.url({ base: "https://myshop.com" }),
})

type Product = z.infer<typeof productSchema>

const product = productSchema.parse(rawData)

console.log(product)
/*
{
    name: "Cool Gadget",
    price: 1099.99,
    inStock: true,
    specsUrl: "https://myshop.com/specs.pdf"
}
*/
```

### 3. XML (RSS, Atom, sitemaps)

XML extraction is also exported from `xcrap/extractor`. Queries are XPath only.

```typescript
import { XmlParser, XmlExtractionModel, xml, xpath } from "xcrap/extractor"
import { t, z } from "xcrap/transformer"

const itemModel = new XmlExtractionModel({
    title: { query: xpath("//title"), extractor: xml.extractText },
    url: { query: xpath("//link"), extractor: xml.extractText },
    publishedAt: { query: xpath("//pubDate"), extractor: xml.extractText },
})

const parser = new XmlParser(feed)
const rawItems = await parser.extractModels({ query: xpath("//item"), model: itemModel })

const items = z
    .array(
        z.object({
            title: t.text(),
            url: t.url({ base: "https://blog.com" }),
            publishedAt: t.date(),
        }),
    )
    .parse(rawItems)
```

> [!IMPORTANT]
> The HTML and XML packages both have extractors named `extractText`, `extractAttribute`, `extractRawText`, `extractTagName`, `extractLocalName`, `extractChildElementCount`, `matchRegexFrom`, `fromNextElementSibling` and `fromPreviousElementSibling`. Imported directly from `xcrap/extractor` they are the **HTML** ones; the XML ones are in the **`xml`** namespace (`xml.extractText`). Everything else from `@xcrap/xml-extractor` (`XmlParser`, `XmlExtractionModel`, `extractInnerXml`, `extractNumber`, …) is available both ways.

---

## 📖 Core Concepts

### Extractor (`xcrap/extractor`)

- **`HtmlParser`**, **`JsonParser`**, **`MarkdownParser`**, **`XmlParser`**: parse a source and extract single values, lists or whole models.
- **`HtmlExtractionModel`**, **`JsonExtractionModel`**, **`MarkdownExtractionModel`**, **`XmlExtractionModel`**: declare the shape of the data you want, with queries (`css`, `xpath`, JMESPath strings) and extractors. Models can be nested inside each other, across formats.

### Transformer (`xcrap/transformer`)

Functions that return plain Zod schemas, used inside a regular `z.object()`:

| Schema | Example |
| --- | --- |
| `t.text()` | `" Tom &amp;
 Jerry "` → `"Tom & Jerry"` |
| `t.number()` / `t.integer()` | `"1.234,56 un."` → `1234.56` |
| `t.price()` | `"R$ 1.234,56"` → `1234.56` |
| `t.percentage()` / `t.rating()` | `"85%"` → `0.85` |
| `t.boolean()` | `" Sim "` → `true` |
| `t.url()` | `"../b?x=1"` → `"https://site.com/b?x=1"` |
| `t.date()` | `"25/12/2024"` → `Date` |
| `t.match(regex, group)` | `"SKU: AB12"` → `"AB12"` |
| `t.json(schema?)` | `'{"a":1}'` → `{ a: 1 }` |

Optional values, defaults, fallbacks and cross-field logic are plain Zod (`.optional()`, `.default()`, `.catch()`, `.transform()`). See the [`@xcrap/transformer` README](https://www.npmjs.com/package/@xcrap/transformer) for every option.

> Coming from `xcrap` 2.x? `Transformer`, `TransformingModel`, `transform()` and the `StringTransformer` / `StringValidator` namespaces no longer exist. Replace each transforming model with a `z.object()` built from the schemas above.

---

## 🤖 AI Agent Skills

This package ships [Agent Skills](https://agentskills.io) that teach AI coding agents (Claude Code, Cursor, Codex, …) how to use Xcrap correctly. They live in [`skills/`](./skills) and are included in the npm package:

| Skill | What it covers |
| --- | --- |
| [`xcrap`](./skills/xcrap/SKILL.md) | How to use the framework: clients, extraction models (HTML, JSON, Markdown, XML), Zod transformation, pagination, batching. Detailed references in [`skills/xcrap/references`](./skills/xcrap/references). |
| [`xcrap-best-practices`](./skills/xcrap-best-practices/SKILL.md) | Conventions, project layout, resilient selectors, testing with fixtures, debugging checklist and common mistakes. |

Install them with the [`skills`](https://github.com/vercel-labs/skills) CLI:

```bash
npx skills add Xcrap-Cloud/xcrap
```

Or copy them from `node_modules` into your agent's skills folder, for example for Claude Code:

```bash
cp -r node_modules/xcrap/skills/* .claude/skills/
```

---

## 🤝 Contributing

We welcome contributions! Whether it's fixing bugs, improving documentation, or adding new features.

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes (`git commit -m 'Add some amazing feature'`).
4.  Push to the branch (`git push origin feature/amazing-feature`).
5.  Open a Pull Request.

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
