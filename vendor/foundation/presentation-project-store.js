import { validatePresentationProject, validProjectId } from './presentation-document.js';
/** Store is injected so hosts can replace IndexedDB with their own repository. */
export async function openPresentationProjectStore(name = 'presentation-projects-v1', transport) {
    const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'document.id' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(Error('프로젝트 저장소를 열지 못했습니다. 브라우저 저장 권한을 확인해 주세요.'));
        request.onblocked = () => reject(Error('이전 프로젝트 탭을 닫고 다시 시도해 주세요.'));
    });
    return {
        async save(input) {
            const project = validatePresentationProject(input);
            await transport?.publish(project);
            await new Promise((resolve, reject) => {
                const tx = db.transaction('projects', 'readwrite');
                tx.objectStore('projects').put(project);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(Error('프로젝트를 저장하지 못했습니다. 브라우저 저장 공간을 확인하고 JSON으로 저장해 주세요.'));
                tx.onabort = tx.onerror;
            });
        },
        async load(id) {
            if (!validProjectId(id))
                throw Error('프로젝트 ID를 확인해 주세요.');
            const remote = await transport?.retrieve(id);
            if (remote)
                return validatePresentationProject(remote);
            const value = await new Promise((resolve, reject) => {
                const request = db.transaction('projects', 'readonly').objectStore('projects').get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(Error('프로젝트를 불러오지 못했습니다.'));
            });
            if (!value)
                return undefined;
            const project = validatePresentationProject(value);
            await transport?.publish(project);
            return project;
        },
        close: () => db.close(),
    };
}
