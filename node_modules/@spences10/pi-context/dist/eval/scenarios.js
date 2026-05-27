export const search_scenarios = [
    {
        name: 'exact-token-baseline',
        source: 'needle-log',
        query: 'TARGET_VALUE',
        expect: 'TARGET_VALUE appears on line 855',
        limit: 5,
        description: 'Basic exact-token lookup should work before and after.',
    },
    {
        name: 'over-specific-human-query',
        source: 'staging-help',
        query: 'stage specific chunk line commit checks amend author sign-off',
        expect: 'Press space to stage this hunk',
        limit: 5,
        description: 'Human/agent query contains useful words plus absent words; strict AND search used to miss.',
    },
    {
        name: 'literal-or-query',
        source: 'skill-script',
        query: 'run_gh_skill_update OR run_gh_skill_install OR case update',
        expect: 'run_gh_skill_update',
        limit: 5,
        description: 'Queries copied from agent reasoning often include OR; search should treat this as alternatives.',
    },
    {
        name: 'punctuation-symbol-query',
        source: 'code-symbols',
        query: 'registerCommand context-stats',
        expect: "registerCommand('context-stats'",
        limit: 5,
        description: 'Code and command names include punctuation that should not make retrieval brittle.',
    },
    {
        name: 'chunk-boundary-query',
        source: 'chunk-boundary',
        query: 'alpha-token omega-token',
        expect: 'alpha-token',
        limit: 5,
        description: 'Useful terms may be split across chunks; relaxed fallback should still recover likely chunks.',
    },
];
export const get_scenarios = [
    {
        name: 'get-first-ordinal-alias',
        source: 'needle-log',
        chunk_id: '1',
        expect: 'before noise line 0',
        description: 'Receipt-led chunk retrieval via ordinal alias should stay reliable.',
    },
];
//# sourceMappingURL=scenarios.js.map