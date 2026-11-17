// Only trusted, locally authored modules belong here. JSON never imports code.
// An exported authoring project replaces this registry with its own page imports.
export function getAuthoredPages(_projectId){return new Map();}
