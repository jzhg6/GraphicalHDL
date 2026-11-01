import type { GeneratedSourceRange } from "@graphicalhdl/ir";

export interface SourceOrigin {
  jsonPointer: string;
  level: 1 | 2 | 3;
  ownerId: string;
  elementId: string;
  pinOrNetId?: string;
}

export class CodeWriter {
  readonly #artifactPath: string;
  readonly #lines: string[] = [];
  readonly #ranges: GeneratedSourceRange[] = [];

  constructor(artifactPath: string) {
    this.#artifactPath = artifactPath;
  }

  get nextLine(): number {
    return this.#lines.length + 1;
  }

  line(text = "", origin?: SourceOrigin): void {
    const line = this.nextLine;
    this.#lines.push(text);
    if (origin) {
      this.#ranges.push({
        artifactPath: this.#artifactPath,
        startLine: line,
        endLine: line,
        ...origin,
      });
    }
  }

  markRange(startLine: number, origin: SourceOrigin): void {
    this.#ranges.push({
      artifactPath: this.#artifactPath,
      startLine,
      endLine: Math.max(startLine, this.#lines.length),
      ...origin,
    });
  }

  finish(): { content: string; ranges: GeneratedSourceRange[] } {
    return {
      content: `${this.#lines.join("\n")}\n`,
      ranges: this.#ranges,
    };
  }
}
