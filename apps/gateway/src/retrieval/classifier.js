/** Optional English-only local classifier. Import requires the development classifier dependency. */
export async function loadClassifier({ dtype = 'fp32', cacheDir, localModel } = {}) {
  const { pipeline, env } = await import('@huggingface/transformers');
  if (cacheDir) env.cacheDir = cacheDir;
  const model = localModel ?? 'protectai/deberta-v3-base-prompt-injection-v2';
  const classifier = await pipeline('text-classification', model, { revision: localModel ? undefined : '90c9989b1a342275dd0d1a95aad283c04e075671', dtype, device: 'cpu' });
  return {
    async classify(text) {
      // Do not silently truncate a long chunk: callers must supply bounded ingestion chunks.
      const tokens = await classifier.tokenizer(text);
      if (tokens.input_ids.dims.at(-1) > 512) throw new Error('Classifier chunk exceeds 512 tokens');
      const rows = await classifier(text, { top_k: 2 });
      const injection = rows.find(row => row.label === 'INJECTION');
      if (!injection || !Number.isFinite(injection.score)) throw new Error('Unknown classifier label contract');
      return injection.score;
    },
    close() { return classifier.dispose(); },
  };
}
