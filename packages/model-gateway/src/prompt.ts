export type UntrustedSource = "repository" | "web" | "upload";

/**
 * Repository, web and uploaded text is data, not instructions (threat model: malicious repo
 * instructions). The markers are what the security test looks for.
 */
export function untrustedBlock(source: UntrustedSource, text: string): string {
  const safe = text.replaceAll("</untrusted-content>", "<\\/untrusted-content>");
  return `<untrusted-content source="${source}">\n${safe}\n</untrusted-content>`;
}

export function isUntrustedLabelled(text: string): boolean {
  return (
    text.includes('<untrusted-content source="repository"') ||
    text.includes('<untrusted-content source="web"') ||
    text.includes('<untrusted-content source="upload"')
  );
}
