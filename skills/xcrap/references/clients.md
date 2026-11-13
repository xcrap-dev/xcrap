# Clients

Every client extends `BaseClient` from `@xcrap/core` and implements the same interface:

```ts
client.fetch({ url, method?, maxRetries?, retryDelay?, ...clientSpecificOptions }): Promise<HttpResponse>
client.fetchMany({ requests: [{ url, ... }], concurrency?, requestDelay? }): Promise<HttpResponse[]>
```

Because they share the interface, scraper code can accept any client and you can swap them without touching extraction code.

## Choosing a client

Pick the **lightest** client that gets a valid page. Move down the table only when the one above fails.

| Client | Install | When |
| --- | --- | --- |
| `FetchClient` | `xcrap/core` | Default for unprotected pages and public JSON APIs. Native `fetch`, no extra dependency. |
| `HttpClient` | `xcrap/core` | Node `http`/`https` with per-request `proxy` (HTTP(S) proxy agent) and redirect control (`followRedirects`). |
| `GotScrapingClient` | `@xcrap/got-scraping-client` | Sites that block plain HTTP clients: browser-like headers and TLS fingerprint, HTTP/2. First choice against basic anti-bot. |
| `ImpitClient` | `@xcrap/impit-client` | Same goal as got-scraping (browser impersonation), lighter and faster. |
| `AxiosClient` | `@xcrap/axios-client` | You need Axios interceptors (`client.interceptors`) or built-in rate limiting (`rateLimit`). |
| `PuppeteerClient` | `@xcrap/puppeteer-client` | Content rendered by JavaScript, or interaction needed (click, scroll, fill forms). |
| `PuppeteerExtraClient` | `@xcrap/puppeteer-extra-client` | Puppeteer plus `puppeteer-extra` plugins (`plugins: [StealthPlugin()]`). |
| `PuppeteerRealBrowserClient` | `@xcrap/puppeteer-real-browser-client` | Heavy protection (Cloudflare challenges, Turnstile) that defeats the others. |

Before reaching for a browser, check whether the data is already in the HTML (`<script id="__NEXT_DATA__">`, JSON-LD, inline state) or in a JSON endpoint the page calls (browser DevTools → Network). Calling that endpoint with `FetchClient` is faster and more stable than rendering the page.

Separate clients declare `@xcrap/core` and `@xcrap/extractor` as peer dependencies; installing them next to `xcrap` satisfies that.

## The response

```ts
const response = await client.fetch({ url })

response.status         // number
response.isSuccess()    // 2xx
response.text           // body as string
response.getHeader("content-type")
response.attempts       // attempts made
response.failedAttempts // [{ error, timestamp }]

response.asHtmlParser()     // HtmlParser
response.asJsonParser()     // JsonParser
response.asMarkdownParser() // MarkdownParser
response.asParser(XmlParser) // any parser whose constructor takes the body
```

**Clients do not throw on failed requests.** After exhausting retries they return the last response as is (real status, headers and body — a `404` stays a `404`). When no response was received at all (DNS error, connection refused, timeout) they return status `500` with the error message as body. Always check `response.isSuccess()` before parsing.

## Retries

```ts
await client.fetch({ url, maxRetries: 3, retryDelay: 2000 })
```

`maxRetries` is the number of extra attempts; `retryDelay` is in ms. Both network errors and non-2xx responses are retried. Inspect `response.failedAttempts` to log what went wrong.

## Many requests

```ts
const responses = await client.fetchMany({
    requests: urls.map((url) => ({ url, maxRetries: 2 })),
    concurrency: 3,    // max requests in flight
    requestDelay: 500, // ms to wait before each request after the first
})
```

Results keep the order of `requests`. Each item is an `HttpResponse`; check `isSuccess()` per item and handle failures individually rather than aborting the whole batch.

## User agent and proxies

`userAgent`, `proxy` and `proxyUrl` accept a value or a function that returns one:

