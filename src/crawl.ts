import { JSDOM } from "jsdom";
import pLimit from "p-limit";

export class ConcurrentCrawler {
  private baseURL: string;
  private pages: Record<string, ExtractedPageData>;
  private limit: ReturnType<typeof pLimit>;

  private maxPages: number;
  private shouldStop: boolean;
  private allTasks: Set<Promise<void>>;
  private visited: Set<string>;

  constructor(baseURL: string, maxConcurrency: number = 1, maxPages: number = Infinity) {
    if (!(maxPages === Infinity || (Number.isSafeInteger(maxPages) && maxPages > 0))) {
      throw new Error("maxPages must be a positive integer.");
    }
    this.baseURL = baseURL;
    this.pages = {};
    this.maxPages = maxPages;
    this.shouldStop = false;
    this.allTasks = new Set();
    this.visited = new Set();
    this.limit = pLimit(maxConcurrency);
  }

  private addPageVisit(normalizedURL: string): boolean {
    if (this.shouldStop) return false;
    if (this.visited.has(normalizedURL)) return false;
    if (this.visited.size >= this.maxPages) {
      this.shouldStop = true;
      console.log("Reached maximum number of pages to crawl.");
      return false;
    }
    this.visited.add(normalizedURL);
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
    if (this.shouldStop) return;
    if (new URL(currentURL).hostname !== new URL(this.baseURL).hostname) {
      return;
    }
    const normalizedURL = normalizeURL(currentURL);
    if (!this.addPageVisit(normalizedURL)) {
      return;
    }
    const html = await this.getHTML(currentURL);
    if (!html) return;

    const data = extractPageData(html, currentURL);
    this.pages[normalizedURL] = data;
    const tasks: Promise<void>[] = [];
    for (const nextURL of data.outgoing_links) {
      if (this.shouldStop) break;
      tasks.push(this.createCrawlTask(nextURL));
    }
    await Promise.all(tasks);
  }

  private createCrawlTask(url: string): Promise<void> {
    const task = this.crawlPage(url).finally(() => {
      this.allTasks.delete(task);
    });
    this.allTasks.add(task);
    return task;
  }

  async crawl(): Promise<Record<string, ExtractedPageData>> {
    await this.createCrawlTask(this.baseURL);
    while (this.allTasks.size > 0) {
      await Promise.all(this.allTasks);
    }
    return this.pages;
  }
}

export async function crawlSiteAsync(
  baseURL: string,
  maxConcurrency: number = 1,
  maxPages: number = Infinity,
): Promise<Record<string, ExtractedPageData>> {
  const crawler = new ConcurrentCrawler(baseURL, maxConcurrency, maxPages);
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
