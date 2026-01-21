export const FINNHUB_KEY = import.meta.env.FINNHUB_API_KEY;
const BASE_URL = 'https://finnhub.io/api/v1';

// Simple in-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedData(key: string) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    return null;
}

function setCacheData(key: string, data: any) {
    cache.set(key, { data, timestamp: Date.now() });
}

interface CandleData {
    c: number[]; // close
    h: number[]; // high
    l: number[]; // low
    o: number[]; // open
    t: number[]; // timestamp
    s: string;   // status
}

export interface ChartPoint {
    time: string; // YYYY-MM-DD
    open: number;
    high: number;
    low: number;
    close: number;
}

export async function getSymbolForCompany(companyName: string): Promise<string | null> {
    const cacheKey = `symbol_${companyName}`;
    const cached = getCachedData(cacheKey);
    if (cached !== null) return cached;

    // Manual overrides for common massive pharma to ensure accuracy
    const overrides: Record<string, string> = {
        'NOVO NORDISK': 'NVO',
        'ELI LILLY': 'LLY',
        'PFIZER': 'PFE',
        'MODERNA': 'MRNA',
        'ASTRAZENECA': 'AZN',
        'MERCK': 'MRK',
        'JOHNSON & JOHNSON': 'JNJ',
        'BRISTOL MYERS SQUIBB': 'BMY',
        'AMGEN': 'AMGN',
        'GILEAD': 'GILD',
        'REGENERON': 'REGN',
        'SANOFI': 'SNY',
        'VERTEX': 'VRTX',
        'BIOGEN': 'BIIB'
    };

    const upper = companyName.toUpperCase();
    for (const [key, val] of Object.entries(overrides)) {
        if (upper.includes(key)) {
            setCacheData(cacheKey, val);
            return val;
        }
    }

    // Fallback to API search if no override
    if (!FINNHUB_KEY || FINNHUB_KEY === 'DEMO') return null;

    try {
        const res = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(companyName)}&token=${FINNHUB_KEY}`);
        const data = await res.json();
        if (data.result && data.result.length > 0) {
            // Prefer US listings
            const best = data.result.find((r: any) => !r.symbol.includes('.')) || data.result[0];
            setCacheData(cacheKey, best.symbol);
            return best.symbol;
        }
    } catch (e) {
        console.error('Error searching symbol:', e);
    }
    setCacheData(cacheKey, null);
    return null;
}

export async function getStockHistory(symbol: string): Promise<ChartPoint[]> {
    try {
        // Get last ~3 months of data (Daily resolution 'D')
        // Timestamps in seconds
        const to = Math.floor(Date.now() / 1000);
        const from = to - (90 * 24 * 60 * 60);

        const url = `${BASE_URL}/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${FINNHUB_KEY}`;
        const res = await fetch(url);
        const data: CandleData = await res.json();

        if (data.s === 'ok' && data.t) {
            return data.t.map((timestamp, i) => {
                const date = new Date(timestamp * 1000);
                return {
                    time: date.toISOString().split('T')[0],
                    open: data.o[i],
                    high: data.h[i],
                    low: data.l[i],
                    close: data.c[i]
                };
            });
        }
    } catch (e) {
        console.error('Error fetching candles:', e);
    }

    // Return empty if failed
    return [];
}

export interface Quote {
    symbol: string;
    price: number;
    change: number;
    percentChange: number;
    logo?: string;
    name?: string;
}

export const PHARMA_SYMBOLS = [
    'LLY',  // Eli Lilly
    'NVO',  // Novo Nordisk
    'JNJ',  // Johnson & Johnson
    'MRK',  // Merck
    'ABBV', // AbbVie
    'PFE',  // Pfizer
    'AMGN', // Amgen
    'VRTX', // Vertex
    'GILD', // Gilead
    'REGN'  // Regeneron
];

export async function getQuote(symbol: string): Promise<Quote | null> {
    try {
        const url = `${BASE_URL}/quote?symbol=${symbol}&token=${FINNHUB_KEY}`;
        const res = await fetch(url);
        const data = await res.json();

        // c: Current price, d: Change, dp: Percent change
        if (data.c) {
            return {
                symbol,
                price: data.c,
                change: data.d,
                percentChange: data.dp
            };
        }
    } catch (e) {
        console.error(`Error fetching quote for ${symbol}:`, e);
    }
    return null;
}

export async function getCompanyProfile(symbol: string): Promise<{ logo?: string; name?: string } | null> {
    try {
        const url = `${BASE_URL}/stock/profile2?symbol=${symbol}&token=${FINNHUB_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        return {
            logo: data.logo,
            name: data.name
        };
    } catch (e) {
        console.error(`Error fetching profile for ${symbol}:`, e);
        return null;
    }
}

export async function getPharmaQuotes(): Promise<Quote[]> {
    const cacheKey = 'pharma_quotes_2026';
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    // Fetch quotes and profiles in parallel for all symbols
    const promises = PHARMA_SYMBOLS.map(async (sym) => {
        // Internal parallelization for symbol details
        const [quote, profile] = await Promise.all([
            getQuote(sym),
            getCompanyProfile(sym)
        ]);

        if (!quote) return null;

        if (profile) {
            quote.logo = profile.logo;
            quote.name = profile.name;
        }
        return quote;
    });

    const results = await Promise.all(promises);
    const filtered = results.filter((q): q is Quote => q !== null);
    setCacheData(cacheKey, filtered);
    return filtered;
}

export interface CompanyNews {
    category: string;
    datetime: number; // Unix timestamp
    headline: string;
    id: number;
    image: string;
    related: string;
    source: string;
    summary: string;
    url: string;
}

export async function getCompanyNews(symbol: string): Promise<CompanyNews[]> {
    try {
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Last 30 days

        const url = `${BASE_URL}/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_KEY}`;
        const res = await fetch(url);
        const data = await res.json();

        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.error(`Error fetching news for ${symbol}:`, e);
        return [];
    }
}

export async function getPharmaMarketNews(): Promise<CompanyNews[]> {
    const cacheKey = 'pharma_market_news_2026';
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    // Fetch news for a subset of major movers to avoid rate limits
    const keySyms = ['LLY', 'NVO', 'PFE', 'MRK', 'VRTX'];

    const promises = keySyms.map(sym => getCompanyNews(sym));
    const results = await Promise.all(promises);

    const allNews = results.flat();

    // Year 2026 range in Unix seconds
    const start2026 = 1735689600; // 2026-01-01 00:00:00
    const end2026 = 1767139199;   // 2026-12-31 23:59:59

    const filteredNews = allNews.filter(item => {
        const is2026 = item.datetime >= start2026 && item.datetime <= end2026;
        if (!is2026) return false;

        const text = (item.headline + ' ' + item.summary).toUpperCase();
        return text.includes('FDA') || text.includes('APPROVAL') || text.includes('REJECT') || text.includes('CLINICAL');
    });

    const finalNews = filteredNews.sort((a, b) => b.datetime - a.datetime).slice(0, 15);
    setCacheData(cacheKey, finalNews);
    return finalNews;
}