```ts
import { HttpClient, Randomizer, Rotator } from "xcrap/core"

const userAgents = new Randomizer(["Mozilla/5.0 (...) Chrome/140.0 Safari/537.36", "Mozilla/5.0 (...) Firefox/141.0"])
const proxies = new Rotator(["http://user:pass@proxy1:8080", "http://user:pass@proxy2:8080"])

const client = new HttpClient({
    userAgent: () => userAgents.random(), // random pick
    proxy: () => proxies.rotate(),        // round-robin; `proxies.current` reads without advancing
})
```

- `proxy` is a real proxy server. `proxyUrl` is a prefix prepended to the target URL (CORS-proxy style, e.g. a Cloudflare Worker): `${proxyUrl}${url}`.
- Functions are evaluated on every request, so a `Rotator`/`Randomizer` rotates per request. The Puppeteer clients open each proxied request in its own browser context with that proxy.
- Proxy credentials go in the URL (`http://user:pass@host:port`); the Puppeteer clients turn them into `page.authenticate()`.
- `FetchClient` routes through the proxy with undici's `ProxyAgent`.
- `AxiosClient` expects an Axios proxy config object (`{ protocol, host, port, auth }`) instead of a string.
- `Randomizer` and `Rotator` throw `EmptyArrayError` when given an empty array.

## Puppeteer clients

```ts
import { PuppeteerClient } from "@xcrap/puppeteer-client"

const client = new PuppeteerClient({ headless: true }) // any puppeteer LaunchOptions

try {
    const response = await client.fetch({
        url: "https://example.com/products",
        actions: [
            // a plain function runs after navigation ("afterRequest")
            async (page) => {
                await page.waitForSelector(".product")
            },
            { type: "beforeRequest", exec: async (page) => page.setViewport({ width: 1366, height: 768 }) },
            {
                type: "afterRequest",
                exec: async (page) => {
                    await page.click("button.load-more")
                    await page.waitForNetworkIdle()
                },
            },
        ],
    })

    const parser = response.asHtmlParser() // body is page.content() after the actions
} finally {
    await client.close() // the browser stays open between fetches until you close it
}
```

- `javaScriptEnabled: false` on a request disables JS for that page.
- One browser is shared by every `fetch`/`fetchMany` of the client; each request opens and closes its own page. Keep `concurrency` low (1–3) with browsers.
- Wait for the element you need (`waitForSelector`) instead of fixed sleeps.

## Pagination

For URLs where the page number is computable, use `StaticPaginator` with a `{page}` placeholder:

```ts
import { StaticPaginator } from "xcrap/core"

const paginator = new StaticPaginator({
    templateUrl: "https://example.com/products?page={page}",
    initialPage: 1,
    lastPage: 20,
})

const urls = paginator.dump() // every URL from the current page to lastPage (dump(5) limits it)
const responses = await client.fetchMany({ requests: urls.map((url) => ({ url })), concurrency: 2 })
```

`next()`, `previous()` and `set(page)` move and return the URL (they throw `PageOutOfRangeError` outside the range); `current` reads it.

When the last page must be read from the first page, let the paginator fetch it:

```ts
import { css, extractText } from "xcrap/extractor"

const { paginator, parser } = await StaticPaginator.createWithTracking({
    client,
    request: { url: "https://example.com/products?page=1" },
    templateUrl: "https://example.com/products?page={page}",
    trackers: {
        currentPage: { query: css(".pagination .active"), extractor: extractText },
        lastPage: { query: css(".pagination li:last-child"), extractor: extractText },
        // optional: transformer: (raw) => Number(raw.replace(/\D/g, ""))
    },
})
// `parser` already holds page 1; fetch the rest with paginator.next() / dump()
```

For cursor or "next link" pagination, loop: fetch, extract the items and the next URL, stop when it is missing.

## Writing a custom client

Extend `BaseClient<ProxyType>`, implement `fetch()` returning `new HttpResponse({ status, statusText, body, headers, attempts, failedAttempts })` and `fetchMany()`. Use `this.currentUserAgent`, `this.currentProxy` and `this.currentProxyUrl` to honour the shared options.
