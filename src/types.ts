export interface DocSource {
    /** Human-readable name of the documentation source (e.g., "Python Documentation") */
    name: string;

    /** Base URL for the documentation (e.g., "https://docs.python.org/3/") */
    baseUrl: string;

    /** Version of the documentation being crawled (e.g., "3.13") */
    version?: string;

    /** URL where crawling should begin - typically an index or contents page */
    indexUrl: string;

    /** CSS selectors used to locate different elements in the documentation */
    selectors: {
        // Navigation/structure selectors
        /** Selector for primary navigation links (e.g., links to major sections or modules)
         * Example: ".nav-item > a" */
        navigationLinks: string;

        /** Optional selector for secondary navigation (e.g., subsection links within a module)
         * Example: ".subnav > a" */
        subNavigationLinks?: string;

        /** Selector for links to actual documentation entries (functions, classes, etc.)
         * Example: "dt[id]" */
        contentLinks: string;

        // Content selectors
        /** Selector for the title of a documentation entry
         * Example: "h1.section-title" */
        title: string;

        /** Selector for the name of the entry */
        name: string;

        /** Optional selector for the ID of the entry. If not provided, 
         * ID will be constructed from namespace and name */
        id?: string;

        /** Array of selectors for description paragraphs, tried in order
         * Example: [".section > p:first-of-type", "dl.describe > dd > p"] */
        description: string[];

        /** Array of selectors for code examples with optional language hints
         * Can be a simple string[] or an array of objects with language info */
        examples: Array<string | ExampleConfig>;

        /** Configuration for parameter extraction. Can be simple string[] or array of detailed configs */
        parameters?: Array<string | ParameterConfig>;

        /** Optional selector for return value information
         * Example: ".sig-return-typehint" */
        returns?: string;

        /** Optional selector to help determine the type of entry (class, function, etc.)
         * Example: ".sig-prename" */
        type?: string;

        /** Optional selector for namespace/module information
         * Example: ".nav-item-this > a" */
        namespace?: string;

        /** Optional selector for the full signature */
        signature?: string;

        // New selectors for class members
        /** Selector for class methods within a class definition */
        methods?: {
            /** Selector to find all method blocks */
            container: string;
            /** Selector for the method name */
            name: string;
            /** Selector for method description */
            description: string[];
            /** Selector for method signature */
            signature?: string;
            /** Selector for static method indicator */
            isStatic?: string;
            /** Selector for private method indicator */
            isPrivate?: string;
            /** Selector for method decorators */
            decorators?: string;
        };

        /** Selector for class properties within a class definition */
        properties?: {
            /** Selector to find all property blocks */
            container: string;
            /** Selector for the property name */
            name: string;
            /** Selector for property description */
            description?: string[];
            /** Selector for property type */
            type?: string;
            /** Selector for property default value */
            defaultValue?: string;
            /** Selector for static property indicator */
            isStatic?: string;
            /** Selector for private property indicator */
            isPrivate?: string;
            /** Selector for property decorators */
            decorators?: string;
        };
    };

    /** Regular expressions to identify different types of documentation entries */
    patterns: {
        /** Pattern to identify class definitions
         * Example: /class\s+\w+/ */
        isClass: RegExp | string;

        /** Pattern to identify method definitions
         * Example: /def\s+\w+\s*\(/ */
        isMethod: RegExp | string;

        /** Pattern to identify function definitions
         * Example: /[a-z_]\w*\s*\(/ */
        isFunction: RegExp | string;

        /** Pattern to identify module definitions
         * Example: /^module\s+\w+/ */
        isModule: RegExp | string;

        /** Pattern to identify property definitions
         * Example: /@property/ */
        isProperty: RegExp | string;

        /** Pattern to extract the name from the selected element
         * Should include at least one capture group */
        nameExtract: RegExp | string;

        /** Optional pattern to extract the ID from the selected element
         * Should include at least one capture group */
        idExtract?: RegExp | string;

        /** Optional pattern to clean up the signature */
        signatureClean?: RegExp | string;
    };

    /** Default language for code examples when not specified */
    defaultLanguage: string;
}

export type EntryType = 'class' | 'method' | 'function' | 'module' | 'property' | 'interface';

export interface Parameter {
    name: string;
    type?: string;
    description: string;
    optional?: boolean;
    default?: string;
    isRest?: boolean;
}

export interface ReturnType {
    type?: string;
    description?: string;
}

export interface Example {
    code: string;
    description?: string;
    language: string;
}

export interface Method {
    name: string;
    description: string[];
    signature?: string;
    parameters?: Parameter[];
    returns?: ReturnType;
    examples?: Example[];
    isStatic?: boolean;
    isPrivate?: boolean;
    decorators?: string[];
}

export interface Property {
    name: string;
    description: string[];
    type?: string;
    defaultValue?: string;
    isStatic?: boolean;
    isPrivate?: boolean;
    decorators?: string[];
}

export interface DocEntry {
    id: string;
    type: EntryType;
    namespace: string[];
    name: string;
    title: string;
    description: string[];
    signature?: string;
    source: {
        name: string;
        url: string;
        normalizedUrl: string;
        version?: string;
    };
    syntax?: string[];
    parameters?: Parameter[];
    returns?: ReturnType;
    examples: Example[];
    seeAlso?: string[];
    parent?: string;
    children?: string[];
    scrapedAt: string;
    methods?: Method[];
    properties?: Property[];
}

export interface ParameterConfig {
    /** Selector for the parameter element */
    selector: string;
    /** Optional selector for parameter name within the parameter element */
    nameSelector?: string;
    /** Optional selector for parameter type within the parameter element */
    typeSelector?: string;
    /** Optional selector for parameter description within the parameter element */
    descriptionSelector?: string;
    /** Optional selector for default value within the parameter element */
    defaultSelector?: string;
    /** Pattern to determine if parameter is optional */
    optionalPattern?: RegExp | string;
    /** Pattern to extract parameter name */
    namePattern?: RegExp | string;
    /** Pattern to extract parameter type */
    typePattern?: RegExp | string;
    /** Pattern to extract default value */
    defaultPattern?: RegExp | string;
    /** Pattern to identify rest parameters (e.g., *args, **kwargs) */
    restPattern?: RegExp | string;
}

export interface ExampleConfig {
    selector: string;
    language?: string;
    languageAttr?: string;
    languageClass?: RegExp | string;
}