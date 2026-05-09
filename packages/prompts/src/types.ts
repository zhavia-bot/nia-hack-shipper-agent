/**
 * A versioned prompt template. Pin the version when calling so we can
 * attribute outputs to a specific prompt revision in the audit log.
 *
 * Convention: bump version on any non-trivial wording change. Older
 * versions are preserved (renamed to `*-vN`) so we can replay old
 * generations against the original prompt for backtesting.
 */
export interface PromptTemplate<TInput, TVars = Record<string, unknown>> {
  readonly name: string;
  readonly version: string;
  readonly system: string;
  readonly buildUser: (input: TInput) => string;
  readonly variables?: TVars;
}

export interface RenderedPrompt {
  name: string;
  version: string;
  system: string;
  user: string;
}

export function render<TInput>(
  template: PromptTemplate<TInput>,
  input: TInput
): RenderedPrompt {
  return {
    name: template.name,
    version: template.version,
    system: template.system,
    user: template.buildUser(input),
  };
}
