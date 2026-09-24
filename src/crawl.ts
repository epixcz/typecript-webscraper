import { JSDOM } from "jsdom";
import pLimit from "p-limit";

export class ConcurrentCrawler {
  private baseURL: string;
  private pages: Record<string, number>;
  private limit: ReturnType<typeof pLimit>;

  constructor(baseURL: string, maxConcurrency: number = 1) {
    this.baseURL = baseURL;
    this.pages = {};
    this.limit = pLimit(maxConcurrency);
  }

  private addPageVisit(normalizedURL: string): boolean {
    if (Object.hasOwn(this.pages, normalizedURL)) {
      this.pages[normalizedURL] += 1;
      return false;
    }
    this.pages[normalizedURL] = 1;
    return true;
  }

  private async getHTML(currentURL: string): Promise<string> {
    return await this.limit(async () => {
      console.log(`Crawling ${currentURL}`);
      try {
        const response = await fetch(currentURL, {
          headers: { "User-Agent": "BootCrawler/1.0" },
        });
        if (response.status >= 400) {
          console.error(`Error fetching ${currentURL}: HTTP ${response.status}`);
          return "";
        }
        const contentType = response.headers.get("content-type");
        if (contentType?.split(";")[0]?.trim().toLowerCase() !== "text/html") {
          console.error(`Error fetching ${currentURL}: expected text/html, received ${contentType ?? "no content-type"}`);
          return "";
        }
        return await response.text();
      } catch (error) {
        console.error(`Error fetching ${currentURL}:`, error);
        return "";
      }
    });
  }

  private async crawlPage(currentURL: string): Promise<void> {
    if (new URL(currentURL).hostname !== new URL(this.baseURL).hostname) {
      return;
    }
    if (!this.addPageVisit(normalizeURL(currentURL))) {
      return;
    }
    const html = await this.getHTML(currentURL);
    if (!html) return;

    const nextURLs = getURLsFromHTML(html, currentURL);
    await Promise.all(nextURLs.map((nextURL) => this.crawlPage(nextURL)));
  }

  async crawl(): Promise<Record<string, number>> {
    await this.crawlPage(this.baseURL);
    return this.pages;
  }
}

export async function crawlSiteAsync(
  baseURL: string,
  maxConcurrency: number = 1,
): Promise<Record<string, number>> {
  const crawler = new ConcurrentCrawler(baseURL, maxConcurrency);
  return await crawler.crawl();
}

export interface ExtractedPageData {
  url: string;
  heading: string;
  first_paragraph: string;
  outgoing_links: string[];
  image_urls: string[];
}

export function extractPageData(html: string, pageURL: string): ExtractedPageData {
  return {
    url: pageURL,
    heading: getHeadingFromHTML(html),
    first_paragraph: getFirstParagraphFromHTML(html),
    outgoing_links: getURLsFromHTML(html, pageURL),
    image_urls: getImagesFromHTML(html, pageURL),
  };
}

export function getURLsFromHTML(html: string, baseURL: string): string[] {
  const document = new JSDOM(html).window.document;
  const urls: string[] = [];

  for (const anchor of document.querySelectorAll("a")) {
    const href = anchor.getAttribute("href");
    if (href) {
      urls.push(new URL(href, baseURL).href);
    }
  }

  return urls;
}

export function getImagesFromHTML(html: string, baseURL: string): string[] {
  const document = new JSDOM(html).window.document;
  const urls: string[] = [];

  for (const image of document.querySelectorAll("img")) {
    const src = image.getAttribute("src");
    if (src) {
      urls.push(new URL(src, baseURL).href);
    }
  }

  return urls;
}

export function getHeadingFromHTML(html: string): string {
  const document = new JSDOM(html).window.document;
  const heading = document.querySelector("h1") ?? document.querySelector("h2");
  return heading?.textContent?.trim() ?? "";
}

export function getFirstParagraphFromHTML(html: string): string {
  const document = new JSDOM(html).window.document;
  return document.querySelector("p")?.textContent ?? "";
}

export function normalizeURL(url: string): string {
  const parsedURL = new URL(url);
  const normalizedURL = `${parsedURL.hostname}${parsedURL.pathname}`;

  if (normalizedURL.endsWith("/")) {
    return normalizedURL.slice(0, -1);
  }

  return normalizedURL;
}
