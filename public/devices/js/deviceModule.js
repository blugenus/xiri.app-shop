const params = new URLSearchParams(window.location.search);

// Device id comes from the URL path: /devices/<id>/
const DEVICE_ID = (window.location.pathname.match(/\/devices\/([^/]+)/) || [])[1] ?? null;

// The status endpoint is rate limited by the reverse proxy (about 30 requests/min per IP), so poll gently:
// first check immediately, then every 6s, at most 6 checks (about 30s) in total.
const POLL_INTERVAL_MS = 6000;
const MAX_CHECKS = 6;
const MAX_RETRY_AFTER_MS = 30000;

// Backend transaction status -> template. Anything not listed here and not pending is shown as "could not confirm".
const STATUS_TEMPLATES = {
    successful: 'payment-success',
    reconciled: 'payment-success',
    failed: 'payment-failed',
    error: 'payment-failed',
    cancelled: 'payment-cancelled',
};

// Statuses that can still change (e.g. the provider's notification has not arrived yet).
const PENDING_STATUSES = new Set(['created', 'pending', 'payment-pending']);

class StatusRequestError extends Error {
    constructor(message, retryAfterMs = null) {
        super(message);
        this.retryAfterMs = retryAfterMs;
    }
}

async function appendFromTemplate(name) {
    const response = await fetch(`/devices/templates/${name}.html`);
    const htmlText = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const template = doc.getElementById(name);
    if (null === template) {
        throw new Error(`Template "${name}" not found`);
    }
    const clone = template.content.cloneNode(true);

    const appContainer = document.getElementById('app');
    appContainer.innerHTML = '';
    appContainer.appendChild(clone);
}

async function showTransactionTemplate(name, transactionId) {
    await appendFromTemplate(name);
    const instructionText = document.getElementById('instruction-text');
    if (null !== instructionText) {
        instructionText.textContent = `Tran. ID: ${transactionId}`;
    }
}

// Asks the backend for the real status. The URL (?page=success|failed) is never trusted as proof of payment.
async function fetchTransactionStatus(transactionId) {
    const response = await fetch(`/api/v1/transactions/${encodeURIComponent(transactionId)}`, {
        headers: { Accept: 'application/json' },
    });

    if (429 === response.status) {
        const seconds = Number(response.headers.get('Retry-After'));
        const waitMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : POLL_INTERVAL_MS;
        throw new StatusRequestError('Rate limited', Math.min(waitMs, MAX_RETRY_AFTER_MS));
    }

    if (!response.ok) {
        throw new StatusRequestError(`Status request failed (${response.status})`);
    }

    const data = await response.json();
    return data.status;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function showPaymentResult(transactionId) {
    let pendingShown = false;

    for (let check = 1; check <= MAX_CHECKS; check++) {
        let status = null;
        let waitMs = POLL_INTERVAL_MS;

        try {
            status = await fetchTransactionStatus(transactionId);
        } catch (error) {
            if (null === error.retryAfterMs) {
                console.error(error);
                await showTransactionTemplate('payment-error', transactionId);
                return;
            }
            // Rate limited: wait as long as the server asks, then try again.
            waitMs = error.retryAfterMs;
        }

        if (null !== status && Object.hasOwn(STATUS_TEMPLATES, status)) {
            await showTransactionTemplate(STATUS_TEMPLATES[status], transactionId);
            return;
        }

        if (null !== status && !PENDING_STATUSES.has(status)) {
            // e.g. voided / refunded / chargebacked: the payment did not end the way the user expects.
            console.error(`Unexpected payment status: ${status}`);
            await showTransactionTemplate('payment-error', transactionId);
            return;
        }

        if (!pendingShown) {
            await showTransactionTemplate('payment-pending', transactionId);
            pendingShown = true;
        }

        if (check < MAX_CHECKS) {
            await sleep(waitMs);
        }
    }

    // Still not final after about 30s.
    await showTransactionTemplate('payment-error', transactionId);
}

document.addEventListener('DOMContentLoaded', () => {
    const page = params.get('page');
    const transactionId = params.get('transaction');

    // The backend sends the browser back here with ?page=success|failed&transaction=<id> after the gateway.
    // A bare device URL (e.g. after cancelling) has no parameters and shows the product selection.
    if (('success' === page || 'failed' === page) && transactionId) {
        showPaymentResult(transactionId);
        return;
    }

    initializeProducts();
});
