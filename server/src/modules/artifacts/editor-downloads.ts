// Both editors need their native host download capability inside an iframe.
export const EDITOR_DOWNLOAD_SCRIPT = `document.addEventListener('DOMContentLoaded', () => {
  (window.slidesHost ?? window.designHost).downloads = {
    async save({ filename, data }) {
      if (typeof filename !== 'string' || !(data instanceof Blob || data instanceof ArrayBuffer)) {
        throw new TypeError('Invalid download');
      }
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      try { link.click(); }
      finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    }
  };
});`
