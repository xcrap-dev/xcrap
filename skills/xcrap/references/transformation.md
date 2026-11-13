# Transformation

Transformation is plain [Zod](https://zod.dev). `xcrap/transformer` adds `t.*`, field schemas for typical scraped strings, and re-exports `z`, so no separate Zod install is needed.

```ts
import { t, z } from "xcrap/transformer"
```

## Field schemas

| Schema | Input → output | Options |
| --- | --- | --- |
| `t.text()` | `" Tom &amp;\n Jerry "` → `"Tom & Jerry"` | `collapse` (default true), `decodeEntities` (default true), `stripTags` |
| `t.number()` | `"1.234,56 un."` → `1234.56` | `locale`, `compact`, `min`, `max` |
| `t.integer()` | `"12 reviews"` → `12` | `locale`, `compact`, `min`, `max` |
| `t.price()` | `"R$ 1.234,56"` → `1234.56` | `locale`, `min`, `max` |
| `t.percentage()` | `"85%"` → `0.85` | `locale`, `min`, `max` |
| `t.rating()` | `"4,5 de 5"` → `4.5` | `locale`, `max` |
| `t.boolean()` | `" Sim "` → `true` | `truthy`, `falsy` (case, accents and spaces ignored) |
| `t.url()` | `"../b?x=1"` → `"https://site.com/b?x=1"` | `base`, `protocols` (default http/https) |
| `t.date()` | `"25/12/2024"` → `Date` | `format` (date-fns), `locale` (date-fns locale), `unit` (`"ms"`/`"s"` for timestamps) |
| `t.match(regex, group)` | `"SKU: AB12"` → `"AB12"` | group index or name |
| `t.json(schema?)` | `'{"a":1}'` → `{ a: 1 }` | Zod schema for the parsed value |

Also exported by name (`import { price, url } from "xcrap/transformer"`) together with `parseNumber(text, options)` for use outside schemas.

Numeric schemas accept numbers too (JSON sources), `t.boolean()` accepts booleans and `t.date()` accepts timestamps and `Date`s, so one schema works for HTML and JSON sources alike.

## Numbers and locales

Numeric schemas read the **first number** in the text. Without `locale` the decimal separator is guessed; a lone separator followed by exactly three digits is treated as thousands (`"1.234"` → `1234`). When the site's format is known, pass the locale — it removes the ambiguity:

```ts
t.price({ locale: "pt-BR" }) // "R$ 1.234,56" -> 1234.56
t.price({ locale: "en-US" }) // "$1.234"      -> 1.234
t.number({ compact: true })  // "1.2k"        -> 1200
```

## URLs

The base URL is part of the schema. When the same model runs on many pages, build the schema per page:

```ts
const productSchema = (pageUrl: string) => z.object({ url: t.url({ base: pageUrl }) })
```

## Dates

```ts
import { ptBR } from "date-fns/locale" // npm i date-fns to import locales directly

t.date()                                                  // ISO 8601
t.date({ format: "dd/MM/yyyy" })                          // "25/12/2024"
t.date({ format: "d 'de' MMMM 'de' yyyy", locale: ptBR }) // "25 de dezembro de 2024"
t.date({ unit: "s" })                                     // 1735084800
```

## Optional values, defaults, fallbacks

Plain Zod:

```ts
z.object({
    badge: t.text().nullable(),              // extraction model used `default: null`
    reviews: t.integer().optional(),
    inStock: t.boolean().catch(false),       // unparseable -> false
    currency: t.text().default("BRL"),
})
```

Use `.catch()` sparingly: it hides site changes. Prefer letting the parse fail loudly for required fields.

## Refining results

Schemas that transform are Zod pipes, so number/string methods are not available directly on them. Use the options or `.pipe()`:

```ts
t.price({ min: 0 })
t.text().pipe(z.string().min(1))
t.price().pipe(z.number().multipleOf(0.01))
```

## Renaming, derived fields, removing temporary keys

Do it on the object schema:

```ts
const productSchema = z
    .object({
        title: t.text(),
        rawPrice: t.price(),
        rawOldPrice: t.price().nullable(),
    })
    .transform(({ title, rawPrice, rawOldPrice }) => ({
        title,
        price: rawPrice,
        discount: rawOldPrice ? 1 - rawPrice / rawOldPrice : 0,
        scrapedAt: new Date(),
    }))

type Product = z.output<typeof productSchema>
```

## Lists and partial failures

`z.array(schema).parse(items)` fails on the first bad item. When one broken card should not discard a whole page, parse per item:

```ts
const results = rawItems.map((item) => productSchema.safeParse(item))
const products = results.filter((r) => r.success).map((r) => r.data)
const failures = results.filter((r) => !r.success).map((r) => z.prettifyError(r.error))
```

## Migrating from @xcrap/transformer 0.x

| Old | New |
| --- | --- |
| `new TransformingModel({...})` + `Transformer` | `z.object({...})` + `.parse()` |
| `StringTransformer.*` / `NumberTransformer.*` | `t.*` schemas or inline `.transform()` |
| `condition` / `skip` | `.optional()`, `.catch()`, `.default()` |
| `scope: "root"` (cross-field) | `.transform()` on the object |
| `.after({ append, delete })` | `.extend()`, `.omit()` or `.transform()` |
