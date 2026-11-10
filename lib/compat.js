/**
 * HTML compatibility shim injection (local fork addition).
 *
 * The stock client calls several platform APIs at module-init time
 * (`Promise.withResolvers` from Chromium 119, `AbortSignal.any` from 116, …).
 * Older Android System WebViews therefore die before first paint with
 * `TypeError: Promise.withResolvers is not a function`, which shows up as a
 * blank page and unhandled rejections — no layout of ours can help, because
 * our client bundle never runs.
 *
 * This module prepends one classic <script> to every HTML document the host
 * serves, before the first <script> tag, so every guarded API exists by the
 * time app code executes. Modern browsers hit the feature checks and no-op.
 *
 * Implementation notes:
 * - Wrapping happens at the route level (exact / prefix / fallback handlers),
 *   not on `ServerResponse.prototype`: HTML is served by exactly one route and
 *   buffering the whole response is only acceptable for a document.
 * - `@xgone/dsh-remote` may gzip/brotli-compress HTML for remote browsers, so
 *   the wrapper decodes, injects and re-encodes with the same codec.
 * - If anything fails, the original bytes are sent untouched: a broken shim
 *   must never take down a page that used to load.
 */
import { brotliCompressSync, brotliDecompressSync, deflateSync, gunzipSync, gzipSync, inflateSync } from 'node:zlib';
const MARKER = '__dshWebMobileHtmlCompat';
const INJECTED_ATTR = 'data-dsh-web-compat';
/** The shim itself. Classic script: no module syntax, no top-level await. */
export const COMPAT_SCRIPT = `(function(){'use strict';var g=typeof globalThis!=='undefined'?globalThis:window;var P=g.Promise;var define=function(o,k,v){try{Object.defineProperty(o,k,{value:v,configurable:true,writable:true,enumerable:false})}catch(e){try{o[k]=v}catch(e2){}}};
if(P&&typeof P.withResolvers!=='function'){define(P,'withResolvers',function(){var resolve,reject;var promise=new P(function(res,rej){resolve=res;reject=rej});return{promise:promise,resolve:resolve,reject:reject}})}
if(P&&typeof P.try!=='function'){define(P,'try',function(fn){var self=this;return new self(function(resolve){resolve(fn())})})}
if(P&&typeof P.allSettled!=='function'){define(P,'allSettled',function(iterable){var self=this;return new self(function(resolve){var items=Array.from(iterable);var out=new Array(items.length);var left=items.length;if(left===0)return resolve(out);items.forEach(function(item,i){self.resolve(item).then(function(value){out[i]={status:'fulfilled',value:value};if(--left===0)resolve(out)},function(reason){out[i]={status:'rejected',reason:reason};if(--left===0)resolve(out)})})})})}
if(P&&typeof P.any!=='function'){define(P,'any',function(iterable){var self=this;return new self(function(resolve,reject){var items=Array.from(iterable);var left=items.length;if(left===0)return reject(new Error('All promises were rejected'));items.forEach(function(item){self.resolve(item).then(resolve,function(){if(--left===0)reject(new Error('All promises were rejected'))})})})})}
var A=g.AbortSignal;
if(A){if(typeof A.timeout!=='function'){define(A,'timeout',function(ms){var ctrl=new g.AbortController();setTimeout(function(){ctrl.abort(new g.DOMException('The operation timed out.','TimeoutError'))},ms);return ctrl.signal})}
if(typeof A.any!=='function'){define(A,'any',function(signals){var ctrl=new g.AbortController();var list=Array.from(signals||[]);var abort=function(signal){if(ctrl.signal.aborted)return;var reason;try{reason=signal.reason}catch(e){reason=e}ctrl.abort(reason)};for(var i=0;i<list.length;i++){if(!list[i])continue;if(list[i].aborted){abort(list[i]);break}list[i].addEventListener('abort',(function(sig){return function(){abort(sig)}})(list[i]),{once:true})}return ctrl.signal})}
if(typeof A.prototype.throwIfAborted!=='function'){define(A.prototype,'throwIfAborted',function(){if(this.aborted){var reason;try{reason=this.reason}catch(e){reason=e}throw reason===undefined?new g.DOMException('This operation was aborted','AbortError'):reason}})}}
var AP=g.Array.prototype,SP=g.String.prototype;
if(typeof AP.at!=='function'){var at=function(n){var len=this.length>>>0;var k=Math.trunc(Number(n))||0;if(k<0)k+=len;return k<0||k>=len?undefined:this[k]};define(AP,'at',at);define(SP,'at',at)}
if(typeof AP.findLast!=='function'){define(AP,'findLast',function(fn,thisArg){for(var i=this.length-1;i>=0;i--)if(fn.call(thisArg,this[i],i,this))return this[i];return undefined})}
if(typeof AP.findLastIndex!=='function'){define(AP,'findLastIndex',function(fn,thisArg){for(var i=this.length-1;i>=0;i--)if(fn.call(thisArg,this[i],i,this))return i;return -1})}
if(typeof AP.flat!=='function'){define(AP,'flat',function(depth){var d=depth===undefined?1:Math.trunc(Number(depth))||0;var out=[];var walk=function(arr,level){for(var i=0;i<arr.length;i++){var v=arr[i];if(level>0&&Array.isArray(v))walk(v,level-1);else out.push(v)}};walk(this,Math.max(0,d));return out})}
if(typeof AP.flatMap!=='function'){define(AP,'flatMap',function(fn,thisArg){var out=[];for(var i=0;i<this.length;i++){var v=fn.call(thisArg,this[i],i,this);if(Array.isArray(v))out.push.apply(out,v);else out.push(v)}return out})}
if(typeof AP.toSorted!=='function'){define(AP,'toSorted',function(cmp){return this.slice().sort(cmp)});define(AP,'toReversed',function(){return this.slice().reverse()});define(AP,'toSpliced',function(){var copy=this.slice();copy.splice.apply(copy,arguments);return copy});define(AP,'with',function(index,value){var copy=this.slice();var k=Math.trunc(Number(index))||0;if(k<0)k+=copy.length;if(k<0||k>=copy.length)throw new RangeError('Invalid index');copy[k]=value;return copy})}
if(typeof Object.hasOwn!=='function'){define(Object,'hasOwn',function(obj,key){return Object.prototype.hasOwnProperty.call(obj,key)})}
if(typeof Object.groupBy!=='function'){define(Object,'groupBy',function(items,fn){var out=Object.create(null);var i=0;for(var item of items){var key=String(fn(item,i++));(out[key]||(out[key]=[])).push(item)}return out})}
if(typeof g.Map.groupBy!=='function'){define(g.Map,'groupBy',function(items,fn){var out=new Map();var i=0;for(var item of items){var key=fn(item,i++);if(!out.has(key))out.set(key,[]);out.get(key).push(item)}return out})}
if(typeof g.structuredClone!=='function'){define(g,'structuredClone',function(value){if(value===undefined||value===null||typeof value!=='object')return value;if(g.MessageChannel){var result;var channel=new g.MessageChannel();channel.port1.onmessage=function(event){result=event.data};channel.port2.postMessage(value);if(result!==undefined)return result}return JSON.parse(JSON.stringify(value))})}
if(!g.crypto||typeof g.crypto.randomUUID!=='function'){var cryptoObj=g.crypto||(g.crypto={});var randomUUID=function(){var bytes=new Uint8Array(16);if(typeof g.crypto.getRandomValues==='function')g.crypto.getRandomValues(bytes);else for(var i=0;i<16;i++)bytes[i]=Math.floor(Math.random()*256);bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;var hex=[];for(var j=0;j<16;j++)hex.push((bytes[j]+0x100).toString(16).slice(1));return hex.slice(0,4).join('')+'-'+hex.slice(4,6).join('')+'-'+hex.slice(6,8).join('')+'-'+hex.slice(8,10).join('')+'-'+hex.slice(10,16).join('')};try{define(cryptoObj,'randomUUID',randomUUID)}catch(e){}}
if(typeof g.queueMicrotask!=='function'){define(g,'queueMicrotask',function(fn){P.resolve().then(fn)})}
var D=g.HTMLDialogElement;
if(D&&typeof D.prototype.showModal!=='function'){define(D.prototype,'showModal',function(){this.setAttribute('open','');this.style.display='block'});define(D.prototype,'close',function(value){this.removeAttribute('open');this.style.display='none';if(value!==undefined)this.returnValue=value})}
try{g.__DSH_WEB_COMPAT__=true}catch(e){}
})();`;
/** `<script>` tag carrying the shim, placed before the first app script. */
export const COMPAT_SNIPPET = `<script ${INJECTED_ATTR}>${COMPAT_SCRIPT}</script>`;
/** Insert the shim into one HTML document (idempotent). */
export function injectCompatIntoHtml(html) {
    if (html.includes(INJECTED_ATTR))
        return html;
    const firstScript = /<script\b/i.exec(html);
    if (firstScript?.index !== undefined) {
        return `${html.slice(0, firstScript.index)}${COMPAT_SNIPPET}${html.slice(firstScript.index)}`;
    }
    const head = /<head\b[^>]*>/i.exec(html);
    if (head?.index !== undefined) {
        const at = head.index + head[0].length;
        return `${html.slice(0, at)}${COMPAT_SNIPPET}${html.slice(at)}`;
    }
    return `${COMPAT_SNIPPET}${html}`;
}
/** Bypass for planes whose bodies are never documents. */
function isDocumentRequest(req) {
    const method = String(req.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD')
        return false;
    const path = String(req.url ?? '/').split('?')[0];
    return !(path.startsWith('/api/') ||
        path.startsWith('/sidebar/') ||
        path.startsWith('/plugins/') ||
        path.startsWith('/assets/') ||
        path.startsWith('/auth/'));
}
function decodeBody(buffer, encoding) {
    const value = encoding.toLowerCase().trim();
    if (value === 'gzip' || value === 'x-gzip')
        return { body: gunzipSync(buffer), codec: 'gzip' };
    if (value === 'br')
        return { body: brotliDecompressSync(buffer), codec: 'br' };
    if (value === 'deflate')
        return { body: inflateSync(buffer), codec: 'deflate' };
    return { body: buffer, codec: '' };
}
function encodeBody(buffer, codec) {
    if (codec === 'gzip')
        return gzipSync(buffer);
    if (codec === 'br')
        return brotliCompressSync(buffer);
    if (codec === 'deflate')
        return deflateSync(buffer);
    return buffer;
}
/** Wrap one request handler so HTML bodies gain the shim. */
function wrapHandler(handler) {
    const existing = handler[MARKER];
    if (existing === true)
        return handler;
    const wrapped = function (req, res) {
        if (!isDocumentRequest(req) || res.headersSent)
            return handler(req, res);
        const chunks = [];
        // undefined = not decided yet, true = buffering, false = passthrough.
        let buffering;
        const originalWrite = res.write.bind(res);
        const originalEnd = res.end.bind(res);
        const decide = () => String(res.getHeader('content-type') ?? '').includes('text/html');
        const collect = (chunk, encoding) => {
            if (chunk === undefined || chunk === null)
                return;
            if (Buffer.isBuffer(chunk))
                chunks.push(chunk);
            else if (typeof chunk === 'string')
                chunks.push(Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8'));
            else
                chunks.push(Buffer.from(chunk));
        };
        res.write = function (chunk, encoding, callback) {
            if (buffering === undefined)
                buffering = decide();
            if (buffering === false)
                return originalWrite(chunk, encoding, callback);
            collect(chunk, encoding);
            if (typeof encoding === 'function')
                encoding();
            else if (typeof callback === 'function')
                callback();
            return true;
        };
        res.end = function (chunk, encoding, callback) {
            if (buffering === undefined)
                buffering = decide();
            if (buffering === false)
                return originalEnd(chunk, encoding, callback);
            const done = typeof encoding === 'function' ? encoding : typeof callback === 'function' ? callback : undefined;
            collect(chunk, encoding);
            let payload = Buffer.concat(chunks);
            const status = res.statusCode ?? 200;
            try {
                if (payload.byteLength > 0 && status < 300) {
                    const codec = String(res.getHeader('content-encoding') ?? '');
                    const decoded = decodeBody(payload, codec);
                    const injected = Buffer.from(injectCompatIntoHtml(decoded.body.toString('utf8')), 'utf8');
                    if (injected.byteLength !== decoded.body.byteLength) {
                        payload = encodeBody(injected, decoded.codec);
                        res.setHeader('content-length', String(payload.byteLength));
                        // The body no longer matches the strong validator.
                        res.removeHeader('etag');
                    }
                }
            }
            catch {
                // Never break a document because the shim failed.
                payload = Buffer.concat(chunks);
            }
            return originalEnd(payload, done);
        };
        return handler(req, res);
    };
    wrapped[MARKER] = true;
    return wrapped;
}
function wrapRoute(route) {
    if (route === null || typeof route !== 'object')
        return;
    const candidate = route;
    if (typeof candidate.resource === 'function')
        candidate.resource = wrapResource(candidate.resource);
    if (typeof candidate.handler === 'function')
        candidate.handler = wrapHandler(candidate.handler);
}
/**
 * Wrap a Fetch-style resource (the SPA fallback and dsh ≥ 0.2.2 routes are
 * `{ resource(request) => Response }`). The document is read out of the
 * Response, the shim prepended, and a fresh Response returned.
 */
function wrapResource(resource) {
    const existing = resource[MARKER];
    if (existing === true)
        return resource;
    const wrapped = async (request, peer) => {
        const response = await resource(request, peer);
        if (!(response instanceof Response))
            return response;
        const type = response.headers.get('content-type') ?? '';
        if (!type.includes('text/html'))
            return response;
        const status = response.status;
        if (status >= 300)
            return response;
        try {
            const html = await response.text();
            const injected = injectCompatIntoHtml(html);
            const headers = new Headers(response.headers);
            if (injected === html)
                return new Response(html, { status, statusText: response.statusText, headers });
            // Length and validator no longer describe the body.
            headers.delete('content-length');
            headers.delete('content-encoding');
            headers.delete('etag');
            return new Response(injected, { status, statusText: response.statusText, headers });
        }
        catch {
            return response;
        }
    };
    wrapped[MARKER] = true;
    return wrapped;
}
/**
 * Install the shim.
 *
 * Preferred path: the host's `tapIndex` hook, which every index.html render
 * already flows through (`renderIndex` → taps → response). That runs before
 * any compression, so no codec handling is needed.
 *
 * Fallback path (older hosts without `tapIndex`): wrap the document routes
 * directly and see through gzip/brotli.
 */
export function installHtmlCompat(server) {
    if (typeof server.tapIndex === 'function') {
        return server.tapIndex((html) => injectCompatIntoHtml(html));
    }
    const wrapExisting = () => {
        for (const route of server.exact?.values() ?? [])
            wrapRoute(route);
        for (const route of server.prefixes?.values() ?? [])
            wrapRoute(route);
        if (typeof server.fallback === 'function') {
            server.fallback = wrapHandler(server.fallback);
        }
        else {
            wrapRoute(server.fallback);
        }
    };
    wrapExisting();
    const originalRegister = server.register?.bind(server);
    const originalRegisterFallback = server.registerFallback?.bind(server);
    if (typeof originalRegister === 'function') {
        server.register = (route) => {
            const copy = { ...route };
            wrapRoute(copy);
            return originalRegister(copy);
        };
    }
    if (typeof originalRegisterFallback === 'function') {
        server.registerFallback = (fallback) => {
            if (typeof fallback === 'function')
                return originalRegisterFallback(wrapHandler(fallback));
            const copy = fallback !== null && typeof fallback === 'object' ? { ...fallback } : fallback;
            wrapRoute(copy);
            return originalRegisterFallback(copy);
        };
    }
    return () => {
        if (typeof originalRegister === 'function')
            server.register = originalRegister;
        if (typeof originalRegisterFallback === 'function')
            server.registerFallback = originalRegisterFallback;
    };
}
//# sourceMappingURL=compat.js.map