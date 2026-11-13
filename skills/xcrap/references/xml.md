# XML (RSS, Atom, sitemaps)

`XmlParser` and `XmlExtractionModel` (from `@xcrap/xml-extractor`, re-exported by `xcrap/extractor`) work like the HTML ones, but **queries are XPath only** and extractors receive XML DOM nodes.

## The name clash

`@xcrap/extractor` and `@xcrap/xml-extractor` both export `extractText`, `extractAttribute`, `extractRawText`, `extractTagName`, `extractLocalName`, `extractChildElementCount`, `matchRegexFrom`, `fromNextElementSibling` and `fromPreviousElementSibling`.

From `xcrap/extractor`, those names are the **HTML** versions. Use the **`xml` namespace** for XML models:

```ts
import { XmlParser, XmlExtractionModel, xml, xpath } from "xcrap/extractor"

title: { query: xpath("//title"), extractor: xml.extractText } // correct
title: { query: xpath("//title"), extractor: extractText }     // wrong: HTML extractor on an XML node
```

XML-only helpers have no clash and are available both ways: `extractInnerXml`, `extractOuterXml`, `extractNamespaceUri`, `extractAttributes`, `extractNumber`, `fromParent`.

## RSS

```ts
import { XmlParser, XmlExtractionModel, xml, xpath } from "xcrap/extractor"
import { t, z } from "xcrap/transformer"

const itemModel = new XmlExtractionModel({
    title: { query: xpath("//title"), extractor: xml.extractText },
    url: { query: xpath("//link"), extractor: xml.extractText },
    publishedAt: { query: xpath("//pubDate"), extractor: xml.extractText },
    categories: { query: xpath("//category"), extractor: xml.extractText, multiple: true },
})

const parser = new XmlParser(feedXml) // or response.asParser(XmlParser)
const rawItems = await parser.extractModels({ query: xpath("//item"), model: itemModel })

const items = z
    .array(z.object({ title: t.text(), url: t.url(), publishedAt: t.date(), categories: z.array(t.text()) }))
    .parse(rawItems)
```

Each nested/`extractModels` item is re-parsed on its own, so `//title` inside `itemModel` refers to the item's title, not the channel's.

## Namespaces (Atom, sitemaps, media RSS)

XPath without a namespace context does not match namespaced elements by prefix. Match on `local-name()`:

```ts
// sitemap.xml: <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>…</loc></url></urlset>
const urls = await new XmlParser(sitemap).extractValues({
    query: xpath("//*[local-name()='loc']"),
    extractor: xml.extractText,
})

// Atom link href
url: { query: xpath("//*[local-name()='link'][@rel='alternate']"), extractor: xml.extractAttribute("href") },
```

## Parser methods

`extractValue({ query?, extractor, default? })`, `extractValues({ query, extractor, limit? })`, `extractModel({ model, query? })`, `extractModels({ model, query, limit? })` — same semantics as `HtmlParser`. Missing nodes without `default` throw `XmlNodeNotFoundError`.
