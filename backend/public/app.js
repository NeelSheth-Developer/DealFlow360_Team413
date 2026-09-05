/* DealFlow360 auth tester — dev only, served from the API's own origin so there is
   no CORS in the way. Kept dependency-free on purpose. */

const $ = (id) => document.getElementById(id);
const base = () => $('base').value.replace(/\/$/, '');

/** Session is held in sessionStorage so a reload keeps it, but a closed tab does not. */
const S = {
  get: (k) => sessionStorage.getItem('dft_' + k) || '',
  set: (k, v) => (v ? sessionStorage.setItem('dft_' + k, v) : sessionStorage.removeItem('dft_' + k)),
};

function paintSession() {
  const access = S.get('access');
  const refresh = S.get('refresh');
  const kind = S.get('kind');
  const set = (el, on, text) => {
    el.className = 'pill ' + (on ? 'on' : 'off');
    el.textContent = text;
  };
  set($('pKind'), !!kind, kind ? `${kind}${S.get('role') ? ' · ' + S.get('role') : ''}` : 'no session');
  set($('pAccess'), !!access, access ? 'access ' + access.slice(-8) : 'no access token');
  set($('pRefresh'), !!refresh, refresh ? 'refresh ' + refresh.slice(-8) : 'no refresh token');
}

function log(method, path, status, body) {
  const wrap = document.createElement('div');
  wrap.className = 'entry ' + (status >= 200 && status < 300 ? 'ok' : 'bad');
  const cls = status >= 500 ? 's5' : status >= 400 ? 's4' : 's2';
  wrap.innerHTML =
    `<div class="head"><span class="status ${cls}">${status}</span>` +
    `<b>${method}</b> ${path}<span class="t">${new Date().toLocaleTimeString()}</span></div>`;
  const pre = document.createElement('pre');
  pre.className = 'out';
  pre.style.maxHeight = '150px';
  pre.style.marginTop = '6px';
  pre.textContent = JSON.stringify(body, null, 2);
  wrap.appendChild(pre);
  $('log').prepend(wrap);
}

