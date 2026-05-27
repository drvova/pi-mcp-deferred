export function build_sections(results) {
    const categories = [
        'search',
        'retrieval',
        'lifecycle',
        'capture',
        'retention',
        'cost',
        'dedupe',
    ];
    return categories
        .map((category) => {
        const section = results.filter((result) => result.category === category);
        const passed = section.filter((result) => result.passed).length;
        const total = section.length;
        return {
            category,
            passed,
            failed: total - passed,
            total,
            score_pct: total === 0 ? 0 : Math.round((passed / total) * 1000) / 10,
        };
    })
        .filter((section) => section.total > 0);
}
export function format_report(report) {
    return [
        '# pi-context eval',
        '',
        `Score: ${report.summary.passed}/${report.summary.total} (${report.summary.score_pct}%)`,
        `Returned bytes: ${report.summary.returned_bytes}`,
        '',
        'Sections:',
        ...report.sections.map((section) => `- ${section.category}: ${section.passed}/${section.total} (${section.score_pct}%)`),
        '',
        ...report.results.map((result) => [
            `${result.passed ? '✅' : '❌'} ${result.name} (${result.category})`,
            `   ${result.description}`,
            `   ${result.detail}; results=${result.result_count}; bytes=${result.returned_bytes}`,
        ].join('\n')),
    ].join('\n');
}
//# sourceMappingURL=report.js.map