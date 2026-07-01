/** @type {import('next').NextConfig} */
const nextConfig = {
  // Synthure runs entirely on Next.js route handlers plus on-device OpenMed
  // models served from /public/models. No external backend.
  experimental: {
    // Keep transformers.js out of the server bundle entirely; it only ever
    // executes in the browser.
    serverComponentsExternalPackages: ['@huggingface/transformers'],
    // Ship the knowledge artifacts (built by scripts/build_knowledge) with the
    // synthesize function so fs reads work on Vercel.
    outputFileTracingIncludes: {
      '/api/synthesize': ['./data/**'],
    },
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
