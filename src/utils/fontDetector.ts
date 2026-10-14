/**
 * Utility to detect and list all fonts installed on the user's computer (Windows, Mac, Linux).
 * Supports:
 * 1. Native Chromium Local Font Access API (window.queryLocalFonts) - 100% of OS fonts
 * 2. Canvas metric font probing (works in all browsers without permission prompt)
 * 3. LocalStorage caching for instant loading
 */

// Popular candidate Khmer fonts on Windows / Mac / Web
const CANDIDATE_KHMER_FONTS = [
  'Battambang',
  'Battambong',
  'Kantumruy Pro',
  'Nokora',
  'Hanuman',
  'Moul',
  'Content',
  'Siemreap',
  'Bokor',
  'Koulen',
  'Dangrek',
  'Fasthand',
  'Freehand',
  'Kdam Thmor Pro',
  'Odor Mean Chey',
  'Preahvihear',
  'Suwannaphum',
  'Taprom',
  'Chenla',
  'Bayon',
  'Angkor',
  'Khmer OS',
  'Khmer OS Battambang',
  'Khmer OS Muol',
  'Khmer OS Muol Light',
  'Khmer OS Muol Pali',
  'Khmer OS Siemreap',
  'Khmer OS Bokor',
  'Khmer OS Fasthand',
  'Khmer OS Freehand',
  'Khmer OS Metal Chrieng',
  'Khmer OS Content',
  'Khmer OS System',
  'Khmer UI',
  'Khmer UI Bold',
  'DaunPenh',
  'Leelawadee UI',
  'Leelawadee',
  'Tacteing',
];

// Popular candidate general system fonts
const CANDIDATE_SYSTEM_FONTS = [
  'Segoe UI',
  'Segoe UI Variable',
  'Calibri',
  'Cambria',
  'Candara',
  'Arial',
  'Arial Black',
  'Comic Sans MS',
  'Consolas',
  'Constantia',
  'Corbel',
  'Courier New',
  'Franklin Gothic Medium',
  'Gabriola',
  'Georgia',
  'Impact',
  'Lucida Console',
  'Lucida Sans Unicode',
  'Microsoft Sans Serif',
  'Palatino Linotype',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  'Century Gothic',
  'Garamond',
  'Book Antiqua',
  'Rockwell',
  'Baskerville',
  'Futura',
  'Gill Sans',
  'Helvetica',
  'Helvetica Neue',
  'Optima',
  'Didot',
  'San Francisco',
  'SF Pro Display',
  'Menlo',
  'Monaco',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Inter',
  'Oswald',
  'JetBrains Mono',
];

const LOCAL_STORAGE_KEY = 'jai_dubber_detected_system_fonts';

export interface DetectedFontsResult {
  khmerFonts: string[];
  systemFonts: string[];
  allFonts: string[];
  hasLocalFontAccess: boolean;
}

/**
 * Checks if a specific font is installed on the user's computer via Canvas metric probing.
 */
export function isFontAvailable(fontName: string): boolean {
  if (typeof document === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 40;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;

    const testString = 'mmmmmmmmmmlliWWWW ភាសាខ្មែរ 1234567890';
    const testSize = '72px';
    const baseFonts = ['monospace', 'sans-serif', 'serif'];

    for (const base of baseFonts) {
      ctx.font = `${testSize} ${base}`;
      const baseWidth = ctx.measureText(testString).width;

      ctx.font = `${testSize} "${fontName}", ${base}`;
      const fontWidth = ctx.measureText(testString).width;

      if (Math.abs(fontWidth - baseWidth) > 0.5) {
        return true;
      }
    }

    // Secondary test with document.fonts.check
    if (document.fonts && typeof document.fonts.check === 'function') {
      if (document.fonts.check(`16px "${fontName}"`)) {
        return true;
      }
    }
  } catch {}

  return false;
}

/**
 * Categorizes a font family name into Khmer vs other System font.
 */
