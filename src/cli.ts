import { DocCrawler } from "./crawler";
import { loadConfig } from "./utils/configLoader";

async function main() {
    const sourceName = process.argv[2] || "python";
    const outputFile = process.argv[3] || "docs.json";
    const resumeFrom = process.argv[4]; // Optional checkpoint file to resume from

    console.log(`Loading config for ${sourceName}...`);
    const source = await loadConfig(sourceName);
    
    console.log(`Starting crawler for ${source.name}...`);
    
    const crawler = new DocCrawler(source, {
        delay: 1000,
        maxConcurrent: 10,
        maxDepth: 5,
        checkpointInterval: 60000,
        checkpointFile: `${sourceName}-checkpoint.json`,
        resumeFrom,
    });

    try {
        const entries = await crawler.crawlAll();
        await Bun.write(outputFile, JSON.stringify(entries, null, 2));
        console.log(`Documentation saved to ${outputFile}`);
        console.log(`Total entries: ${entries.length}`);
    } catch (error) {
        console.error("Crawling failed:", error);
        process.exit(1);
    }
}

main();