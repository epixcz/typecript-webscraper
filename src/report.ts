import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtractedPageData } from "./crawl";

export function writeJSONReport(
  pageData: Record<string, ExtractedPageData>,
  filename = "report.json",
): void {
  const sorted = Object.values(pageData).sort((a, b) => a.url.localeCompare(b.url));
  const json = JSON.stringify(sorted, null, 2);
  fs.writeFileSync(path.resolve(process.cwd(), filename), json, "utf8");
}
