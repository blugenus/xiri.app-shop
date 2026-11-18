# Xiri App Shop (web part)

Vanilla JS web app for the payment flow: the user picks an amount, the app asks the
backend to create a transaction, redirects to the payment gateway, and after the gateway
returns the user it asks the backend for the real payment status (the URL is never trusted
as proof of payment).

## Layout

```
public/    Web root: everything a server needs to serve
  favicon.ico
  devices/
    css/  js/  templates/        shared by every device page
    <deviceId>/index.html        one page per device, e.g. devices/12345678/
```

The backend lives in its own repo, `../xiri.app-shop-api` (ASP.NET Core, .NET 10). It serves
`public/` as the site root and implements the API the webapp calls.

## Run locally

Requires the .NET SDK 10. Keep both repos side by side, then from `xiri.app-shop-api`:

```
dotnet run --project src/Xiri.Api
```

Open <http://localhost:5080/>. In Development the API uses a built-in fake payment gateway, so
you can pick success / failed / pending / cancelled without any real provider.

## How the webapp talks to the backend

- `productsModule.js`: `POST /api/v1/devices/{deviceId}/checkout` with `{ amount, description }`
  -> `201 { transactionId, redirect_url }`, then navigates to `redirect_url`. The device id comes
  from the page URL (`/devices/<id>/`).
- After the gateway, the backend redirects back to `/devices/{deviceId}?page=success|failed&transaction={id}`
  (cancel returns to the bare device URL).
- `deviceModule.js`: for `?page=success|failed` it calls `GET /api/v1/transactions/{id}` and renders
  the result from the **returned status**, never from the `page` parameter:
  `successful`/`reconciled` -> success, `failed`/`error` -> failed, `cancelled` -> cancelled,
  `created`/`pending`/`payment-pending` -> "being processed" (polled every 6s, up to about 30s; in production
  the reverse proxy rate limits this endpoint, a 429 is retried after a pause), anything else -> "could not confirm".

See `../xiri.app-shop-api/README.md` for the full API reference.
