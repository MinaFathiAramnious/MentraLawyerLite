const CACHE_NAME = 'mentralawyer-offline-v2'; // تأكد إنك غيرتها لـ v2 هنا

const STATIC_ASSETS = [
    './',
    'index.html',
    'subscriptions.html',
    'dashboard.html',
    'Tutorial.html',
    'manifest.json',
    'database.js',
    'pages/main.js',
    'pages/agenda.js',
    'pages/cases.js',
    'pages/clients.js',
    'pages/documents.js',
    'pages/accounting.js',
    'pages/settings.js',
    'pages/backup.js',
    'assets/log.png',
    'assets/step.PNG',
    'assets/step1.PNG',
    'assets/step2.PNG',
    'assets/step3.PNG',
    'assets/step4.PNG',
    'assets/step5.PNG',
    'assets/step6.PNG',
    'assets/step7.PNG',
    'assets/step8.PNG',
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://unpkg.com/react@18/umd/react.production.min.js',
    'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
    'https://unpkg.com/@babel/standalone/babel.min.js',
    'https://unpkg.com/dexie@3.2.4/dist/dexie.min.js',
    'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap'
];

// التثبيت: تحميل الملفات فرادى عشان نعرف مين اللي "ظالط" العملية
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('--- جاري محاولة تثبيت v2 ---');
            for (const asset of STATIC_ASSETS) {
                try {
                    const response = await fetch(asset, { cache: 'no-cache' });
                    if (!response.ok) throw new Error('File not found');
                    await cache.put(asset, response);
                } catch (err) {
                    // هيطبع لك هنا الملف اللي مساره غلط
                    console.error(`❌ ملف فيه مشكلة: ${asset}`);
                }
            }
        })
    );
});

// التفعيل: مسح أي كاش قديم (v1)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('🗑️ مسح كاش قديم:', key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// جلب البيانات: Network-First (عشان التحديثات تظهر علطول لو فيه نت)
self.addEventListener('fetch', (event) => {
    if (!event.request.url.startsWith('http')) return;
    event.respondWith(
        fetch(event.request)
            .then((res) => {
                const resClone = res.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
                return res;
            })
            .catch(() => caches.match(event.request))
    );
});
