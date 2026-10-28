// Built-ins pdf.js needs that some browsers still lack. Safari (iPhone and Mac) cannot loop over a
// ReadableStream with `for await`, which pdf.js uses to read a page's text.
export function addStreamIteration() {
  if (typeof ReadableStream === "undefined" || ReadableStream.prototype[Symbol.asyncIterator]) return;
  ReadableStream.prototype.values = function values({ preventCancel = false } = {}) {
    const reader = this.getReader();
    return {
      async next() {
        try {
          const r = await reader.read();
          if (r.done) reader.releaseLock();
          return r;
        } catch (e) { reader.releaseLock(); throw e; }
      },
      async return(value) {
        if (!preventCancel) { const p = reader.cancel(value); reader.releaseLock(); await p; } else reader.releaseLock();
        return { done: true, value };
      },
      [Symbol.asyncIterator]() { return this; },
    };
  };
  ReadableStream.prototype[Symbol.asyncIterator] = ReadableStream.prototype.values;
}
