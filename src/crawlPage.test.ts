import { afterEach, describe, expect, it, vi } from "vitest";
import { crawlSiteAsync } from "./crawl";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("crawlSiteAsync", () => {
  it("skips repeated links and cycles, resolves page-relative links, and fetches each internal page once", async () => {
    const bodies: Record<string, string> = {
      "https://example.com/shop/": '<h1>Shop</h1><p>Welcome.</p><img src="/logo.png"><a href="products/one">One</a><a href="products/one#details">One again</a><a href="https://other.com/">External</a>',
      "https://example.com/shop/products/one": '<a href="/shop/">Home</a><a href="two">Two</a>',
      "https://example.com/shop/products/two": '<a href="/shop/">Home</a>',
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (!(url in bodies)) throw new Error(`Unexpected fetch: ${url}`);
      return new Response(bodies[url], { headers: { "Content-Type": "text/html" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await crawlSiteAsync("https://example.com/shop/")).toEqual({
      "example.com/shop": {
        url: "https://example.com/shop/", heading: "Shop", first_paragraph: "Welcome.",
        outgoing_links: ["https://example.com/shop/products/one", "https://example.com/shop/products/one#details", "https://other.com/"],
        image_urls: ["https://example.com/logo.png"],
      },
      "example.com/shop/products/one": {
        url: "https://example.com/shop/products/one", heading: "", first_paragraph: "",
        outgoing_links: ["https://example.com/shop/", "https://example.com/shop/products/two"], image_urls: [],
      },
      "example.com/shop/products/two": {
        url: "https://example.com/shop/products/two", heading: "", first_paragraph: "",
        outgoing_links: ["https://example.com/shop/"], image_urls: [],
      },
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(Object.keys(bodies));
  });

  it("omits failed pages and continues to the next link", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<a href="/missing">Missing</a><a href="/ok">OK</a>', { headers: { "Content-Type": "text/html" } }))
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("<p>OK</p>", { headers: { "Content-Type": "text/html" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const pages = await crawlSiteAsync("https://example.com");
    expect(Object.keys(pages)).toEqual(["example.com", "example.com/ok"]);
    expect(pages["example.com/ok"]).toEqual({
      url: "https://example.com/ok", heading: "", first_paragraph: "OK", outgoing_links: [], image_urls: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

it.each([1, 3])("limits fetches including body reads to %i while visiting shared pages once", async (maxConcurrency) => {
  let active = 0;
  let peak = 0;
  const fetchMock = vi.fn(async (url: string) => {
    active++;
    peak = Math.max(peak, active);
    const path = new URL(url).pathname;
    return {
      status: 200,
      headers: new Headers({ "Content-Type": "text/html; charset=utf-8" }),
      text: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        active--;
        if (path === "/") return '<a href="/a">A</a><a href="/b">B</a><a href="/c">C</a>';
        if (path === "/shared") return '<a href="/">Home</a>';
        return '<a href="/shared">Shared</a><a href="https://other.com">External</a>';
      },
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
  const pages = await crawlSiteAsync("https://example.com", maxConcurrency);
  expect(Object.keys(pages).sort()).toEqual([
    "example.com", "example.com/a", "example.com/b", "example.com/c", "example.com/shared",
  ]);
  expect(pages["example.com/shared"].outgoing_links).toEqual(["https://example.com/"]);
  expect(peak).toBe(maxConcurrency);
  expect(active).toBe(0);
  expect(fetchMock).toHaveBeenCalledTimes(5);
  expect(fetchMock).toHaveBeenCalledWith("https://example.com", {
    headers: { "User-Agent": "BootCrawler/1.0" },
  });
});

it.each(["network", "body", "content-type", "missing content-type"])("continues after a %s failure", async (failure) => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "https://example.com") return new Response('<a href="/bad">Bad</a><a href="/ok">OK</a>', { headers: { "Content-Type": "text/html" } });
    if (url.endsWith("/ok")) return new Response("OK", { headers: { "Content-Type": "text/html" } });
    if (failure === "network") throw new Error("Network failed");
    return {
      status: 200,
      headers: new Headers(failure === "missing content-type" ? {} : { "Content-Type": failure === "body" ? "text/html" : "application/json" }),
      text: async () => { throw new Error("Body failed"); },
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const pages = await crawlSiteAsync("https://example.com", 3);
  expect(Object.keys(pages)).toEqual(["example.com", "example.com/ok"]);
  expect(pages["example.com/ok"].url).toBe("https://example.com/ok");
  expect(error).toHaveBeenCalledTimes(1);
});

it.each([1, 3, 10])("fetches at most %i unique pages and finishes admitted tasks before returning", async (maxPages) => {
  let completed = 0;
  const fetchMock = vi.fn(async () => ({
    status: 200,
    headers: new Headers({ "Content-Type": "text/html" }),
    text: async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      completed++;
      return '<a href="/">Self</a><a href="https://other.com">External</a>' +
        Array.from({ length: 20 }, (_, i) => `<a href="/page${i}">Page</a>`).join("");
    },
  }));
  vi.stubGlobal("fetch", fetchMock);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const pages = await crawlSiteAsync("https://example.com", 3, maxPages);
  expect(Object.keys(pages)).toHaveLength(maxPages);
  for (const [key, data] of Object.entries(pages)) {
    expect(data.url).toBe(`https://${key}`);
    expect(data.outgoing_links).toHaveLength(22);
    expect(data.image_urls).toEqual([]);
  }
  expect(fetchMock).toHaveBeenCalledTimes(maxPages);
  expect(completed).toBe(maxPages);
  expect(log.mock.calls.filter(([message]) => message === "Reached maximum number of pages to crawl.")).toHaveLength(1);
});
