# PC Doctor download page

A single static page, `index.html`. No build step and no dependencies. Open it in a browser to preview it.

```
website/
  index.html
  downloads/
    PC-Doctor-Setup-1.0.0.exe
    PC-Doctor-Portable-1.0.0.exe
```

## Live site

**https://pc-doctor-three.vercel.app** (Vercel project `pc-doctor`)

The download buttons link to the installers stored in this GitHub repository with Git LFS, so Vercel only hosts the small page. The `.vercelignore` file keeps the large `downloads/` folder out of the upload.

### Deploy a change to Vercel

Run these from this `website` folder:

```
npx vercel login          # once, approve the link in your browser
npx vercel deploy --prod  # publishes to the live address
```

Pushing to GitHub does **not** deploy automatically (Git deployments are switched off for this project). Always deploy with the command above.

## Publish it somewhere else

Upload the whole `website` folder to any static host (Vercel, Netlify, GitHub Pages, IIS, or a plain web server). The download buttons point at `downloads/...` next to the page.

**Check your host's file size limit first.** The installers are 118 MB and 108 MB. Some hosts reject single files over about 100 MB. If yours does, upload the two `.exe` files somewhere that allows large files (for example GitHub Releases) and put those full `https://` links into the `RELEASE` block in `index.html`. The page itself stays on your normal host.

## Publish a new version

1. Run `npm run dist` in `apps\desktop` to build the new installers.
2. Copy the two `.exe` files into `website/downloads/` (or upload them to your large-file host).
3. Get each file's checksum: `Get-FileHash .\PC-Doctor-Setup-1.0.0.exe` in PowerShell.
4. Edit the `RELEASE` block near the bottom of `index.html`: the version, the two links, the sizes and the two SHA-256 values.
5. Update the "Release notes" section in `index.html`.
6. Upload again.

## Things to know

- The build is not code-signed, so Windows SmartScreen shows a warning. The page explains the **More info, Run anyway** steps and shows SHA-256 checksums so people can check their download.
- The health score ring on the page is an illustration and is labelled as one.
- Never put your license key or the signing key on this page.
