export interface SeededSource {
    name: string;
    source_id: string;
    first_chunk_id: string | null;
}
export interface SearchScenario {
    name: string;
    query: string;
    source: string;
    expect: string;
    limit?: number;
    description: string;
}
export interface GetScenario {
    name: string;
    source: string;
    chunk_id: string;
    expect: string;
    description: string;
}
export type EvalCategory = 'search' | 'retrieval' | 'lifecycle' | 'capture' | 'retention' | 'cost' | 'dedupe';
export interface EvalCaseResult {
    name: string;
    category: EvalCategory;
    passed: boolean;
    description: string;
    detail: string;
    returned_bytes: number;
    result_count: number;
}
export interface EvalReport {
    version: 1;
    summary: {
        passed: number;
        failed: number;
        total: number;
        score_pct: number;
        returned_bytes: number;
    };
    sections: Array<{
        category: EvalCategory;
        passed: number;
        failed: number;
        total: number;
        score_pct: number;
    }>;
    results: EvalCaseResult[];
}
