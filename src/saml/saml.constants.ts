// Identifier for the federated identity provider (Zayed University ADFS).
// This describes the IdP, not the application, so it is safe to keep generic.
export const SAML_PROVIDER_ZU_ADFS = 'zu-adfs';

export const DEFAULT_CLAIM_EMAIL =
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress';
export const DEFAULT_CLAIM_NAME = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name';
export const DEFAULT_CLAIM_UPN = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn';

export const IDP_METADATA_CACHE_ID = 'zu-adfs';

export const SAML_EXCHANGE_CODE_TTL_SECONDS = 60;

// Default route paths used to derive SP entity ID / ACS URL from PUBLIC_BASE_URL.
export const SAML_METADATA_PATH = '/api/V1/auth/saml/metadata';
export const SAML_ACS_PATH = '/api/V1/auth/saml/acs';
