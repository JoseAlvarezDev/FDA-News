


export const OPENFDA_KEY = import.meta.env.OPENFDA_API_KEY;
export const OPENFDA_BASE = 'https://api.fda.gov/drug/drugsfda.json';
export const OPENFDA_ENFORCEMENT = 'https://api.fda.gov/drug/enforcement.json';

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

export async function getRecentApprovals(limit = 5) {
    try {
        // Query for recent approvals in 2026, sorting by submission status date
        // Note: Using a date range search to strictly filter for 2026
        const search = `submissions.submission_status_date:[20260101+TO+20261231]`;
        const url = `${OPENFDA_BASE}?limit=${limit}&sort=submissions.submission_status_date:desc&search=${search}${getAuthParam()}`;

        const res = await fetch(url);
        const data = await res.json();

        if (!data.results) return [];

        return data.results as OpenFDAResult[];
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
    try {
        // Query for latest enforcement reports (Recalls) sorted by report_date
        const url = `${OPENFDA_ENFORCEMENT}?limit=10&sort=report_date:desc${getAuthParam()}`;
        const res = await fetch(url);
        const data = await res.json();
        const results = data.results as EnforcementResult[];

        // Map to a NewsItem-like structure for the UI
        return results.map(item => ({
            title: `Recall: ${item.recalling_firm} - ${item.product_description.substring(0, 60)}...`,
            link: `https://www.accessdata.fda.gov/scripts/ires/index.cfm`,
            pubDate: item.report_date, // Format: YYYYMMDD
            contentSnippet: `Status: ${item.status}. Reason: ${item.reason_for_recall}`
        }));
    } catch (error) {
        console.error('Error fetching enforcement news:', error);
        return [];
    }
}
