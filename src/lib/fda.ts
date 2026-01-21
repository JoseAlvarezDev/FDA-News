


export const OPENFDA_KEY = import.meta.env.OPENFDA_ENFORCEMENT;
export const OPENFDA_BASE = 'https://api.fda.gov/drug/drugsfda.json';
export const OPENFDA_ENFORCEMENT = 'https://api.fda.gov/drug/enforcement.json';

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

function getAuthParam() {
    return OPENFDA_KEY ? `&api_key=${OPENFDA_KEY}` : '';
}

interface OpenFDAResult {
    application_number: string;
    sponsor_name: string;
    products: {
        brand_name: string;
        marketing_status: string;
        active_ingredients: { name: string; strength: string }[];
    }[];
    submissions: {
        submission_status_date: string;
        submission_type: string;
    }[];
}

export async function getRecentApprovals(limit = 20) {
    const cacheKey = `approvals_${limit}_2026`;
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    try {
        // Query for recent approvals strictly in 2026, sorting by submission status date
        const search = `submissions.submission_status_date:[20260101+TO+20261231]`;
        const url = `${OPENFDA_BASE}?limit=${limit}&sort=submissions.submission_status_date:desc&search=${search}${getAuthParam()}`;

        const res = await fetch(url);
        const data = await res.json();

        if (!data.results) return [];

        const results = data.results as OpenFDAResult[];
        setCacheData(cacheKey, results);
        return results;
    } catch (error) {
        console.error('Error fetching approvals:', error);
        return [];
    }
}

interface EnforcementResult {
    recall_number: string;
    reason_for_recall: string;
    status: string;
    distribution_pattern: string;
    product_description: string;
    recall_initiation_date: string;
    report_date: string;
    recalling_firm: string;
    voluntary_mandated: string;
}

export async function getLatestNews() {
    const cacheKey = 'latest_news_2026';
    const cached = getCachedData(cacheKey);
    if (cached) return cached;

    try {
        // Query for latest enforcement reports (Recalls) in 2026
        const search = `report_date:[20260101+TO+20261231]`;
        const url = `${OPENFDA_ENFORCEMENT}?limit=20&sort=report_date:desc&search=${search}${getAuthParam()}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data.results) return [];
        const results = data.results as EnforcementResult[];

        // Map and ensure strict 2026 data
        const mappedResults = results
            .filter(item => item.report_date && item.report_date.startsWith('2026'))
            .map(item => ({
                title: `Recall: ${item.recalling_firm} - ${item.product_description.substring(0, 60)}...`,
                link: `https://www.accessdata.fda.gov/scripts/ires/index.cfm`,
                pubDate: item.report_date,
                contentSnippet: `Status: ${item.status}. Reason: ${item.reason_for_recall}`
            }));

        setCacheData(cacheKey, mappedResults);
        return mappedResults;
    } catch (error) {
        console.error('Error fetching enforcement news:', error);
        return [];
    }
}
