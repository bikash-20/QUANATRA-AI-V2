export function stabilizeStreamingMarkdown(content: string): string {
  let safe = content;
  const fenceCount = (safe.match(/```/g) ?? []).length;
  if (fenceCount % 2 !== 0) safe += '\n```';

  const inlineMathOpeners = [...safe.matchAll(/(?<!\\)\$/g)].length;
  if (inlineMathOpeners % 2 !== 0) safe += '$';

  const displayOpeners = [...safe.matchAll(/\\\[/g)].length;
  const displayClosers = [...safe.matchAll(/\\\]/g)].length;
  if (displayOpeners > displayClosers) safe += '\\]';

  return safe;
}
