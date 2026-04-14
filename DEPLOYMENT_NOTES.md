## Vercel

Set these frontend environment variables:

```env
VITE_API_URL=https://your-render-backend.onrender.com/api
VITE_API_BASE_URL=https://your-render-backend.onrender.com/api
VITE_DEFAULT_GET_TIMEOUT_MS=12000
```

## Render

Set these backend environment variables:

```env
PORT=5000
JWT_SECRET=your-secret
CORS_ORIGIN=https://your-main-frontend.vercel.app
CORS_ORIGIN_REGEX=^https://serviceconnectpro-.*\.vercel\.app$
MONGO_URI_STANDARD=your-standard-mongodb-uri
MONGO_DNS_SERVERS=8.8.8.8,1.1.1.1
MONGO_SERVER_SELECTION_TIMEOUT_MS=10000
MONGO_CONNECT_TIMEOUT_MS=10000
MONGO_SOCKET_TIMEOUT_MS=20000
MONGO_VERIFY_WITH_PING=false
SERVICES_QUERY_TIMEOUT_MS=6000
SERVICES_REFRESH_TIMEOUT_MS=1500
```

## Notes

- Redeploy both frontend and backend after changing environment variables.
- If Render is on a cold-starting plan, the first request can still be slower than local, but the app should no longer fail simply because the frontend aborted too early.
- `CORS_ORIGIN_REGEX` helps preview Vercel links work without updating CORS for every new preview URL.
