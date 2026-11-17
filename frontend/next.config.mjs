import { fileURLToPath } from 'node:url'

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
  // Synthure runs entirely on Next.js route handlers plus on-device OpenMed
  // models served from /public/models. No external backend.
  // Browser-only model runtime stays outside the server bundle.
  serverExternalPackages: ['@huggingface/transformers'],
  // Next 15 promotes output tracing configuration to stable top-level keys.
  outputFileTracingIncludes: {
    '/api/synthesize': ['./data/**'],
  },
  webpack: (config) => {
    // transformers.js runs in the browser (wasm); never bundle its node backend.
    config.resolve.alias = {
      ...config.resolve.alias,
      'onnxruntime-node$': false,
      sharp$: false,
    }
    return config
  },
}

export default nextConfig
