import type { DocSource } from "../types";
import { join } from "node:path";

export async function loadConfig(name: string): Promise<DocSource> {
    const configPath = join(process.cwd(), 'configs', `${name}.json`);
    
    try {
        const configFile = Bun.file(configPath);
        const config = await configFile.json() as DocSource;
        
        // Validate against schema
        const schemaPath = join(process.cwd(), 'schemas', 'doc-source.schema.json');
        const schema = await Bun.file(schemaPath).json();
        
        // TODO: Add schema validation here if desired
        
        // Convert string patterns to RegExp
        if (config.patterns) {
            for (const [key, pattern] of Object.entries(config.patterns)) {
                if (typeof pattern === 'string') {
                    const flags = pattern.startsWith('/') && pattern.includes('/', 1) 
                        ? pattern.slice(pattern.lastIndexOf('/') + 1)
                        : '';
                    const source = pattern.startsWith('/')
                        ? pattern.slice(1, pattern.lastIndexOf('/'))
                        : pattern;
                    config.patterns[key as keyof typeof config.patterns] = new RegExp(source, flags);
                }
            }
        }
        
        return config;
    } catch (error: unknown) {
        throw new Error(`Failed to load config for ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
} 