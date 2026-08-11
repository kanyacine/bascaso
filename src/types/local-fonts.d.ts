export {};

/**
 * Local Font Access API – not in TypeScript's DOM lib yet. Only the fields the editor reads.
 * https://developer.mozilla.org/en-US/docs/Web/API/Window/queryLocalFonts
 */
declare global {
  interface FontData {
    family: string;
    fullName: string;
    postscriptName: string;
    style: string;
  }

  interface Window {
    queryLocalFonts?: () => Promise<FontData[]>;
  }
}
