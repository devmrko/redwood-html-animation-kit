/** Optional data helpers. Authored pages may render any HTML/SVG instead. */
export function createComparisonTable(doc, data) {
    if (data.columns.length < 1 || data.columns.length > 8 || data.rows.some(row => row.cells.length !== data.columns.length))
        throw Error('비교 열과 각 행의 값 개수를 맞춰 주세요.');
    if (data.density !== undefined && !['comfortable', 'compact'].includes(data.density))
        throw Error('표 여백은 comfortable 또는 compact를 사용해 주세요.');
    const table = doc.createElement('table');
    table.className = 'rf-comparison-table';
    if (data.density)
        table.dataset.density = data.density;
    if (data.density === 'compact')
        table.className += ' rf-comparison-table--compact';
    const head = doc.createElement('thead'), tr = doc.createElement('tr');
    for (const title of ['항목', ...data.columns]) {
        const th = doc.createElement('th');
        th.scope = 'col';
        th.textContent = title;
        tr.append(th);
    }
    head.append(tr);
    table.append(head);
    const body = doc.createElement('tbody'), symbols = { success: '✓', limited: '△', error: '×', unsupported: '—', untested: '?' };
    for (const row of data.rows) {
        const line = doc.createElement('tr'), label = doc.createElement('th');
        label.scope = 'row';
        label.textContent = row.label;
        line.append(label);
        for (const cell of row.cells) {
            const td = doc.createElement('td');
            if (cell.status)
                td.dataset.status = cell.status;
            td.textContent = (cell.status ? `${symbols[cell.status]} ` : '') + cell.text;
            if (cell.condition) {
                const condition = doc.createElement('small');
                condition.textContent = cell.condition;
                td.append(condition);
            }
            line.append(td);
        }
        body.append(line);
    }
    table.append(body);
    return table;
}
export function createCostTable(doc, items) {
    const rows = items.map(v => { if (v.amount !== undefined && (!Number.isFinite(v.amount) || v.amount < 0))
        throw Error('비용은 0 이상의 유한한 값이어야 합니다.'); return { label: v.item, cells: [{ text: v.amount === undefined ? '미확인' : `${v.amount} ${v.currency}` }, { text: v.unit }, { text: v.period }, { text: ({ fixed: '유지·고정', usage: '사용량', initial: '초기' })[v.kind] }, { text: v.included, condition: v.condition }] }; });
    return createComparisonTable(doc, { columns: ['금액·통화', '과금 단위', '기간', '비용 성격', '포함 항목·조건'], rows });
}
