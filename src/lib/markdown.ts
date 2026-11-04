/** Quita frontmatter YAML (`--- ... ---`) si existe. */
export function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---")) return markdown
  const end = markdown.indexOf("\n---", 3)
  if (end === -1) return markdown
  const after = markdown.slice(end + 4)
  return after.replace(/^\r?\n/, "")
}
