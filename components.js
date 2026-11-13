import { createUiButton, createUiCard } from './vendor/foundation/ui-components.js';

const panels = [...document.querySelectorAll('[data-panel]')];
const select = document.querySelector('#component-category');
function show(value) {
  panels.forEach(panel => { panel.hidden = panel.dataset.panel !== value; });
}
select.addEventListener('change', () => show(select.value));
document.querySelectorAll('[data-example]').forEach(example => {
  const details = document.createElement('details'); details.className = 'rf-details';
  const summary = document.createElement('summary'); summary.textContent = 'HTML 예제';
  const pre = document.createElement('pre'); const code = document.createElement('code');
  code.textContent = example.innerHTML.trim().replace(/></g, '>\n<');
  pre.append(code); details.append(summary, pre); example.after(details);
});
document.querySelector('[data-toggle]').addEventListener('click', event => {
  const button = event.currentTarget; const pressed = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(pressed)); button.textContent = pressed ? '선택됨' : '선택 안 됨';
});
document.querySelector('#sample-form').addEventListener('submit', event => {
  event.preventDefault();
  document.querySelector('#form-result').textContent = '입력을 확인했습니다. 서버에는 전송하지 않았습니다.';
});
const content = document.createElement('p'); content.textContent = '같은 카드를 공통 JavaScript 함수로도 생성할 수 있습니다.';
const button = createUiButton(document, { label: '공통 버튼', variant: 'primary' });
const card = createUiCard(document, { title: '공통 함수로 생성', content, actions: [button] });
document.querySelector('#factory-example').append(card);
