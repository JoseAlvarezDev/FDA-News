export const FINNHUB_KEY = import.meta.env.FINNHUB_API_KEY;
const BASE_URL = 'https://finnhub.io/api/v1';

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
        if (upper.includes(key)) return val;
    }

    // Fallback to API search if no override
    if (!FINNHUB_KEY || FINNHUB_KEY === 'DEMO') return null;

    try {
        const res = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(companyName)}&token=${FINNHUB_KEY}`);
        const data = await res.json();
        if (data.result && data.result.length > 0) {
            // Prefer US listings
            const best = data.result.find((r: any) => !r.symbol.includes('.')) || data.result[0];
            return best.symbol;
        }
    } catch (e) {
        console.error('Error searching symbol:', e);
    }
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
    // Fetch quotes and profiles in parallel for all symbols
    // Note: This makes 2 requests per symbol. Be mindful of rate limits.
    const promises = PHARMA_SYMBOLS.map(async (sym) => {
        const quote = await getQuote(sym);
        if (!quote) return null;

        // Fetch logo via profile
        const profile = await getCompanyProfile(sym);
        if (profile) {
            quote.logo = profile.logo;
            quote.name = profile.name;
        }
        return quote;
    });

    const results = await Promise.all(promises);
    return results.filter((q): q is Quote => q !== null);
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
    // Fetch news for a subset of major movers to avoid rate limits (top 3 + usually active ones)
    const keySyms = ['LLY', 'NVO', 'PFE', 'MRK', 'VRTX'];

    const promises = keySyms.map(sym => getCompanyNews(sym));
    const results = await Promise.all(promises);

    // Flatten and sort by date desc
    const allNews = results.flat();

    // Filter for FDA related keywords to ensure relevance
    const fdaNews = allNews.filter(item => {
        const text = (item.headline + ' ' + item.summary).toUpperCase();
        return text.includes('FDA') || text.includes('APPROVAL') || text.includes('REJECT') || text.includes('CLINICAL');
    });

    return fdaNews.sort((a, b) => b.datetime - a.datetime).slice(0, 15);
}
