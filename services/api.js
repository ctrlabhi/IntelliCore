/**
 * IntelliCore Universal Frontend API Client
 * Version: 2.0.0
 * Architecture: Modular Monolith
 * 
 * Provides unified, same-origin HTTP communication with /api/v1.
 * Supports timeouts, request cancellation, JSON envelope parsing,
 * and future Firebase ID token integration.
 */

export class ApiClientError extends Error {
  constructor(message, status = 500, code = 'API_ERROR', details = null, requestId = null) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

function getDefaultApiBaseUrl() {
  if (typeof window !== 'undefined') {
    // 1. Explicit runtime override takes highest precedence (for separated frontend/backend hosting)
    if (window.__INTELLICORE_API_BASE_URL__) {
      return window.__INTELLICORE_API_BASE_URL__;
    }
    if (window.__ENV__ && window.__ENV__.API_BASE_URL) {
      return window.__ENV__.API_BASE_URL;
    }
    const host = window.location.hostname;
    // 2. When served from static GitHub Pages, bridge cross-origin; custom domain serves same-origin via Vercel
    if (host.endsWith('github.io')) {
      return 'https://intellicore-six.vercel.app/api/v1';
    }
  }
  // 3. Same-origin modular monolith default (/api/v1 on local Express)
  return '/api/v1';
}

class ApiClient {
  constructor(baseUrl = getDefaultApiBaseUrl(), defaultTimeoutMs = 12000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.tokenProvider = null;
  }

  /**
   * Register a dynamic token provider for future Firebase ID token injection
   * @param {() => Promise<string|null>} provider 
   */
  setTokenProvider(provider) {
    if (typeof provider === 'function') {
      this.tokenProvider = provider;
    }
  }

  /**
   * Internal HTTP execution engine
   */
  async request(endpoint, options = {}) {
    const {
      method = 'GET',
      headers = {},
      body,
      timeoutMs = this.defaultTimeoutMs,
      signal: customSignal,
      responseType,
      ...customOptions
    } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // If caller provided an external AbortSignal, link it
    if (customSignal) {
      customSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const requestHeaders = {
      Accept: 'application/json',
      ...headers
    };

    const rawBody = body instanceof FormData || body instanceof Blob;
    if (body !== undefined && !rawBody) {
      requestHeaders['Content-Type'] = 'application/json';
    }

    // Attach Bearer token if token provider is configured
    if (this.tokenProvider) {
      try {
        const token = await this.tokenProvider();
        if (token) {
          requestHeaders.Authorization = `Bearer ${token}`;
        }
      } catch (err) {
        console.warn('[ApiClient] Failed to acquire auth token:', err);
      }
    }

    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.baseUrl}/${endpoint.replace(/^\//, '')}`;

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body !== undefined && !rawBody ? JSON.stringify(body) : body,
        signal: controller.signal,
        ...customOptions
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      let data = null;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else if (response.ok && responseType === 'blob') {
        return await response.blob();
      } else {
        data = await response.text();
      }

      const requestId = response.headers.get('x-request-id') || (data && data.requestId);

      if (!response.ok) {
        const errorMessage = (data && data.error && data.error.message)
          || (data && data.message)
          || `Request failed with HTTP status ${response.status}`;
        const errorCode = (data && data.error && data.error.code)
          || `HTTP_${response.status}`;

        throw new ApiClientError(
          errorMessage,
          response.status,
          errorCode,
          data && data.error ? data.error.details : null,
          requestId
        );
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new ApiClientError(
          `Request to ${endpoint} timed out after ${timeoutMs}ms`,
          408,
          'REQUEST_TIMEOUT'
        );
      }

      if (error instanceof ApiClientError) {
        throw error;
      }

      throw new ApiClientError(
        error.message || 'Network request failed',
        0,
        'NETWORK_FAILURE'
      );
    }
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  post(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', body });
  }

  put(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'PUT', body });
  }

  patch(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'PATCH', body });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient();
export default api;

