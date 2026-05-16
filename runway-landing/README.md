# Runway Landing Page

Public-facing Next.js + Tailwind landing page for Runway.

The Streamlit affordability product remains separate. This app is only the marketing site.

## Local Development

```bash
cd runway-landing
npm install
npm run dev
```

Open `http://localhost:3000`.

## Demo Link

The `Try the demo` buttons use:

```bash
NEXT_PUBLIC_DEMO_URL=https://runway.streamlit.app
```

If the env var is not set, the app falls back to `https://runway.streamlit.app`.

## Push To GitHub

From the repo root:

```bash
git add runway-landing
git commit -m "Add Runway Next.js landing page"
git push
```

## Deploy To Vercel

1. Go to Vercel and import the GitHub repository.
2. Set the project root directory to `runway-landing`.
3. Use the default Next.js build settings:
   - Install command: `npm install`
   - Build command: `npm run build`
   - Output directory: `.next`
4. Add the environment variable:

```bash
NEXT_PUBLIC_DEMO_URL=https://runway.streamlit.app
```

5. Deploy.

## Notes

- This landing page does not include the affordability engine.
- The Streamlit app remains the interactive demo.
- The backend and Streamlit code stay separate from this Next.js app.
