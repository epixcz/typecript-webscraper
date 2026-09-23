import { afterEach, describe, expect, it, vi } from "vitest";
import { crawlPage } from "./crawl";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("crawlPage", () => {
  it("counts repeated links and cycles, resolves page-relative links, and fetches each internal page once", async () => {
    const bodies: Record<string, string> = {
      "https://example.com/shop/": '<a href="products/one">One</a><a href="products/one#details">One again</a><a href="https://other.com/">External</a>',
      "https://example.com/shop/products/one": '<a href="/shop/">Home</a><a href="two">Two</a>',
      "https://example.com/shop/products/two": '<a href="/shop/">Home</a>',
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (!(url in bodies)) throw new Error(`Unexpected fetch: ${url}`);
      return new Response(bodies[url], { headers: { "Content-Type": "text/html" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await crawlPage("https://example.com/shop/")).toEqual({
      "example.com/shop": 3,
      "example.com/shop/products/one": 2,
      "example.com/shop/products/two": 1,
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(Object.keys(bodies));
  });

  it("returns the supplied counts unchanged for an external domain", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const pages = { "example.com": 2 };
    expect(await crawlPage("https://example.com", "https://other.com", pages)).toBe(pages);
    expect(pages).toEqual({ "example.com": 2 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("increments a previously seen normalized URL without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const pages = { "example.com/path": 1 };
    expect(await crawlPage("https://example.com", "https://example.com/path/#top", pages)).toBe(pages);
    expect(pages).toEqual({ "example.com/path": 2 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retains failed pages and continues to the next link", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<a href="/missing">Missing</a><a href="/ok">OK</a>', { headers: { "Content-Type": "text/html" } }))
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("<p>OK</p>", { headers: { "Content-Type": "text/html" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await crawlPage("https://example.com")).toEqual({
      "example.com": 1, "example.com/missing": 1, "example.com/ok": 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
