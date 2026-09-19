import { JSDOM } from "jsdom";

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
