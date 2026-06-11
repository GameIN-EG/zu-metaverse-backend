const IDP_DESCRIPTOR_OPEN = '<IDPSSODescriptor';
const IDP_DESCRIPTOR_CLOSE = '</IDPSSODescriptor>';

function extractIdpDescriptor(xml: string): string | null {
  const start = xml.indexOf(IDP_DESCRIPTOR_OPEN);
  if (start === -1) {
    return null;
  }

  const end = xml.indexOf(IDP_DESCRIPTOR_CLOSE, start);
  if (end === -1) {
    return null;
  }

  return xml.slice(start, end + IDP_DESCRIPTOR_CLOSE.length);
}

function isSigningKeyDescriptor(block: string): boolean {
  const useMatch = block.match(/<KeyDescriptor[^>]*\buse="([^"]+)"/i);
  if (!useMatch) {
    return true;
  }

  return useMatch[1].toLowerCase() === 'signing';
}

function extractCertificatesFromBlock(block: string): string[] {
  const certs: string[] = [];
  const keyDescriptorPattern = /<KeyDescriptor[\s\S]*?<\/KeyDescriptor>/gi;
  const matches = block.match(keyDescriptorPattern) ?? [];

  for (const keyDescriptor of matches) {
    if (!isSigningKeyDescriptor(keyDescriptor)) {
      continue;
    }

    const certMatches =
      keyDescriptor.match(/<X509Certificate>([\s\S]*?)<\/X509Certificate>/gi) ?? [];
    for (const certMatch of certMatches) {
      const inner = certMatch
        .replace(/<\/?X509Certificate>/gi, '')
        .replace(/\s+/g, '')
        .trim();
      if (inner.length > 0) {
        certs.push(formatPemCertificate(inner));
      }
    }
  }

  return [...new Set(certs)];
}

export function formatPemCertificate(base64Body: string): string {
  const normalized = base64Body.replace(/\s+/g, '');
  const lines = normalized.match(/.{1,64}/g) ?? [normalized];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
}

export function parseIdpSigningCertificates(xml: string): string[] {
  const idpDescriptor = extractIdpDescriptor(xml);
  if (!idpDescriptor) {
    return [];
  }

  return extractCertificatesFromBlock(idpDescriptor);
}

export function parseIdpEntityId(xml: string): string | null {
  const match = xml.match(/<EntityDescriptor[^>]*\bentityID="([^"]+)"/i);
  return match?.[1] ?? null;
}
