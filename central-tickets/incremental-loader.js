(function(){
  // Simple incremental loader: loads data in batches from multiple sources.
  // Each source must provide a fetcher(page, batchSize) => Promise<Array>
  // onBatch is called with { source, batch, total } and the accumulated results array
  // onDone is called with the final results array
  window.IncrementalLoader = {
    loadInBatches: async function({ sources, batchSize = 50, onBatch, onDone }) {
      const all = [];
      for (const src of sources) {
        const { name, fetcher } = src;
        if (typeof fetcher !== 'function') continue;
        let page = 0;
        while (true) {
          let batch = [];
          try {
            batch = await fetcher(page, batchSize);
          } catch (e) {
            console.error(`IncrementalLoader: error in source ${name} page ${page}`, e);
            batch = [];
          }
          if (!Array.isArray(batch) || batch.length === 0) break;
          all.push(...batch);
          if (typeof onBatch === 'function') onBatch({ source: name, batch, total: all.length }, all);
          page++;
        }
      }
      if (typeof onDone === 'function') onDone(all);
      return all;
    }
  };
})();
