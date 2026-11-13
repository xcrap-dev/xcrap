import {
    HtmlExtractionModel,
    HtmlParser,
    XmlExtractionModel,
    XmlParser,
    css,
    extract,
    xml,
    xpath,
} from "../src/extractor"
import { t, z } from "../src/transformer"

describe("xcrap README examples", () => {
    it("extracts from HTML and transforms with Zod schemas", async () => {
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

        expect(rawData).toEqual({
            name: "  Cool Gadget  ",
            price: "$1,099.99",
            inStock: "In stock",
            specsUrl: "/specs.pdf",
        })

        const productSchema = z.object({
            name: t.text(),
            price: t.price(),
            inStock: t.boolean({ truthy: ["in stock"], falsy: ["sold out"] }),
            specsUrl: t.url({ base: "https://myshop.com" }),
        })

        const product: z.infer<typeof productSchema> = productSchema.parse(rawData)

        expect(product).toEqual({
            name: "Cool Gadget",
            price: 1099.99,
            inStock: true,
            specsUrl: "https://myshop.com/specs.pdf",
        })
    })

    it("extracts from XML with the extractors of the xml namespace", async () => {
        const feed = `
        <rss>
          <channel>
            <item><title>First post</title><link>/posts/1</link><pubDate>2024-12-25T10:00:00Z</pubDate></item>
            <item><title>Second post</title><link>/posts/2</link><pubDate>2024-12-26T10:00:00Z</pubDate></item>
          </channel>
        </rss>
        `

        const itemModel = new XmlExtractionModel({
            title: { query: xpath("//title"), extractor: xml.extractText },
            url: { query: xpath("//link"), extractor: xml.extractText },
            publishedAt: { query: xpath("//pubDate"), extractor: xml.extractText },
        })

        const parser = new XmlParser(feed)
        const rawItems = await parser.extractModels({ query: xpath("//item"), model: itemModel })

        const itemSchema = z.object({
            title: t.text(),
            url: t.url({ base: "https://blog.com" }),
            publishedAt: t.date(),
        })

        expect(z.array(itemSchema).parse(rawItems)).toEqual([
            { title: "First post", url: "https://blog.com/posts/1", publishedAt: new Date("2024-12-25T10:00:00Z") },
            { title: "Second post", url: "https://blog.com/posts/2", publishedAt: new Date("2024-12-26T10:00:00Z") },
        ])
    })
})
