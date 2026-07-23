/**
 * A job application from the careers page.
 *
 * Kept deliberately small for now — name, email, a link, an optional note — but
 * structured so growing it is mechanical. To add a field: add it here, add one
 * input to ApplicationModal, one line to parseApplication in the route, one row
 * to the Slack block in postApplicationToSlack, and it flows into Firestore for
 * free (the store writes the whole object). Those four spots are the contract.
 *
 * `role` and `department` are not typed by the applicant — they're captured from
 * whichever job card opened the form, so a submission always knows what it's for.
 */

export interface Application {
  /** Job title, e.g. "Senior Tax Associate". Captured from the card. */
  role: string;
  /** Department chip on the card, e.g. "Tax". Captured from the card. */
  department: string;
  name: string;
  email: string;
  /** LinkedIn / portfolio / resume URL. Required — it's the actual application. */
  link: string;
  /** Optional cover note / "why this role". */
  message: string;
}
