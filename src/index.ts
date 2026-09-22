import { getHTML } from "./crawl";

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error("Error: please provide a base URL to crawl.");
    process.exit(1);
  }

  if (args.length > 1) {
    console.error("Error: please provide exactly one base URL to crawl.");
    process.exit(1);
  }

  const baseURL = args[0];
  console.log(`Starting crawler at ${baseURL}`);
  const html = await getHTML(baseURL);
  if (html === undefined) {
    process.exitCode = 1;
    return;
  }

  console.log(html);
}

main();
