/**
 * Affiliate Link Generation Service
 * Generates search URLs with affiliate tags for various retailers
 */

// Affiliate IDs from environment variables (or placeholders)
const AFFILIATE_IDS = {
  amazon: process.env.EXPO_PUBLIC_AMAZON_AFFILIATE_ID || 'kandu-20',
  homeDepot: process.env.EXPO_PUBLIC_HOMEDEPOT_AFFILIATE_ID || '',
  lowes: process.env.EXPO_PUBLIC_LOWES_AFFILIATE_ID || '',
  autoZone: process.env.EXPO_PUBLIC_AUTOZONE_AFFILIATE_ID || '',
  advanceAuto: process.env.EXPO_PUBLIC_ADVANCE_AUTO_AFFILIATE_ID || '',
};

export type RetailerType = 'amazon' | 'homeDepot' | 'lowes' | 'autoZone' | 'advanceAuto';

export interface AffiliateLink {
  url: string;
  retailer: RetailerType;
  displayName: string;
  icon: string; // Emoji or icon name
}

/**
 * Generate Amazon search URL with affiliate tag
 */
export function generateAmazonLink(searchTerms: string): AffiliateLink {
  const encodedSearch = encodeURIComponent(searchTerms);
  const tag = AFFILIATE_IDS.amazon;

  return {
    url: `https://www.amazon.com/s?k=${encodedSearch}&tag=${tag}`,
    retailer: 'amazon',
    displayName: 'Amazon',
    icon: '📦',
  };
}

/**
 * Generate Home Depot search URL with affiliate tag
 */
export function generateHomeDepotLink(searchTerms: string): AffiliateLink {
  const encodedSearch = encodeURIComponent(searchTerms);
  const affiliateParam = AFFILIATE_IDS.homeDepot ? `&affiliateId=${AFFILIATE_IDS.homeDepot}` : '';

  return {
    url: `https://www.homedepot.com/s/${encodedSearch}?NCNI-5${affiliateParam}`,
    retailer: 'homeDepot',
    displayName: 'Home Depot',
    icon: '🏠',
  };
}

/**
 * Generate Lowe's search URL with affiliate tag
 */
export function generateLowesLink(searchTerms: string): AffiliateLink {
  const encodedSearch = encodeURIComponent(searchTerms);
  const affiliateParam = AFFILIATE_IDS.lowes ? `&affiliateId=${AFFILIATE_IDS.lowes}` : '';

  return {
    url: `https://www.lowes.com/search?searchTerm=${encodedSearch}${affiliateParam}`,
    retailer: 'lowes',
    displayName: "Lowe's",
    icon: '🔧',
  };
}

/**
 * Generate AutoZone search URL with affiliate tag
 */
export function generateAutoZoneLink(searchTerms: string): AffiliateLink {
  const encodedSearch = encodeURIComponent(searchTerms);

  return {
    url: `https://www.autozone.com/searchresult?searchText=${encodedSearch}`,
    retailer: 'autoZone',
    displayName: 'AutoZone',
    icon: '🚗',
  };
}

/**
 * Generate Advance Auto Parts search URL with affiliate tag
 */
export function generateAdvanceAutoLink(searchTerms: string): AffiliateLink {
  const encodedSearch = encodeURIComponent(searchTerms);

  return {
    url: `https://shop.advanceautoparts.com/web/PartSearchCmd?storeId=10151&catalogId=10051&langId=-1&pageId=partSearchResults&searchTerm=${encodedSearch}`,
    retailer: 'advanceAuto',
    displayName: 'Advance Auto',
    icon: '🔩',
  };
}

/**
 * Get the best retailer links based on category
 * Returns multiple options for the user to choose from
 */
export function getLinksForCategory(
  searchTerms: string,
  category: string
): AffiliateLink[] {
  const links: AffiliateLink[] = [];

  // Amazon is always an option
  links.push(generateAmazonLink(searchTerms));

  switch (category.toLowerCase()) {
    case 'plumbing':
    case 'hvac':
    case 'electrical':
      links.push(generateHomeDepotLink(searchTerms));
      links.push(generateLowesLink(searchTerms));
      break;

    case 'automotive':
      links.push(generateAutoZoneLink(searchTerms));
      links.push(generateAdvanceAutoLink(searchTerms));
      break;

    case 'appliances':
      // Amazon is usually best for appliance parts
      links.push(generateHomeDepotLink(searchTerms));
      break;

    default:
      // For 'other' or unknown categories, offer Home Depot as backup
      links.push(generateHomeDepotLink(searchTerms));
      break;
  }

  return links;
}

/**
 * Get the primary (recommended) retailer for a category
 */
export function getPrimaryRetailer(category: string): RetailerType {
  switch (category.toLowerCase()) {
    case 'plumbing':
    case 'hvac':
    case 'electrical':
      return 'homeDepot';
    case 'automotive':
      return 'autoZone';
    case 'appliances':
    default:
      return 'amazon';
  }
}

/**
 * Generate the primary affiliate link for a product based on category
 */
export function generatePrimaryLink(
  searchTerms: string,
  category: string
): AffiliateLink {
  const primaryRetailer = getPrimaryRetailer(category);

  switch (primaryRetailer) {
    case 'homeDepot':
      return generateHomeDepotLink(searchTerms);
    case 'lowes':
      return generateLowesLink(searchTerms);
    case 'autoZone':
      return generateAutoZoneLink(searchTerms);
    case 'advanceAuto':
      return generateAdvanceAutoLink(searchTerms);
    case 'amazon':
    default:
      return generateAmazonLink(searchTerms);
  }
}
