import { describe, expect, it } from "vitest";
import { getFirstParagraphFromHTML, getHeadingFromHTML, getURLsFromHTML, getImagesFromHTML, normalizeURL } from "./crawl";

describe("getFirstParagraphFromHTML", () => {
  it("returns the text content of the first paragraph", () => {
    expect(getFirstParagraphFromHTML("<p>First paragraph</p><p>Second paragraph</p>"))
      .toBe("First paragraph");
  });

  it.each(["", "<h1>Heading</h1><div>No paragraph</div>"])(
    "returns an empty string when no paragraph exists in %j",
    (html) => {
      expect(getFirstParagraphFromHTML(html)).toBe("");
    },
  );

  it("includes nested text and decodes HTML entities", () => {
    expect(getFirstParagraphFromHTML("<p>Learn <strong>HTML</strong> &amp; CSS</p>"))
      .toBe("Learn HTML & CSS");
  });

  it("returns an empty first paragraph without skipping to the next one", () => {
    expect(getFirstParagraphFromHTML("<p></p><p>Second</p>")).toBe("");
  });

  it("preserves whitespace in the paragraph text content", () => {
    expect(getFirstParagraphFromHTML("<p>  Hello world\n </p>")).toBe("  Hello world\n ");
  });
});

describe("getHeadingFromHTML", () => {
  it("extracts the h1 text from an HTML document", () => {
    const html = "<html><body><h1>Welcome to Boot.dev</h1></body></html>";
    expect(getHeadingFromHTML(html)).toBe("Welcome to Boot.dev");
  });

  it("returns the first h1 when there are multiple headings", () => {
    expect(getHeadingFromHTML("<h1>First</h1><h1>Second</h1>")).toBe("First");
  });

  it("prefers h1 even when h2 appears first", () => {
    const html = "<title>Page title</title><h2>Subtitle</h2><h1>Main heading</h1>";
    expect(getHeadingFromHTML(html)).toBe("Main heading");
  });

  it("falls back to h2 when there is no h1", () => {
    expect(getHeadingFromHTML("<h2>Only a subheading</h2>")).toBe(
      "Only a subheading",
    );
  });

  it("returns the first h2 when there is no h1 and multiple h2 tags", () => {
    expect(getHeadingFromHTML("<h2>First</h2><h2>Second</h2>")).toBe("First");
  });

  it("extracts nested text and decodes entities in the h2 fallback", () => {
    expect(getHeadingFromHTML("<h2>Learn <em>TypeScript</em> &amp; HTML</h2>")).toBe(
      "Learn TypeScript & HTML",
    );
  });

  it("returns an empty string for an empty h1 even when h2 is present", () => {
    expect(getHeadingFromHTML("<h1></h1><h2>Fallback</h2>")).toBe("");
  });

  it("includes text from nested elements", () => {
    expect(getHeadingFromHTML("<h1>Learn <em>TypeScript</em> today</h1>")).toBe(
      "Learn TypeScript today",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(getHeadingFromHTML("<h1> \n  Hello world \t </h1>")).toBe("Hello world");
  });

  it("decodes HTML entities", () => {
    expect(getHeadingFromHTML("<h1>Tips &amp; tricks &lt;3</h1>")).toBe(
      "Tips & tricks <3",
    );
  });

  it("handles attributes and uppercase HTML tags", () => {
    expect(getHeadingFromHTML('<H1 class="title" id="main">Hello</H1>')).toBe(
      "Hello",
    );
  });

  it.each([
    "",
    "<p>No heading</p>",
    "<title>Page title</title><h3>Other heading</h3>",
    "<h1></h1>",
    "<h1> \n </h1>",
    "<h2></h2>",
  ])(
    "returns an empty string for %j",
    (html) => {
      expect(getHeadingFromHTML(html)).toBe("");
    },
  );
});

describe("normalizeURL", () => {
  it.each([
    ["https://www.boot.dev/blog/path/", "www.boot.dev/blog/path"],
    ["https://www.boot.dev/blog/path", "www.boot.dev/blog/path"],
    ["http://www.boot.dev/blog/path/", "www.boot.dev/blog/path"],
    ["http://www.boot.dev/blog/path", "www.boot.dev/blog/path"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeURL(input)).toBe(expected);
  });

  it.each([
    ["https://www.boot.dev", "www.boot.dev"],
    ["https://www.boot.dev/", "www.boot.dev"],
    ["http://www.boot.dev", "www.boot.dev"],
    ["http://www.boot.dev/", "www.boot.dev"],
  ])("normalizes the root URL %s to %s", (input, expected) => {
    expect(normalizeURL(input)).toBe(expected);
  });

  it("normalizes uppercase protocol and hostname", () => {
    expect(normalizeURL("HTTPS://WWW.BOOT.DEV/blog/path/")).toBe(
      "www.boot.dev/blog/path",
    );
  });

  it("preserves path casing because paths can be case-sensitive", () => {
    expect(normalizeURL("https://www.boot.dev/Blog/Path/")).toBe(
      "www.boot.dev/Blog/Path",
    );
  });

  it("preserves nested paths", () => {
    expect(normalizeURL("https://www.boot.dev/blog/guides/typescript/")).toBe(
      "www.boot.dev/blog/guides/typescript",
    );
  });

  it("preserves subdomains", () => {
    expect(normalizeURL("https://blog.boot.dev/path/")).toBe(
      "blog.boot.dev/path",
    );
  });

  it("does not add a www prefix", () => {
    expect(normalizeURL("https://boot.dev/path/")).toBe("boot.dev/path");
  });

  it("preserves file extensions in paths", () => {
    expect(normalizeURL("https://www.boot.dev/index.html")).toBe(
      "www.boot.dev/index.html",
    );
  });
});

describe("getURLsFromHTML", () => {
  const baseURL = "https://crawler-test.com";

  it("converts root-relative URLs to absolute URLs", () => {
    expect(getURLsFromHTML('<html><body><a href="/path/one"><span>Link</span></a></body></html>', baseURL))
      .toEqual(["https://crawler-test.com/path/one"]);
  });

  it("resolves relative paths and protocol-relative URLs", () => {
    expect(getURLsFromHTML('<a href="images/logo.png"><span>Link</span></a><a href="//cdn.example.com/logo.png"><span>Link</span></a>', baseURL))
      .toEqual(["https://crawler-test.com/images/logo.png", "https://cdn.example.com/logo.png"]);
  });

  it("finds all matching tags in document order and preserves duplicates", () => {
    const html = '<html><body><a href="/one"><span>Link</span></a><div><a href="https://other.com/two/"><span>Link</span></a></div><a href="/one"><span>Link</span></a></body></html>';
    expect(getURLsFromHTML(html, baseURL)).toEqual([
      "https://crawler-test.com/one", "https://other.com/two/", "https://crawler-test.com/one",
    ]);
  });

  it("preserves the scheme, path case, trailing slash, query, and fragment", () => {
    expect(getURLsFromHTML('<a href="http://other.com/Path/?page=1&amp;size=2#section"><span>Link</span></a>', baseURL))
      .toEqual(["http://other.com/Path/?page=1&size=2#section"]);
  });

  it("skips missing and empty attributes while retaining valid URLs", () => {
    expect(getURLsFromHTML('<a><a href=""><a href="/valid"><span>Link</span></a>', baseURL))
      .toEqual(["https://crawler-test.com/valid"]);
  });

  it("returns an empty list when no matching tags exist", () => {
    expect(getURLsFromHTML("<p>No URLs here</p>", baseURL)).toEqual([]);
  });

  it("throws for an invalid URL", () => {
    expect(() => getURLsFromHTML('<a href="http://["><span>Link</span></a>', baseURL)).toThrow(TypeError);
  });
});

describe("getImagesFromHTML", () => {
  const baseURL = "https://crawler-test.com";

  it("converts root-relative URLs to absolute URLs", () => {
    expect(getImagesFromHTML('<html><body><img src="/path/one"></body></html>', baseURL))
      .toEqual(["https://crawler-test.com/path/one"]);
  });

  it("resolves relative paths and protocol-relative URLs", () => {
    expect(getImagesFromHTML('<img src="images/logo.png"><img src="//cdn.example.com/logo.png">', baseURL))
      .toEqual(["https://crawler-test.com/images/logo.png", "https://cdn.example.com/logo.png"]);
  });

  it("finds all matching tags in document order and preserves duplicates", () => {
    const html = '<html><body><img src="/one"><div><img src="https://other.com/two/"></div><img src="/one"></body></html>';
    expect(getImagesFromHTML(html, baseURL)).toEqual([
      "https://crawler-test.com/one", "https://other.com/two/", "https://crawler-test.com/one",
    ]);
  });

  it("preserves the scheme, path case, trailing slash, query, and fragment", () => {
    expect(getImagesFromHTML('<img src="http://other.com/Path/?page=1&amp;size=2#section">', baseURL))
      .toEqual(["http://other.com/Path/?page=1&size=2#section"]);
  });

  it("skips missing and empty attributes while retaining valid URLs", () => {
    expect(getImagesFromHTML('<img><img src=""><img src="/valid">', baseURL))
      .toEqual(["https://crawler-test.com/valid"]);
  });

  it("returns an empty list when no matching tags exist", () => {
    expect(getImagesFromHTML("<p>No URLs here</p>", baseURL)).toEqual([]);
  });

  it("throws for an invalid URL", () => {
    expect(() => getImagesFromHTML('<img src="http://[">', baseURL)).toThrow(TypeError);
  });
});
