import { crawlSiteAsync } from "./crawl";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3) {
    console.error("Usage: npm run start <URL> <maxConcurrency> <maxPages>");
    process.exitCode = 1;
    return;
  }

  const [baseURL, concurrencyArg, pagesArg] = args;
  const maxConcurrency = Number(concurrencyArg);
  const maxPages = Number(pagesArg);
  if (![maxConcurrency, maxPages].every((value) => Number.isSafeInteger(value) && value > 0)) {
    console.error("maxConcurrency and maxPages must be positive integers.");
    process.exitCode = 1;
    return;
  }

  console.log(`Starting crawler at ${baseURL}`);
  const pages = await crawlSiteAsync(baseURL, maxConcurrency, maxPages);
  console.log("Crawl report:");
  for (const [url, count] of Object.entries(pages)) {
    console.log(`${url}: ${count}`);
  }
}

main().catch((error) => {
  console.error("Crawler failed:", error);
  process.exitCode = 1;
});
