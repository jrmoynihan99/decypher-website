import { Great_Vibes } from "next/font/google";

/**
 * The e-signature face. Self-hosted through next/font so the on-screen
 * signature never waits on Google, and exposed as a CSS variable because the
 * policy document is an HTML string — its `.sig-script` rule can reach a
 * variable where it can't reach a className. Printed copies load the same
 * face from Google Fonts inside their own document.
 */
export const greatVibes = Great_Vibes({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-great-vibes",
});
