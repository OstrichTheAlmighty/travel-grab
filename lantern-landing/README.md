# Byable Landing Page

Public-facing Next.js + Tailwind landing page for Byable.

Primary hook: “How can I afford this by this date?”

Supporting tagline: “See the path to what you want.”

The Streamlit affordability product remains separate. This app is only the marketing site.

## Local Development

```bash
cd lantern-landing
npm install
npm run dev
```

Open `http://localhost:3000`.

## Demo Link

The `Try the demo` buttons use:

```bash
NEXT_PUBLIC_DEMO_URL=https://byable-demo.streamlit.app
```

If the env var is not set, the app falls back to `https://byable-demo.streamlit.app`.

## Push To GitHub

From the repo root:

```bash
git add lantern-landing
git commit -m "Add Byable Next.js landing page"
git push
```

## Deploy To Vercel

1. Go to Vercel and import the GitHub repository.
2. Set the project root directory to `lantern-landing`.
3. Use the default Next.js build settings:
   - Install command: `npm install`
   - Build command: `npm run build`
   - Output directory: `.next`
4. Add the environment variable:

```bash
NEXT_PUBLIC_DEMO_URL=https://byable-demo.streamlit.app
```

5. Deploy.

## Notes

- This landing page does not include the affordability engine.
- The Streamlit app remains the interactive demo.
- The backend and Streamlit code stay separate from this Next.js app.
