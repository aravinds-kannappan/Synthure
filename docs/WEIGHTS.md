# Model weights: storage strategy

The repository ships about 195 MB of binaries under `frontend/public/`:

| Asset | Size | What |
|---|---|---|
| `public/models/disease-tinymed-65m/onnx/model_quantized.onnx` | 63 MB | OpenMed disease NER (int8) |
| `public/models/pharma-tinymed-65m/onnx/model_quantized.onnx` | 63 MB | OpenMed pharma NER (int8) |
| `public/models/pii-clinicale5-33m/onnx/model_quantized.onnx` | 32 MB | OpenMed de-identification (int8) |
| `public/vendor/transformers/ort/*.wasm` | ~35 MB | ONNX Runtime Web (WASM) |

These are served as static assets and run in the browser. That is deliberate: the
README's privacy claim is that there is **no external model host and no external
inference call for extraction**. The identifiable note never leaves the device.

## Why not a CDN

Moving the weights to a CDN would break exactly that claim: extraction would then
depend on an external host. So a CDN is off the table for these files.

## Why Git LFS is optional, not automatic

The two 63 MB files exceed GitHub's **50 MB soft warning**, but they are under the
**100 MB hard limit**, so they push and deploy fine today. The warning is cosmetic.

Git LFS would keep the files self-hosted (so the privacy story holds) while getting
the blobs out of the main git history. But it has two real costs for this project:

1. **Vercel must be told to pull LFS.** By default Vercel checks out LFS **pointer
   files**, not the real binaries, which would ship a broken app. You must enable
   LFS for the Vercel project (Git settings), or the deploy silently breaks.
2. **GitHub LFS free tier is 1 GB storage and 1 GB bandwidth per month.** At ~195 MB
   fetched per build, a handful of deploys per month can exhaust the bandwidth quota
   and then deploys fail until it resets.

And the migration is a **history rewrite plus force-push**, which is hard to reverse.

## Recommendation

Keep the weights self-hosted in the repo unless clone size becomes a real pain.
The current setup deploys on the Vercel free tier and satisfies the privacy design.

If you do want LFS, the migration is scripted and vetted but **you** run it, because
it rewrites history and force-pushes:

```bash
# 1. install git-lfs first (brew install git-lfs, or apt-get install git-lfs)
# 2. dry run: prints the plan, changes nothing
bash scripts/migrate_lfs.sh
# 3. actually migrate this branch (rewrites history), then force-push yourself
bash scripts/migrate_lfs.sh --yes
git push --force-with-lease
# 4. enable Git LFS for the project in Vercel, then redeploy
```
