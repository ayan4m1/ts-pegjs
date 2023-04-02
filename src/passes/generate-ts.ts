import type { Config, ast } from 'peggy';
import { TsPegjsParserBuildOptions } from '../types';

// The types for `SourceNode` are currently incorrect; override them with correct types.
type SourceNode = NonNullable<ast.Grammar['code']> & { children: (SourceNode | string)[] };

export const generateParser: Config['passes']['generate'][number] = (
  ast,
  options: TsPegjsParserBuildOptions,
  session
) => {
  const code = ast.code;
  if (!code) {
    throw new Error(
      `tspegjs requires peggy to generate source Javascript source code before continuing, but something went wrong and no generated source code was found`
    );
  }

  // We are using a mix of Typescript and Peggy-generated Javascript in this file.
  // We don't want Typescript to complain if a user configures options like `strict`,
  // There is no option to apply `@ts-ignore` to a block of code ( https://github.com/Microsoft/TypeScript/issues/19573 )
  // so instead we take an ugly approach: insert `@ts-ignore` comments before every line of source.
  //
  // An alternative is to add a // @ts-nocheck to the whole file, but that means the types that we
  // generate also won't be checked.
  annotateWithTsIgnore(code);

  const SourceNode = code.constructor as any;
  const rootNode: SourceNode = new SourceNode();

  // Store everything that Peggy generated for us so that we can manipulate the code.
  const destructuredParser: SourceNode = new SourceNode();
  rootNode.add(destructuredParser);
  destructuredParser.add(code);

  // Set a new rootNode that we control
  ast.code = rootNode;

  // Custom import statements should come near the top, if there are any
  if (options.tspegjs?.customHeader) {
    rootNode.prepend(options.tspegjs.customHeader + '\n\n');
  }

  // eslint in this repo is configured to disable @ts-ignore directives; we disable it.
  rootNode.prepend('/* eslint-disable */\n\n');

  // destructure what's been generated by Peggy so that we can re-export it.
  destructuredParser.prepend(
    `const peggyParser: {parse: any, SyntaxError: any, DefaultTracer?: any} = `
  );

  // These types are always the same
  rootNode.add(`
export interface FilePosition {
  offset: number;
  line: number;
  column: number;
}

export interface FileRange {
  start: FilePosition;
  end: FilePosition;
  source: string;
}

export interface LiteralExpectation {
  type: "literal";
  text: string;
  ignoreCase: boolean;
}

export interface ClassParts extends Array<string | ClassParts> {}

export interface ClassExpectation {
  type: "class";
  parts: ClassParts;
  inverted: boolean;
  ignoreCase: boolean;
}

export interface AnyExpectation {
  type: "any";
}

export interface EndExpectation {
  type: "end";
}

export interface OtherExpectation {
  type: "other";
  description: string;
}

export type Expectation = LiteralExpectation | ClassExpectation | AnyExpectation | EndExpectation | OtherExpectation;

declare class _PeggySyntaxError extends Error {
  public static buildMessage(expected: Expectation[], found: string | null): string;
  public message: string;
  public expected: Expectation[];
  public found: string | null;
  public location: FileRange;
  public name: string;
  constructor(message: string, expected: Expectation[], found: string | null, location: FileRange);
  format(sources: {
    grammarSource?: string;
    text: string;
  }[]): string;
}

export interface TraceEvent {
    type: string;
    rule: string;
    result?: any;
    location: FileRange;
  }

declare class _DefaultTracer {
  private indentLevel: number;
  public trace(event: TraceEvent): void;
}
\n`);

  const errorName = options.tspegjs?.errorName || 'PeggySyntaxError';
  // Very basic test to make sure no horrible identifier has been passed in
  if (errorName !== JSON.stringify(errorName).slice(1, errorName.length + 1)) {
    throw new Error(
      `The errorName ${JSON.stringify(errorName)} is not a valid Javascript identifier`
    );
  }

  rootNode.add(`peggyParser.SyntaxError.prototype.name = ${JSON.stringify(errorName)};\n`);

  rootNode.add(`
export interface ParseOptions {
  filename?: string;
  startRule?: string;
  tracer?: any;
  [key: string]: any;
}
export type ParseFunction = (input: string, options?: ParseOptions) => any;
export const parse: ParseFunction = peggyParser.parse;
`);
  rootNode.add(`
export const ${errorName} = peggyParser.SyntaxError as typeof _PeggySyntaxError;
`);
  if (options.trace) {
    rootNode.add(
      `\nexport const DefaultTracer = peggyParser.DefaultTracer as typeof _DefaultTracer;\n`
    );
  }
};

/**
 * Add `// @ts-ignore` before every line in `code`.
 */
function annotateWithTsIgnore(code: SourceNode) {
  if (!code.children || code.children.length === 0) {
    return;
  }
  const children = [...code.children];
  code.children.length = 0;
  for (const child of children) {
    if (typeof child === 'string') {
      if (tsIgnoreShouldApply(child)) {
        code.children.push('// @ts-ignore\n');
      }
      code.children.push(child);
    } else if (typeof child === 'object' && child.children) {
      annotateWithTsIgnore(child);
      code.children.push(child);
    }
  }
}

/**
 * Determine if a line has content.
 */
function tsIgnoreShouldApply(line: string): boolean {
  line = line.trim();
  if (!line || line.startsWith('//')) {
    return false;
  }
  // Pure punctuation doesn't need a @ts-ignore
  if (!line.match(/[a-zA-Z]/)) {
    return false;
  }
  return true;
}
