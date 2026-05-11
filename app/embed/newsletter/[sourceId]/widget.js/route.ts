// app/embed/newsletter/[sourceId]/widget.js/route.ts
//
// GET /embed/newsletter/[sourceId]/widget.js
//
// Returns a self-contained JavaScript bundle that, when included via
// <script src="..."></script> on any web page, renders a styled signup
// form next to the script tag and POSTs submissions to the public
// /api/embed/newsletter/[sourceId]/submit endpoint.
//
// The source config is fetched server-side at request time and inlined
// into the JS so the widget can render fields and theming without an
// extra round-trip. The response is cached for 5 minutes.
//
// Routed at /widget.js so it doesn't collide with the iframe page at
// /embed/newsletter/[sourceId].

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import {
  LEAD_CAPTURE_SOURCES,
  type CaptureSource,
} from '@/lib/lead-capture/types'

type Params = { params: Promise<{ sourceId: string }> }

function appUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL
  if (env) return env.replace(/\/$/, '')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host = req.headers.get('host') ?? 'partnersinbiz.online'
  return `${proto}://${host}`
}

function jsResponse(js: string, status: number = 200): NextResponse {
  return new NextResponse(js, {
    status,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

function escapeForJs(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/<\//g, "<\\/")
}

export async function GET(req: NextRequest, context: Params) {
  const { sourceId } = await context.params

  const snap = await adminDb.collection(LEAD_CAPTURE_SOURCES).doc(sourceId).get()
  if (!snap.exists || snap.data()?.deleted) {
    return jsResponse(
      `console.warn('[partnersinbiz] capture source ${escapeForJs(sourceId)} not found');`,
      404,
    )
  }
  const source = { id: snap.id, ...snap.data() } as CaptureSource
  if (!source.active) {
    return jsResponse(
      `console.warn('[partnersinbiz] capture source ${escapeForJs(sourceId)} is not active');`,
    )
  }

  const publicConfig = {
    id: source.id,
    name: source.name,
    fields: source.fields ?? [],
    successMessage: source.successMessage,
    successRedirectUrl: source.successRedirectUrl ?? '',
    doubleOptIn: source.doubleOptIn,
    widgetTheme: source.widgetTheme,
  }

  const submitUrl = `${appUrl(req)}/api/embed/newsletter/${encodeURIComponent(sourceId)}/submit`
  const configJson = JSON.stringify(publicConfig)
  const safeId = escapeForJs(sourceId)

  const js = `(function(){
  if (window['__pibLeadCaptureLoaded_' + '${safeId}']) return;
  window['__pibLeadCaptureLoaded_' + '${safeId}'] = true;
  var CONFIG = ${configJson};
  var SUBMIT_URL = '${escapeForJs(submitUrl)}';
  var theme = CONFIG.widgetTheme || {};
  var scripts = document.getElementsByTagName('script');
  var currentScript = document.currentScript || scripts[scripts.length - 1];

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function(k){
      if (k === 'style' && typeof attrs[k] === 'object') {
        Object.assign(node.style, attrs[k]);
      } else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      } else if (k === 'className') {
        node.className = attrs[k];
      } else if (attrs[k] != null) {
        node.setAttribute(k, attrs[k]);
      }
    });
    if (children) (Array.isArray(children) ? children : [children]).forEach(function(c){
      if (c == null) return;
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  function renderInto(host) {
    host.innerHTML = '';
    var container = el('div', { style: {
      background: theme.backgroundColor || '#ffffff',
      color: theme.textColor || '#111827',
      padding: '24px',
      borderRadius: (theme.borderRadius || 12) + 'px',
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif',
      fontSize: '15px',
      lineHeight: '1.5',
      maxWidth: '460px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
      boxSizing: 'border-box'
    }});

    var heading = el('h3', { style: {
      margin: '0 0 6px',
      fontSize: '20px',
      fontWeight: '600',
      color: theme.textColor || '#111827'
    }}, theme.headingText || 'Join our newsletter');
    container.appendChild(heading);

    if (theme.subheadingText) {
      container.appendChild(el('p', { style: {
        margin: '0 0 18px',
        color: theme.textColor || '#475569',
        opacity: '0.8',
        fontSize: '14px'
      }}, theme.subheadingText));
    }

    var form = el('form', { style: { display: 'flex', flexDirection: 'column', gap: '10px' }, novalidate: 'true' });
    var status = el('div', { style: { fontSize: '13px', minHeight: '18px' }}, '');

    function input(field) {
      var inputStyle = {
        width: '100%',
        padding: '10px 12px',
        border: '1px solid rgba(0,0,0,0.18)',
        borderRadius: '8px',
        fontSize: '14px',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
        background: '#fff',
        color: '#111'
      };
      var name = field.key;
      var placeholder = field.placeholder || field.label;
      if (field.type === 'textarea') {
        return el('textarea', {
          name: name, placeholder: placeholder, required: field.required ? 'required' : null,
          rows: '4', style: inputStyle
        });
      }
      if (field.type === 'select') {
        var sel = el('select', { name: name, required: field.required ? 'required' : null, style: inputStyle });
        sel.appendChild(el('option', { value: '' }, placeholder));
        (field.options || []).forEach(function(opt){
          sel.appendChild(el('option', { value: opt }, opt));
        });
        return sel;
      }
      return el('input', {
        type: field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text',
        name: name, placeholder: placeholder, required: field.required ? 'required' : null,
        style: inputStyle
      });
    }

    var emailLabel = el('label', { style: { fontSize: '13px', fontWeight: '500' }}, 'Email');
    var emailInput = el('input', {
      type: 'email', name: 'email', placeholder: 'you@example.com', required: 'required',
      style: {
        width: '100%', padding: '10px 12px',
        border: '1px solid rgba(0,0,0,0.18)', borderRadius: '8px',
        fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box',
        background: '#fff', color: '#111'
      }
    });
    var emailWrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' }}, [emailLabel, emailInput]);
    form.appendChild(emailWrap);

    (CONFIG.fields || []).forEach(function(field){
      if (!field || !field.key || field.key === 'email') return;
      var label = el('label', { style: { fontSize: '13px', fontWeight: '500' }}, field.label + (field.required ? ' *' : ''));
      var control = input(field);
      var wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' }}, [label, control]);
      form.appendChild(wrap);
    });

    var submitBtn = el('button', {
      type: 'submit',
      style: {
        marginTop: '6px',
        padding: '12px 16px',
        background: theme.primaryColor || '#0f766e',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        fontSize: '15px',
        fontWeight: '600',
        cursor: 'pointer',
        fontFamily: 'inherit'
      }
    }, theme.buttonText || 'Subscribe');
    form.appendChild(submitBtn);
    form.appendChild(status);

    form.addEventListener('submit', function(ev) {
      ev.preventDefault();
      status.textContent = '';
      status.style.color = '';
      var formData = new FormData(form);
      var email = (formData.get('email') || '').toString().trim();
      if (!email) { status.style.color = '#b91c1c'; status.textContent = 'Email is required.'; return; }
      var data = {};
      (CONFIG.fields || []).forEach(function(field){
        var v = formData.get(field.key);
        if (typeof v === 'string' && v.trim()) data[field.key] = v.trim();
      });
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.7';
      submitBtn.textContent = 'Submitting…';

      fetch(SUBMIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, data: data, referer: location.href })
      })
      .then(function(r){ return r.json().then(function(b){ return { ok: r.ok, body: b }; }); })
      .then(function(res){
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.textContent = theme.buttonText || 'Subscribe';
        if (!res.ok) {
          status.style.color = '#b91c1c';
          status.textContent = (res.body && res.body.error) || 'Submission failed. Please try again.';
          return;
        }
        container.innerHTML = '';
        var done = el('div', { style: { textAlign: 'center', padding: '20px 0' }}, [
          el('h3', { style: { margin: '0 0 8px', fontSize: '20px', color: theme.textColor || '#111827' }},
            res.body.requiresConfirmation ? 'Check your inbox' : 'Thanks!'),
          el('p', { style: { color: theme.textColor || '#475569', opacity: '0.8' }},
            res.body.message || CONFIG.successMessage || 'You are subscribed.')
        ]);
        container.appendChild(done);
        if (res.body.redirect) {
          setTimeout(function(){ window.location.href = res.body.redirect; }, 1200);
        }
      })
      .catch(function(err){
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.textContent = theme.buttonText || 'Subscribe';
        status.style.color = '#b91c1c';
        status.textContent = 'Network error — please try again.';
        try { console.error('[partnersinbiz] submit error', err); } catch(e){}
      });
    });

    container.appendChild(form);
    host.appendChild(container);
  }

  function mount() {
    var targetSel = currentScript && currentScript.getAttribute('data-target');
    if (targetSel) {
      var nodes = document.querySelectorAll(targetSel);
      if (nodes.length) {
        Array.prototype.forEach.call(nodes, function(n){ renderInto(n); });
        return;
      }
    }
    var host = document.createElement('div');
    host.setAttribute('data-pib-lead-capture', CONFIG.id);
    if (currentScript && currentScript.parentNode) {
      currentScript.parentNode.insertBefore(host, currentScript.nextSibling);
    } else {
      document.body.appendChild(host);
    }
    renderInto(host);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
`
  return jsResponse(js)
}
