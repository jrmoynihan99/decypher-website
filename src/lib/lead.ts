/**
 * The estimator's lead — shape and consent wording.
 *
 * This lives in lib rather than beside the modal because the server route needs
 * it too, and the modal is a client component. The consent string is stored on
 * every lead as `consentText`: it's the audit trail of the exact wording someone
 * agreed to, so editing the constant must never retroactively change what a
 * past lead is recorded as having consented to.
 */

export const CONSENT_TEXT =
  "I understand this is an estimate, not tax advice, and agree to be contacted by DeCypher Financials about my taxes.";

export interface Lead {
  name: string;
  email: string;
  phone: string;
  isCreator: boolean;
  platform: string;
  username: string;
  revenueBand: string;
  consent: true;
  consentText: string;
}
