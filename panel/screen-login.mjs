import { errorText } from './errors.mjs';
import { TOKEN_KEY, $, store, app, toast, resetSession, show, call } from './common.mjs';

$('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  app.token = $('token').value.trim();
  store.set(TOKEN_KEY, app.token);
  $('login-error').textContent = '';
  // A project that fails to open says so, as on page load (issue #591).
  call('start').catch((err) => toast(errorText(err)));
});
$('logout').addEventListener('click', () => {
  resetSession({ forget: true });
  show('login');
});
