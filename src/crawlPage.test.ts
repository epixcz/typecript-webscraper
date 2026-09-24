import { afterEach, describe, expect, it, vi } from "vitest";
import { crawlSiteAsync } from "./crawl";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("crawlSiteAsync", () => {
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

    expect(await crawlSiteAsync("https://example.com/shop/")).toEqual({
      "example.com/shop": 3,
      "example.com/shop/products/one": 2,
      "example.com/shop/products/two": 1,
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(Object.keys(bodies));
  });

  it("retains failed pages and continues to the next link", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<a href="/missing">Missing</a><a href="/ok">OK</a>', { headers: { "Content-Type": "text/html" } }))
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("<p>OK</p>", { headers: { "Content-Type": "text/html" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await crawlSiteAsync("https://example.com")).toEqual({
      "example.com": 1, "example.com/missing": 1, "example.com/ok": 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

it.each([1, 3])("limits fetches including body reads to %i while counting shared links once per occurrence", async (maxConcurrency) => {
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
  expect(await crawlSiteAsync("https://example.com", maxConcurrency)).toEqual({
    "example.com": 2, "example.com/a": 1, "example.com/b": 1,
    "example.com/c": 1, "example.com/shared": 3,
  });
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
  expect(await crawlSiteAsync("https://example.com", 3)).toEqual({
    "example.com": 1, "example.com/bad": 1, "example.com/ok": 1,
  });
  expect(error).toHaveBeenCalledTimes(1);
});
