export function defaultPresentationAiProvider(caps) {
    if (caps.cli.available && caps.cli.tools.includes('codex'))
        return 'cli';
    if (caps.openai.available)
        return 'openai';
    if (caps.oci.available && caps.oci.model && caps.oci.compartment && (caps.oci.region || caps.oci.regions[caps.oci.profile]))
        return 'oci';
    if (caps.cli.available)
        return 'cli';
    return caps.oci.available ? 'oci' : 'openai';
}
export function createPresentationAiConnection(doc, options) {
    const root = doc.createElement('details');
    root.className = 'rf-ai-connection';
    const summary = doc.createElement('summary');
    summary.textContent = 'AI 연결';
    root.append(summary);
    const makeInput = (label, entries) => { const field = doc.createElement('label'); field.append(label); const input = entries ? doc.createElement('select') : doc.createElement('input'); for (const [value, text] of entries ?? []) {
        const option = doc.createElement('option');
        option.value = value;
        option.textContent = text;
        input.append(option);
    } field.append(input); return { field, input }; };
    const provider = makeInput('연결 방식', [['openai', 'OpenAI 호환 API'], ['oci', 'OCI CLI'], ['cli', '설치된 Codex·Claude']]), model = makeInput('모델 (비우면 기본값)'), tool = makeInput('프로그램', []), profile = makeInput('OCI 프로파일', []), region = makeInput('OCI 리전'), compartment = makeInput('컴파트먼트 이름 또는 OCID'), format = makeInput('OCI 모델 API', [['GENERIC', 'Generic'], ['COHERE', 'Cohere']]);
    const oci = doc.createElement('div');
    oci.className = 'rf-ai-oci';
    oci.append(profile.field, region.field, compartment.field, format.field);
    root.append(provider.field, tool.field, oci, model.field);
    const reset = doc.createElement('button');
    reset.type = 'button';
    reset.className = 'rf-button';
    reset.textContent = '기본 연결로 변경';
    reset.disabled = true;
    root.append(reset);
    const status = doc.createElement('p');
    status.className = 'rf-ai-connection-status';
    root.append(status);
    status.textContent = 'AI 연결 확인 중…';
    const controls = [provider, model, tool, profile, region, compartment, format];
    let capabilities, busy = false;
    const key = 'presentation-ai-connection-v1';
    function value() { return { provider: provider.input.value, model: model.input.value, tool: tool.input.value, profile: profile.input.value, region: region.input.value, compartment: compartment.input.value, apiFormat: format.input.value }; }
    function description() { const choice = value(); return choice.provider === 'openai' ? choice.model || capabilities?.openai.model || 'OpenAI 호환 API' : choice.provider === 'cli' ? `${choice.tool || 'CLI'} · ${choice.model || '기본 모델'}` : `OCI · ${choice.region || '리전 미설정'} · ${choice.model || '모델 미설정'}`; }
    function changed() { try {
        options.storage?.setItem(key, JSON.stringify(value()));
    }
    catch { } options.onChange?.(value()); }
    function appearance(reset = false) { const which = provider.input.value; oci.hidden = which !== 'oci'; tool.field.hidden = which !== 'cli'; if (reset)
        model.input.value = which === 'openai' ? capabilities?.openai.model ?? '' : which === 'oci' ? capabilities?.oci.model ?? '' : ''; status.textContent = capabilities?.[which]?.available ? which === 'openai' ? '서버의 .env 설정 사용' : which === 'oci' ? '프로파일 감지됨 · 리전·모델·컴파트먼트 확인' : '설치 감지됨 · 기존 CLI 로그인 사용' : '설정이 없습니다. .env 또는 CLI 설치·로그인을 확인하세요.'; }
    function setValue(choice) { const switched = choice.provider && choice.provider !== provider.input.value; if (choice.provider && ['openai', 'oci', 'cli'].includes(choice.provider))
        provider.input.value = choice.provider; appearance(Boolean(switched && !Object.hasOwn(choice, 'model'))); for (const [key, field] of Object.entries({ model, tool, profile, region, compartment, apiFormat: format }))
        if (typeof choice[key] === 'string')
            field.input.value = choice[key]; changed(); }
    function setDisabled(disabled) { busy = disabled; reset.disabled = disabled || !capabilities; controls.forEach(c => c.input.disabled = disabled || !capabilities); }
    reset.onclick = () => { if (!capabilities || busy)
        return; const selected = defaultPresentationAiProvider(capabilities); setValue({ provider: selected, tool: capabilities.cli.tools.includes('codex') ? 'codex' : capabilities.cli.tools[0] ?? '', model: selected === 'openai' ? capabilities.openai.model : selected === 'oci' ? capabilities.oci.model : '' }); };
    provider.input.addEventListener('change', () => { appearance(true); changed(); });
    profile.input.addEventListener('change', () => { region.input.value = capabilities?.oci.regions[profile.input.value] || capabilities?.oci.region || ''; changed(); });
    controls.filter(c => c !== provider && c !== profile).forEach(c => c.input.addEventListener('change', changed));
    setDisabled(false);
    appearance();
    const ready = options.loadCapabilities().then(caps => {
        capabilities = caps;
        for (const [control, entries] of [[tool, caps.cli.tools], [profile, caps.oci.profiles]]) {
            for (const name of entries) {
                const option = doc.createElement('option');
                option.value = option.textContent = name;
                control.input.append(option);
            }
        }
        provider.input.value = defaultPresentationAiProvider(caps);
        if (caps.cli.tools.includes('codex'))
            tool.input.value = 'codex';
        profile.input.value = caps.oci.profile;
        region.input.value = caps.oci.region || caps.oci.regions[profile.input.value] || '';
        compartment.input.value = caps.oci.compartment;
        format.input.value = caps.oci.apiFormat || 'GENERIC';
        appearance(true);
        let stored = {};
        try {
            stored = JSON.parse(options.storage?.getItem(key) || '{}');
        }
        catch { }
        const initial = { ...stored, ...options.initial };
        if (options.initial?.provider && options.initial.provider !== stored.provider && !options.initial.model)
            initial.model = options.initial.provider === 'openai' ? caps.openai.model : options.initial.provider === 'oci' ? caps.oci.model : '';
        if (options.initial?.tool && options.initial.tool !== stored.tool && !options.initial.model)
            initial.model = '';
        setValue(initial);
        setDisabled(busy);
        return caps;
    }).catch(error => { status.textContent = String(error?.message || error); throw error; });
    return { root, ready, value, description, setValue, setDisabled };
}
