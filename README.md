# TessellNation shop and client library

The public contact page remains at `/`. The private, invite-only document library is at `/library/`.

## Local setup

```powershell
npm install
npm run build
npm run dev
```

Netlify Identity only works fully against the deployed HTTPS site. The local page can still be used to inspect layout and unauthenticated behaviour.

## Upload the private PDF library

PDFs are uploaded directly to the `street-faces` Netlify Blob store and are not committed to Git.

1. In Netlify, open **User settings → Applications → Personal access tokens** and create a token.
2. In a PowerShell window, set the token for that window only:

```powershell
$env:NETLIFY_AUTH_TOKEN = "your-token"
$env:NETLIFY_SITE_ID = "488a325a-2bf6-4078-ba4b-59f7e637ef2d"
$env:PDF_SOURCE_DIR = "E:\street_faces\pdfs"
npm run upload:library
```

Do not put the token in this repository or send it in chat. Close the terminal after uploading to remove the session variable.

## Deployment

Netlify runs `npm run build` and publishes the repository root. Functions live in `netlify/functions`.
