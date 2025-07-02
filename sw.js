// Service Worker for o2omation Landing Page
// Provides offline functionality and performance optimization

const CACHE_NAME = "o2omation-v1.0.0";
const STATIC_CACHE_URLS = [
  "/",
  "/index.html",
  "/assets/css/style.css",
  "/assets/js/main.js",
  "/assets/images/logo.svg",
  "/assets/images/logo-white.svg",
  "https://cdn.tailwindcss.com",
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap",
];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("Caching static assets");
        return cache.addAll(STATIC_CACHE_URLS);
      })
      .then(() => {
        console.log("Service worker installed successfully");
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error("Service worker installation failed:", error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log("Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log("Service worker activated");
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache with network fallback
self.addEventListener("fetch", (event) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") {
    return;
  }

  // Skip external requests
  if (
    !event.request.url.startsWith(self.location.origin) &&
    !event.request.url.includes("fonts.googleapis.com") &&
    !event.request.url.includes("cdn.tailwindcss.com")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached version if available
      if (cachedResponse) {
        return cachedResponse;
      }

      // Otherwise fetch from network
      return fetch(event.request)
        .then((response) => {
          // Don't cache non-successful responses
          if (
            !response ||
            response.status !== 200 ||
            response.type !== "basic"
          ) {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          // Cache the response for future use
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch((error) => {
          console.error("Fetch failed:", error);

          // Return offline page for navigation requests
          if (event.request.destination === "document") {
            return caches.match("/index.html");
          }

          throw error;
        });
    })
  );
});

// Background sync for form submissions
self.addEventListener("sync", (event) => {
  if (event.tag === "contact-form-sync") {
    event.waitUntil(syncContactForm());
  }
});

// Function to sync contact form data when online
async function syncContactForm() {
  try {
    const db = await openDB();
    const tx = db.transaction(["pending-forms"], "readonly");
    const store = tx.objectStore("pending-forms");
    const pendingForms = await store.getAll();

    for (const form of pendingForms) {
      try {
        // Attempt to submit the form
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form.data),
        });

        if (response.ok) {
          // Remove from pending forms if successful
          const deleteTx = db.transaction(["pending-forms"], "readwrite");
          const deleteStore = deleteTx.objectStore("pending-forms");
          await deleteStore.delete(form.id);
        }
      } catch (error) {
        console.error("Failed to sync form:", error);
      }
    }
  } catch (error) {
    console.error("Background sync failed:", error);
  }
}

// Helper function to open IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("o2omation-db", 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("pending-forms")) {
        db.createObjectStore("pending-forms", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
  });
}

// Push notification handling (for future use)
self.addEventListener("push", (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: "/assets/images/favicon.svg",
      badge: "/assets/images/favicon.svg",
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: data.primaryKey,
      },
      actions: [
        {
          action: "explore",
          title: "Learn More",
          icon: "/assets/images/favicon.svg",
        },
        {
          action: "close",
          title: "Close",
          icon: "/assets/images/favicon.svg",
        },
      ],
    };

    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});

// Notification click handling
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "explore") {
    event.waitUntil(clients.openWindow("/"));
  }
});
