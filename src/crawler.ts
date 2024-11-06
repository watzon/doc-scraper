import type { AnyNode } from "domhandler";
import { load, type CheerioAPI, type Cheerio } from "cheerio";
import type { DocSource, DocEntry, EntryType, Method } from "./types";
import { existsSync } from "node:fs";
import { asRegExp } from "./utils";

export class DocCrawler {
  private visited = new Set<string>();
  private queue: string[] = [];
  private entries: DocEntry[] = [];
  private checkpointInterval: number;
  private checkpointFile: string;
  private isExiting = false;

  constructor(
    private source: DocSource,
    private options: {
      delay?: number;
      maxConcurrent?: number;
      maxDepth?: number;
      checkpointInterval?: number;  // How often to save (in milliseconds)
      checkpointFile?: string;      // Where to save checkpoint
      resumeFrom?: string;          // Checkpoint file to resume from
    } = {}
  ) {
    this.checkpointInterval = options.checkpointInterval || 30000; // Default 30s
    this.checkpointFile = options.checkpointFile || "crawler-checkpoint.json";
    
    // Setup graceful shutdown
    process.on('SIGINT', this.handleExit.bind(this));
    process.on('SIGTERM', this.handleExit.bind(this));

    // Try to restore from checkpoint
    if (options.resumeFrom) {
      this.restoreCheckpoint(options.resumeFrom);
    }
  }

  private async handleExit() {
    console.log('\nReceived exit signal. Saving checkpoint and shutting down...');
    this.isExiting = true;
    await this.saveCheckpoint();
    process.exit(0);
  }

  private async saveCheckpoint() {
    const checkpoint = {
      visited: Array.from(this.visited),
      queue: this.queue,
      entries: this.entries,
      source: this.source,
    };
    
    await Bun.write(this.checkpointFile, JSON.stringify(checkpoint, null, 2));
    console.log(`Checkpoint saved to ${this.checkpointFile}`);
  }

  private restoreCheckpoint(checkpointFile: string) {
    if (!existsSync(checkpointFile)) {
      console.log('No checkpoint file found, starting fresh crawl');
      return;
    }

    try {
      const checkpoint = JSON.parse(Bun.file(checkpointFile).toString());
      this.visited = new Set(checkpoint.visited);
      this.queue = checkpoint.queue;
      this.entries = checkpoint.entries;
      console.log(`Restored checkpoint: ${this.entries.length} entries, ${this.queue.length} pages in queue`);
    } catch (error) {
      console.error('Failed to restore checkpoint:', error);
      throw error;
    }
  }

  async crawlAll(): Promise<DocEntry[]> {
    console.log(`Starting crawl of ${this.source.name} from ${this.source.indexUrl}`);
    
    // Only queue initial pages if we're not resuming
    if (this.queue.length === 0) {
      await this.queueInitialPages();
    }
    console.log(`Initial queue size: ${this.queue.length} pages`);
    
    let lastCheckpoint = Date.now();

    // Process queue with concurrency control
    while (this.queue.length > 0 && !this.isExiting) {
      const batch = this.queue.splice(0, this.options.maxConcurrent || 5);
      console.log(`Processing batch of ${batch.length} pages. Remaining in queue: ${this.queue.length}`);
      
      await Promise.all(
        batch.map(url => this.processPage(url, 0))
      );
      
      // Check if it's time for a checkpoint
      if (Date.now() - lastCheckpoint > this.checkpointInterval) {
        await this.saveCheckpoint();
        lastCheckpoint = Date.now();
      }
      
      if (this.options.delay) {
        await new Promise(resolve => setTimeout(resolve, this.options.delay));
      }
    }

    if (this.isExiting) {
      console.log('Crawl interrupted. Progress has been saved.');
      return this.entries;
    }

    console.log(`Crawl complete. Found ${this.entries.length} entries across ${this.visited.size} pages`);
    
    // Post-process to establish relationships
    this.establishHierarchy();
    
    // Save final checkpoint
    await this.saveCheckpoint();
    
    return this.entries;
  }

  private async queueInitialPages(): Promise<void> {
    console.log('Fetching index page...');
    const $ = await this.fetchAndLoad(this.source.indexUrl);
    if ($ === null) return;

    const links = this.extractLinks($, this.source.indexUrl);
    console.log(`Found ${links.length} initial links to crawl`);
    this.queue.push(...links);
  }

  private async processPage(url: string, depth: number): Promise<void> {
    if (this.visited.has(url)) {
      console.log(`Skipping already visited page: ${url}`);
      return;
    }
    if (this.options.maxDepth !== undefined && depth > this.options.maxDepth) {
      console.log(`Skipping page due to max depth: ${url}`);
      return;
    }

    console.log(`Processing page: ${url}`);
    this.visited.add(url);
    const $ = await this.fetchAndLoad(url);
    
    if ($ === null) return;

    const entries = await this.extractEntries($, url);
    console.log(`Found ${entries.length} entries on ${url}`);
    this.entries.push(...entries);

    const links = this.extractLinks($, url);
    const newLinks = links.filter(link => !this.visited.has(link));
    console.log(`Found ${newLinks.length} new links on ${url}`);
    this.queue.push(...newLinks);
  }

