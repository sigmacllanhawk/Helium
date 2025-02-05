importScripts("/staff/uv.bundle.js");
importScripts("/staff/uv.config.js");
importScripts("/staff/uv.sw.js");

const uv = new UVServiceWorker();

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async function () {
        return await uv.fetch(event); 
    })()
  );
});

