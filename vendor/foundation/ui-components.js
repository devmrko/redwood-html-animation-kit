export function createUiButton(doc, options) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'rf-button';
    button.textContent = options.label;
    if (options.variant && options.variant !== 'default') {
        if (!['primary', 'quiet'].includes(options.variant))
            throw new TypeError('Invalid button variant');
        button.classList.add(`rf-button--${options.variant}`);
    }
    button.disabled = options.disabled ?? false;
    return button;
}
export function createUiBadge(doc, options) {
    const badge = doc.createElement('span');
    badge.className = 'rf-badge';
    badge.textContent = options.label;
    const tone = options.tone ?? 'neutral';
    if (!['neutral', 'info', 'success', 'warning', 'danger'].includes(tone))
        throw new TypeError('Invalid badge tone');
    if (tone !== 'neutral')
        badge.classList.add(`rf-badge--${tone}`);
    return badge;
}
export function createUiCard(doc, options) {
    const card = doc.createElement('article');
    card.className = 'rf-card';
    const header = doc.createElement('header');
    header.className = 'rf-card__header';
    const heading = doc.createElement('h2');
    heading.className = 'rf-card__title';
    heading.textContent = options.title;
    header.append(heading);
    const body = doc.createElement('div');
    body.className = 'rf-card__body';
    body.append(options.content);
    card.append(header, body);
    if (options.actions?.length) {
        const footer = doc.createElement('footer');
        footer.className = 'rf-card__footer';
        footer.append(...options.actions);
        card.append(footer);
    }
    return card;
}
export function createUiField(doc, options) {
    if (!options.id || /\s/.test(options.id))
        throw new TypeError('Provide a nonempty input id without whitespace');
    const element = doc.createElement('div');
    element.className = 'rf-field';
    const label = doc.createElement('label');
    label.className = 'rf-field__label';
    label.htmlFor = options.id;
    label.textContent = options.label;
    const input = doc.createElement('input');
    input.className = 'rf-input';
    input.id = options.id;
    input.name = options.id;
    input.value = options.value ?? '';
    input.required = options.required ?? false;
    element.append(label, input);
    if (options.hint) {
        const hint = doc.createElement('small');
        hint.className = 'rf-field__hint';
        hint.id = `${options.id}-hint`;
        hint.textContent = options.hint;
        input.setAttribute('aria-describedby', hint.id);
        element.append(hint);
    }
    return { element, input };
}