function show(outId, status, body) {
  const el = $(outId);
  const cls = status >= 500 ? 's5' : status >= 400 ? 's4' : 's2';
  el.innerHTML = `<span class="status ${cls}">${status}</span>\n` + escapeHtml(JSON.stringify(body, null, 2));
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

/** One call path for everything, so auth and logging cannot drift between handlers. */
async function call(method, path, { body, token, outId } = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = 'Bearer ' + token;

  let status = 0;
  let data = null;
  try {
    const res = await fetch(base() + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    const text = await res.text();
    data = text ? JSON.parse(text) : { note: 'empty body (204)' };
  } catch (err) {
    data = { error: String(err), hint: 'Is the server running on this origin?' };
  }

  if (outId) show(outId, status, data);
  log(method, path, status, data);
  return { status, data };
}

/** Pull tokens out of any response that carries them. */
function capture(data) {
  const d = data && data.data;
  if (!d) return;
  if (d.accessToken) S.set('access', d.accessToken);
  if (d.refreshToken) {
    S.set('prevRefresh', S.get('refresh'));
    S.set('refresh', d.refreshToken);
  }
  if (d.user) {
    S.set('kind', 'staff');
    S.set('role', d.user.role || '');
    S.set('email', d.user.email || '');
    if (d.user.id) $('pu_id').value = d.user.id;
  }
  if (d.customer) {
    S.set('kind', 'customer');
    S.set('role', '');
    S.set('email', d.customer.email || '');
  }
  paintSession();
}

/** The dev OTP, wherever the endpoint puts it. */
const otpOf = (data) => (data && (data.devOtp || (data.data && data.data.devOtp))) || '';

function spreadEmail(email) {
  ['vo_email', 'li_email', 'ro_email', 'fp_email', 'rp_email'].forEach((id) => ($(id).value = email));
}

const randomEmail = () => `test${Date.now()}@teamvector.space`;

const runners = {
  async signup() {
    const type = $('su_type').value;
    const email = $('su_email').value.trim();
    const { data } = await call('POST', '/auth/signup', {
      outId: 'out_signup',
      body: { name: $('su_name').value, email, password: $('su_password').value, type },
    });
    capture(data);
    spreadEmail(email);
    $('vo_type').value = type;
    $('li_type').value = type;
    const otp = otpOf(data);
    if (otp) {
      $('vo_otp').value = otp;
      $('rp_otp').value = otp;
    }
  },

  async verify() {
    const { data } = await call('POST', '/auth/verify-otp', {
      outId: 'out_verify',
      body: { email: $('vo_email').value.trim(), otp: $('vo_otp').value.trim(), type: $('vo_type').value },
    });
    capture(data);
  },

  async resend() {
    const { data } = await call('POST', '/auth/resend-otp', {
      outId: 'out_resend',
      body: { email: $('ro_email').value.trim(), type: $('ro_type').value, purpose: $('ro_purpose').value },
    });
    const otp = otpOf(data);
    if (otp) {
      $('vo_otp').value = otp;
      $('rp_otp').value = otp;
    }
  },

  async login() {
    const { data } = await call('POST', '/auth/login', {
      outId: 'out_login',
      body: { email: $('li_email').value.trim(), password: $('li_password').value, type: $('li_type').value },
    });
    capture(data);
  },

  async forgot() {
    const { data } = await call('POST', '/auth/forgot-password', {
      outId: 'out_forgot',
      body: { email: $('fp_email').value.trim(), type: $('fp_type').value },
    });
    const otp = otpOf(data);
    if (otp) $('rp_otp').value = otp;
  },

  async reset() {
    await call('POST', '/auth/reset-password', {
      outId: 'out_reset',
      body: {
        email: $('rp_email').value.trim(),
        otp: $('rp_otp').value.trim(),
        newPassword: $('rp_new').value,
        type: $('rp_type').value,
      },
    });
  },

  async change() {
    const body = { currentPassword: $('cp_cur').value, newPassword: $('cp_new').value };
    if ($('cp_keep').checked && S.get('refresh')) body.refreshToken = S.get('refresh');
    await call('POST', '/auth/change-password', {
      outId: 'out_change',
      token: S.get('access'),
      body,
    });
  },

  async refresh() {
    const { data } = await call('POST', '/auth/refresh', {
      outId: 'out_refresh',
      body: { refreshToken: S.get('refresh') },
    });
    capture(data);
  },

  async replay() {
    const old = S.get('prevRefresh');
    if (!old) {
      show('out_refresh', 400, { note: 'Refresh once first, then replay the token it rotated away.' });
      return;
    }
    await call('POST', '/auth/refresh', { outId: 'out_refresh', body: { refreshToken: old } });
  },

  me: () => call('GET', '/auth/me', { outId: 'out_me', token: S.get('access') }),
  me_bad: () => call('GET', '/auth/me', { outId: 'out_me', token: 'garbage.token.here' }),
  me_none: () => call('GET', '/auth/me', { outId: 'out_me' }),

  async logout() {
    await call('POST', '/auth/logout', {
      outId: 'out_logout',
      body: { refreshToken: S.get('refresh') },
    });
    S.set('refresh', '');
    paintSession();
  },

  roles: () => call('GET', '/roles', { outId: 'out_admin', token: S.get('access') }),
  users: () => call('GET', '/users?limit=10', { outId: 'out_admin', token: S.get('access') }),

  patchUser: () => {
    const id = $('pu_id').value.trim();
    if (!id) return show('out_admin', 400, { note: 'Enter a user id first.' });
    return call('PATCH', '/users/' + encodeURIComponent(id), {
      outId: 'out_admin',
      token: S.get('access'),
      body: { role: $('pu_role').value },
    });
  },
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-run]');
  if (!btn) return;
  const fn = runners[btn.dataset.run];
  if (!fn) return;
  btn.disabled = true;
  Promise.resolve(fn()).finally(() => (btn.disabled = false));
});

$('btnFresh').addEventListener('click', () => {
  const email = randomEmail();
  $('su_email').value = email;
  spreadEmail(email);
});

$('btnClear').addEventListener('click', () => {
  ['access', 'refresh', 'prevRefresh', 'kind', 'role', 'email'].forEach((k) => S.set(k, ''));
  paintSession();
});

$('btnClearLog').addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  $('log').innerHTML = '';
});

// Boot: a fresh email ready to go, and any session from a previous reload restored.
$('su_email').value = randomEmail();
spreadEmail($('su_email').value);
if (S.get('email')) spreadEmail(S.get('email'));
paintSession();
