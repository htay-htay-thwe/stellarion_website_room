// Shared helpers for cart & checkout flows
// Handles authentication tokens, API calls, formatting, and lightweight UI utilities.

(function initCommerceUtils(global) {
    const TOKEN_KEYS = ['stellarion_jwt', 'stellarion_token', 'auth_token'];
    const FALLBACK_USER_KEY = 'stellarion_user';
    const API_BASE = global.STELLARION_API_BASE || 'http://localhost:3000';

    const decodeBase64Url = (input) => {
        try {
            const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
            const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
            const decoded = atob(padded);
            return decodeURIComponent(decoded.split('').map((c) => {
                const hex = c.charCodeAt(0).toString(16).padStart(2, '0');
                return `%${hex}`;
            }).join(''));
        } catch (error) {
            console.warn('Failed to decode base64 token payload:', error);
            return null;
        }
    };

    const decodeJwtPayload = (token) => {
        if (!token || typeof token !== 'string') {
            return null;
        }

        const parts = token.split('.');
        if (parts.length !== 3) {
            return null;
        }

        const payload = decodeBase64Url(parts[1]);
        if (!payload) {
            return null;
        }

        try {
            return JSON.parse(payload);
        } catch (error) {
            console.warn('Unable to parse JWT payload:', error);
            return null;
        }
    };

    const getStoredToken = () => {
        for (const key of TOKEN_KEYS) {
            const value = localStorage.getItem(key);
            if (value) {
                return value;
            }
        }
        return null;
    };

    const getStoredUser = () => {
        try {
            const raw = localStorage.getItem(FALLBACK_USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            console.warn('Failed to parse stored user information:', error);
            return null;
        }
    };

    const resolveUserFromToken = (token) => {
        const payload = decodeJwtPayload(token);
        if (!payload) {
            return null;
        }

        const candidateId = payload.id ?? payload.userId ?? payload.sub ?? null;
        const parsedId = Number.parseInt(candidateId, 10);
        const userId = Number.isFinite(parsedId) ? parsedId : null;

        return {
            id: userId,
            email: payload.email || null,
            name: payload.name || payload.username || null,
            role: payload.userType || payload.role || null
        };
    };

    const getCurrentUser = () => {
        const token = getStoredToken();
        if (token) {
            const tokenUser = resolveUserFromToken(token);
            if (tokenUser && tokenUser.id) {
                return { ...tokenUser, token };
            }
        }

        const storedUser = getStoredUser();
        if (storedUser && storedUser.id) {
            return {
                id: storedUser.id,
                email: storedUser.email || storedUser.username || null,
                name: `${storedUser.firstName || ''} ${storedUser.lastName || ''}`.trim() || storedUser.username || null,
                role: storedUser.userType || storedUser.role || null,
                token: token || null
            };
        }

        return token ? { token } : null;
    };

    const ensureAuthenticated = ({ redirectOnFail = true, signinUrl = 'signin.html' } = {}) => {
        const token = getStoredToken();
        if (!token) {
            if (redirectOnFail) {
                const redirect = `${signinUrl}?redirect=${encodeURIComponent(global.location.pathname)}`;
                global.location.href = redirect;
            }
            const error = new Error('Authentication required');
            error.code = 'AUTH_REQUIRED';
            throw error;
        }
        return token;
    };

    const getActiveUserId = () => {
        const token = getStoredToken();
        const tokenUser = token ? resolveUserFromToken(token) : null;
        const storedUser = getStoredUser();

        const idCandidates = [tokenUser?.id, storedUser?.id, storedUser?.userId];
        for (const candidate of idCandidates) {
            const numeric = Number.parseInt(candidate, 10);
            if (Number.isFinite(numeric) && numeric > 0) {
                return numeric;
            }
        }

        return null;
    };

    const formatCurrency = (value) => {
        const numeric = Number.parseFloat(value);
        if (!Number.isFinite(numeric)) {
            return '$0.00';
        }
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(numeric);
    };

    const apiFetch = async (path, { method = 'GET', headers = {}, body = undefined, auth = true } = {}) => {
        const finalHeaders = new Headers(headers);

        if (auth) {
            const token = getStoredToken();
            if (!token) {
                const error = new Error('Authentication required');
                error.code = 'AUTH_REQUIRED';
                throw error;
            }
            finalHeaders.set('Authorization', `Bearer ${token}`);
        }

        if (body && !(body instanceof FormData)) {
            finalHeaders.set('Content-Type', 'application/json');
        }

        const response = await fetch(`${API_BASE}${path}`, {
            method,
            headers: finalHeaders,
            body: body && !(body instanceof FormData) ? JSON.stringify(body) : body
        });

        let parsed;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            parsed = await response.json().catch(() => null);
        } else {
            parsed = await response.text().catch(() => null);
        }

        if (!response.ok) {
            const message = parsed?.message || parsed?.error || response.statusText || 'Request failed';
            const error = new Error(message);
            error.status = response.status;
            error.payload = parsed;
            throw error;
        }

        return parsed;
    };

    const setLoadingState = (element, isLoading, { text = 'Loading…', originalText } = {}) => {
        if (!element) {
            return;
        }
        if (isLoading) {
            element.dataset.originalText = originalText || element.textContent || '';
            element.textContent = text;
            element.disabled = true;
        } else {
            element.textContent = element.dataset.originalText || element.textContent;
            element.disabled = false;
        }
    };

    const showBannerMessage = (container, message, { type = 'info' } = {}) => {
        if (!container) {
            return;
        }
        container.textContent = message;
        container.className = `message message-${type}`;
        container.hidden = !message;
    };

    const Commerce = {
        API_BASE,
        getToken: getStoredToken,
        getCurrentUser,
        getActiveUserId,
        ensureAuthenticated,
        apiFetch,
        formatCurrency,
        setLoadingState,
        showBannerMessage
    };

    global.Commerce = Commerce;
})(window);
