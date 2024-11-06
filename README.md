# doc-scraper

A flexible and configurable documentation scraper that can extract structured documentation from various sources.

## Features

- 🔍 Configurable CSS selectors for precise content extraction
- 📦 JSON-based configuration files with schema validation
- 🌲 Hierarchical documentation structure support
- 🏃‍♂️ Concurrent request handling
- 💾 Checkpoint system for resumable crawls
- 🚦 Rate limiting and depth control
- 📝 Detailed extraction of:
  - Classes, methods, and properties
  - Parameters and return types
  - Code examples with language detection
  - Documentation hierarchies
  - Method and property decorators

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/doc-scraper.git
cd doc-scraper

# Install dependencies
bun install
```

## Usage

### Basic Usage

```bash
# Crawl Python documentation (default)
bun start

# Crawl specific documentation with custom output
bun start python docs/python.json

# Resume from a checkpoint
bun start python docs/python.json python-checkpoint.json
```

### Configuration

Documentation sources are defined in JSON files in the `configs` directory. Each config file should follow the schema defined in `schemas/doc-source.schema.json`.

Example configuration for Python documentation:

```json
{
    "$schema": "../schemas/doc-source.schema.json",
    "name": "Python Documentation",
    "baseUrl": "https://docs.python.org/3/",
    "indexUrl": "https://docs.python.org/3/py-modindex.html",
    "version": "3.13",
    "defaultLanguage": "python",
    "selectors": {
        "navigationLinks": ".modindextable > tbody > tr > td > a",
        "contentLinks": "dl.py",
        "title": "h1",
        // ... more selectors
    }
}
```

### Adding New Documentation Sources

1. Create a new JSON file in the `configs` directory
2. Follow the schema defined in `schemas/doc-source.schema.json`
3. Configure the selectors and patterns for your documentation source
4. Run the scraper with your new config name

## Output Format

The scraper generates a JSON file containing an array of documentation entries. Each entry includes:

```typescript
interface DocEntry {
    id: string;                  // Unique identifier
    type: EntryType;            // 'class' | 'method' | 'function' | 'module' | 'property'
    namespace: string[];        // Hierarchical namespace
    name: string;              // Name of the entry
    title: string;             // Full title
    description: string[];     // Description paragraphs
    signature?: string;        // Function/method signature
    parameters?: Parameter[];  // Function/method parameters
    returns?: ReturnType;      // Return type information
    examples: Example[];       // Code examples
    methods?: Method[];        // Class methods
    properties?: Property[];   // Class properties
    // ... additional metadata
}
```

## Development

### Project Structure

```
doc-scraper/
├── src/
│   ├── cli.ts           # Command-line interface
│   ├── crawler.ts       # Main crawler implementation
│   ├── types.ts         # TypeScript type definitions
│   └── utils/           # Utility functions
├── configs/             # Documentation source configs
├── schemas/             # JSON schemas
└── tests/              # Test files
```

### Adding Features

1. Update the schema in `schemas/doc-source.schema.json`
2. Add corresponding types in `src/types.ts`
3. Implement the extraction logic in `src/crawler.ts`
4. Update existing configs to use new features

### Running Tests

```bash
bun test
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT

## Credits

Built with [Bun](https://bun.sh) and [Cheerio](https://cheerio.js.org/).

