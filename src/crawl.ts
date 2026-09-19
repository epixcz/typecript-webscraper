import { JSDOM } from "jsdom";

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