  private async fetchAndLoad(url: string): Promise<CheerioAPI | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        // If this is the index page, throw the error
        if (url === this.source.indexUrl) {
          throw new Error(`Failed to fetch index page: HTTP ${response.status}`);
        }
        // Otherwise, log and return null
        console.warn(`Skipping ${url}: HTTP ${response.status}`);
        return null;
      }
      const html = await response.text();
      return load(html);
    } catch (error) {
      // If this is the index page, rethrow the error
      if (url === this.source.indexUrl) {
        console.error(`Failed to fetch index page ${url}:`, error);
        throw error;
      }
      // Otherwise, log and return null
      console.warn(`Skipping ${url}:`, error);
      return null;
    }
  }

  private normalizeUrl(url: string): string {
    // Remove fragment and normalize the URL
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  }

  private extractLinks($: CheerioAPI, currentUrl: string): string[] {
    const links: string[] = [];
    
    // Get navigation links
    $(this.source.selectors.navigationLinks).each((_, el) => {
      const href = $(el).attr('href');
      if (href) links.push(this.normalizeUrl(new URL(href, currentUrl).toString()));
    });

    // Get sub-navigation links if specified
    if (this.source.selectors.subNavigationLinks) {
      $(this.source.selectors.subNavigationLinks).each((_, el) => {
        const href = $(el).attr('href');
        if (href) links.push(this.normalizeUrl(new URL(href, currentUrl).toString()));
      });
    }

    // Get content links
    $(this.source.selectors.contentLinks).each((_, el) => {
      const href = $(el).attr('href');
      if (href) links.push(this.normalizeUrl(new URL(href, currentUrl).toString()));
    });

    return [...new Set(links)]; // Remove duplicates
  }

  private async extractEntries($: CheerioAPI, url: string): Promise<DocEntry[]> {
    const entries: DocEntry[] = [];
    const $content = $('body'); // Start with full page, narrow down based on content

    // Extract page-level namespace/module info
    const namespace = this.extractNamespace($);

    // Find all potential entry points in the page
    $content.find(this.source.selectors.contentLinks).each((_, el) => {
      const $el = $(el);
      const entry = this.extractEntry($, $el, url, namespace);
      if (entry) entries.push(entry);
    });

    return entries;
  }

  private extractNamespace($: CheerioAPI): string[] {
    if (!this.source.selectors.namespace) return [];
    
    return $(this.source.selectors.namespace)
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
  }

  private extractEntry($: CheerioAPI, $el: Cheerio<AnyNode>, url: string, namespace: string[]): DocEntry | null {
    const type = this.determineType($el);
    if (!type) return null;

    // Extract name using the configured selector and pattern
    const nameEl = $el.find(this.source.selectors.name).first();
    const nameText = nameEl.length ? nameEl.text().trim() : $el.text().trim();
    const nameMatch = nameText.match(this.source.patterns.nameExtract);
    
    if (!nameMatch?.[1]) {
      console.warn(`Could not extract name from "${nameText}" using pattern ${this.source.patterns.nameExtract}`);
      return null;
    }
    
    const name = nameMatch[1];

    // Extract or construct ID
    let id: string;
    if (this.source.selectors.id) {
      const idEl = $el.find(this.source.selectors.id).first();
      const idText = idEl.length ? idEl.text().trim() : '';
      if (this.source.patterns.idExtract) {
        const idMatch = idText.match(this.source.patterns.idExtract);
        id = idMatch?.[1] ?? [...namespace, name].join('.');
      } else {
        id = idText;
      }
    } else {
      id = [...namespace, name].join('.');
    }
    
    // Get the href with fragment if it exists
    const fullUrl = $el.attr('href') 
      ? new URL($el.attr('href')!, url).toString()
      : url;

    // Extract signature if configured
    let signature: string | undefined;
    if (this.source.selectors.signature) {
      const $sig = $el.find(this.source.selectors.signature);
      if ($sig.length) {
        signature = $sig.text().trim();
        
        // Clean up signature if pattern provided
        if (this.source.patterns?.signatureClean) {
          const match = signature.match(this.source.patterns.signatureClean);
          if (match?.[1]) {
            signature = match[1];
          }
        }
      }
    }

    const entry: DocEntry = {
      id,
      type,
      namespace,
      name,
      title: this.extractText($, this.source.selectors.title, $el)[0],
      description: this.extractText($, this.source.selectors.description, $el),
      signature,
      source: {
        name: this.source.name,
        url: fullUrl,
        normalizedUrl: this.normalizeUrl(fullUrl),
        version: this.source.version,
      },
      examples: this.extractExamples($, $el),
      scrapedAt: new Date().toISOString(),
    };

    // If this is a class, extract methods and properties
    if (entry.type === 'class') {
        const methods = this.extractMethods($, $el);
        if (methods && methods.length > 0) {
            entry.methods = methods;
        }

        const properties = this.extractProperties($, $el);
        if (properties && properties.length > 0) {
            entry.properties = properties;
        }
    }

    // Extract parameters if selector is defined
    if (this.source.selectors.parameters) {
      const parameters = this.extractParameters($, $el);
      if (parameters && parameters.length > 0) {
        entry.parameters = parameters;
      }
    }

    // Extract return info if selector is defined
    if (this.source.selectors.returns) {
      const returns = this.extractReturns($, $el);
      if (returns) {
        entry.returns = returns;
      }
    }

    return entry;
  }

  private extractParameters($: CheerioAPI, context: Cheerio<AnyNode>): DocEntry['parameters'] {
    if (!this.source.selectors.parameters) return [];

    const parameters: DocEntry['parameters'] = [];

    // Find the first dt.sig within this entry's context
    const $firstSig = context.find('dt.sig').first();
    if (!$firstSig.length) return parameters;

    for (const paramConfig of this.source.selectors.parameters) {
        if (typeof paramConfig === 'string') {
            // Simple string selector - scope to first signature
            $firstSig.find(paramConfig).each((_, el) => {
                const $param = $(el);
                const name = $param.text().trim();
                
                if (name) {
                    parameters.push({
                        name,
                        description: '',
                        optional: false,
                        isRest: name.startsWith('*'),
                    });
                }
            });
        } else {
            // Complex parameter configuration - scope to first signature
            $firstSig.find(paramConfig.selector).each((_, el) => {
                const $param = $(el);
                
                // Extract name
                let name: string;
                if (paramConfig.nameSelector) {
                    const $name = $param.find(paramConfig.nameSelector);
                    name = $name.text().trim();
                } else {
                    name = $param.text().trim();
                }

                // Apply name pattern if specified
                if (paramConfig.namePattern) {
                    const match = name.match(paramConfig.namePattern);
                    if (!match?.[1]) return; // Skip if no match
                    name = match[1];
                }

                // Check for rest parameter
                const isRest = paramConfig.restPattern ? 
                    asRegExp(paramConfig.restPattern).test(name) : 
                    name.startsWith('*');

                // Extract type
                let type: string | undefined;
                if (paramConfig.typeSelector) {
                    const $type = $param.find(paramConfig.typeSelector);
                    type = $type.text().trim() || undefined;
                    
                    if (type && paramConfig.typePattern) {
                        const match = type.match(paramConfig.typePattern);
                        type = match?.[1] || type;
                    }
                }

                // Extract default value
                let defaultValue: string | undefined;
                if (paramConfig.defaultSelector) {
                    const $default = $param.find(paramConfig.defaultSelector);
                    defaultValue = $default.text().trim() || undefined;
                }
                if (defaultValue && paramConfig.defaultPattern) {
                    const match = defaultValue.match(paramConfig.defaultPattern);
                    defaultValue = match?.[1] || defaultValue;
                }

                // Extract description
                let description = '';
                if (paramConfig.descriptionSelector) {
                    const $desc = $param.find(paramConfig.descriptionSelector);
                    description = $desc.text().trim();
                }

                // Determine if parameter is optional
                let optional = Boolean(defaultValue);  // Optional if it has a default value
                if (paramConfig.optionalPattern) {
                    optional = optional || asRegExp(paramConfig.optionalPattern).test(name);
                }

                // Clean up name (remove any markers that were used to detect optional/rest status)
                name = name.replace(/[=?].*$/, '').trim();
                if (isRest) {
                    name = name.replace(/^\*+/, '');  // Remove leading asterisks
                }

                if (name) {
                    parameters.push({
                        name,
                        type,
                        description,
                        optional,
                        default: defaultValue,
                        isRest,
                    });
                }
            });
        }
    }

    return parameters;
  }

  private extractReturns($: CheerioAPI, context: Cheerio<AnyNode>): DocEntry['returns'] | undefined {
    if (!this.source.selectors.returns) return undefined;

    const returnText = $(this.source.selectors.returns, context).first().text().trim();
    if (!returnText) return undefined;

    return {
      type: returnText,
      description: undefined, // Could be enhanced to extract description if available
    };
  }

  private determineType($el: Cheerio<AnyNode>): EntryType | null {
    const text = $el.text();
    const { patterns } = this.source;

    if (asRegExp(patterns.isClass).test(text)) return 'class';
    if (asRegExp(patterns.isMethod).test(text)) return 'method';
    if (asRegExp(patterns.isFunction).test(text)) return 'function';
    if (asRegExp(patterns.isModule).test(text)) return 'module';
    if (asRegExp(patterns.isProperty).test(text)) return 'property';

    return null;
  }

  private extractText($: CheerioAPI, selector: string | string[], context: Cheerio<AnyNode>): string[] {
    const selectors = Array.isArray(selector) ? selector : [selector];
    return selectors.flatMap(sel => 
      context.find(sel)
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean)
    );
  }

  private extractExamples($: CheerioAPI, context: Cheerio<AnyNode>): DocEntry['examples'] {
    const examples: DocEntry['examples'] = [];
    
    for (const selector of this.source.selectors.examples) {
      if (typeof selector === 'string') {
        // Simple string selector - use default language
        $(selector, context).each((_, el) => {
          examples.push({
            code: $(el).text().trim(),
            language: this.source.defaultLanguage,
          });
        });
      } else {
        // Complex selector with language info
        $(selector.selector, context).each((_, el) => {
          const $el = $(el);
          let language = selector.language || this.source.defaultLanguage;

          // Try to get language from attribute
          if (selector.languageAttr) {
            const attrLang = $el.attr(selector.languageAttr);
            if (attrLang) language = attrLang;
          }

          // Try to get language from class
          if (selector.languageClass) {
            const classes = $el.attr('class')?.split(/\s+/) || [];
            for (const cls of classes) {
              const match = cls.match(selector.languageClass);
              if (match?.[1]) {
                language = match[1];
                break;
              }
            }
          }

          examples.push({
            code: $el.text().trim(),
            language,
          });
        });
      }
    }

    return examples;
  }

  private extractMethods($: CheerioAPI, context: Cheerio<AnyNode>): DocEntry['methods'] {
    if (!this.source.selectors.methods) return [];

    const methods: NonNullable<DocEntry['methods']> = [];
    const sel = this.source.selectors.methods;

    $(sel.container, context).each((_, el) => {
        const $method = $(el);
        const name = $method.find(sel.name).text().trim();
        
        if (name) {
            const method: Method = {
                name,
                description: this.extractText($, sel.description, $method),
                signature: sel.signature ? $method.find(sel.signature).text().trim() : undefined,
                isStatic: sel.isStatic ? $method.find(sel.isStatic).length > 0 : undefined,
                isPrivate: sel.isPrivate ? $method.find(sel.isPrivate).length > 0 : undefined,
                decorators: sel.decorators ? 
                    $method.find(sel.decorators)
                        .map((_, el) => $(el).text().trim())
                        .get()
                        .filter(Boolean) : 
                    undefined
            };

            // Extract parameters and returns if configured
            if (this.source.selectors.parameters) {
                const parameters = this.extractParameters($, $method);
                if (parameters && parameters.length > 0) {
                    method.parameters = parameters;
                }
            }

            if (this.source.selectors.returns) {
                const returns = this.extractReturns($, $method);
                if (returns) {
                    method.returns = returns;
                }
            }

            methods.push(method);
        }
    });

    return methods;
  }

  private extractProperties($: CheerioAPI, context: Cheerio<AnyNode>): DocEntry['properties'] {
    if (!this.source.selectors.properties) return [];

    const properties: NonNullable<DocEntry['properties']> = [];
    const sel = this.source.selectors.properties;

    $(sel.container, context).each((_, el) => {
        const $prop = $(el);
        const name = $prop.find(sel.name).text().trim();
        
        if (name) {
            properties.push({
                name,
                description: sel.description ? this.extractText($, sel.description, $prop) : [],
                type: sel.type ? $prop.find(sel.type).text().trim() : undefined,
                defaultValue: sel.defaultValue ? $prop.find(sel.defaultValue).text().trim() : undefined,
                isStatic: sel.isStatic ? $prop.find(sel.isStatic).length > 0 : undefined,
                isPrivate: sel.isPrivate ? $prop.find(sel.isPrivate).length > 0 : undefined,
                decorators: sel.decorators ? 
                    $prop.find(sel.decorators)
                        .map((_, el) => $(el).text().trim())
                        .get()
                        .filter(Boolean) : 
                    undefined
            });
        }
    });

    return properties;
  }

  private establishHierarchy(): void {
    console.log('Establishing hierarchy relationships...');
    // Build parent-child relationships based on IDs
    this.entries.forEach(entry => {
      const parts = entry.id.split('.');
      if (parts.length > 1) {
        const parentId = parts.slice(0, -1).join('.');
        const parent = this.entries.find(e => e.id === parentId);
        if (parent) {
          entry.parent = parentId;
          if (!parent.children) parent.children = [];
          parent.children.push(entry.id);
        }
      }
    });
    console.log('Hierarchy establishment complete');
  }
}
