import { TOKEN_KEY, $, store, app, resetSession, show, call } from './common.mjs?v=1';

$('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  app.token = $('token').value.trim();
  store.set(TOKEN_KEY, app.token);
  $('login-error').textContent = '';
  call('start');
});
$('logout').addEventListener('click', () => {
  resetSession({ forget: true });
  show('login');
});