export function isKhmerFont(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes('khmer') ||
    lower.includes('battambang') ||
    lower.includes('battambong') ||
    lower.includes('moul') ||
    lower.includes('kantumruy') ||
    lower.includes('nokora') ||
    lower.includes('hanuman') ||
    lower.includes('siemreap') ||
    lower.includes('bokor') ||
    lower.includes('koulen') ||
    lower.includes('dangrek') ||
    lower.includes('fasthand') ||
    lower.includes('freehand') ||
    lower.includes('kdam thmor') ||
    lower.includes('preahvihear') ||
    lower.includes('suwannaphum') ||
    lower.includes('daunpenh') ||
    lower.includes('chenla') ||
    lower.includes('bayon') ||
    lower.includes('angkor') ||
    lower.includes('tacteing') ||
    lower.includes('leelawadee')
  );
}

/**
 * Scan all fonts installed on the computer using window.queryLocalFonts()
 * This accesses the user's OS fonts directly (Chrome / Edge).
 */
export async function queryLocalSystemFonts(): Promise<string[] | null> {
  if (typeof window === 'undefined') return null;

  try {
    const win = window as any;
    if (typeof win.queryLocalFonts === 'function') {
      const fonts = await win.queryLocalFonts();
      if (Array.isArray(fonts) && fonts.length > 0) {
        const families = Array.from(
          new Set<string>(
            fonts.map((f: any) => (typeof f.family === 'string' ? f.family.trim() : '')).filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b));

        if (families.length > 0) {
          try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(families));
          } catch {}
          return families;
        }
      }
    }
  } catch (err) {
    console.warn('Native LocalFontAccess query notice:', err);
  }

  return null;
}

/**
 * Automatically detects installed fonts from cache, probe, or local font API.
 */
export async function detectAllSystemFonts(forceScan = false): Promise<DetectedFontsResult> {
  let storedFamilies: string[] = [];

  // 1. Check local storage cache
  if (!forceScan) {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        storedFamilies = JSON.parse(cached);
      }
    } catch {}
  }

  // 2. If force scan or no cache, try native queryLocalFonts() if user triggered or permitted
  if (forceScan) {
    const nativeFonts = await queryLocalSystemFonts();
    if (nativeFonts && nativeFonts.length > 0) {
      storedFamilies = nativeFonts;
    }
  }

  // 3. Fallback / supplement: probe known candidate fonts via Canvas
  const detectedKhmerSet = new Set<string>();
  const detectedSystemSet = new Set<string>();

  // If we already have a rich list from native query or cache
  if (storedFamilies.length > 0) {
    for (const f of storedFamilies) {
      if (isKhmerFont(f)) {
        detectedKhmerSet.add(f);
      } else {
        detectedSystemSet.add(f);
      }
    }
  }

  // Ensure baseline Khmer Google fonts are always available
  const standardKhmer = [
    'Battambang',
    'Battambong',
    'Nokora',
    'Hanuman',
    'Moul',
    'Content',
    'Kantumruy Pro',
    'Siemreap',
    'Bokor',
    'Koulen',
  ];
  standardKhmer.forEach((f) => detectedKhmerSet.add(f));

  // Probe candidates if we don't have native OS font list
  if (storedFamilies.length === 0) {
    for (const f of CANDIDATE_KHMER_FONTS) {
      if (isFontAvailable(f)) {
        detectedKhmerSet.add(f);
      }
    }

    for (const f of CANDIDATE_SYSTEM_FONTS) {
      if (isFontAvailable(f)) {
        detectedSystemSet.add(f);
      }
    }

    // Save probed results to cache
    const combined = Array.from(new Set([...detectedKhmerSet, ...detectedSystemSet])).sort();
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(combined));
    } catch {}
  }

  const khmerList = Array.from(detectedKhmerSet).sort((a, b) => a.localeCompare(b));
  const systemList = Array.from(detectedSystemSet).sort((a, b) => a.localeCompare(b));
  const allList = [...khmerList, ...systemList];

  const hasLocalFontAccess =
    typeof window !== 'undefined' && typeof (window as any).queryLocalFonts === 'function';

  return {
    khmerFonts: khmerList,
    systemFonts: systemList,
    allFonts: allList,
    hasLocalFontAccess,
  };
}
