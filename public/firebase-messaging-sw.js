importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: "AIzaSyDNIDUj2ecjIUBeNjIwTisn5X46plXEhjQ",
  authDomain: "sonfun0linel.firebaseapp.com",
  projectId: "sonfun0linel",
  storageBucket: "sonfun0linel.firebasestorage.app",
  messagingSenderId: "744126125400",
  appId: "1:744126125400:web:6d0463c11ab46107c4812d"
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || 'SoFun'
  const body  = payload.notification?.body  || ''
  self.registration.showNotification(title, {
    body,
    icon:  '/Logo.jpg',
    badge: '/Logo.jpg',
    tag:   payload.data?.tag || 'sofun-notif',
    data:  payload.data || {},
  })
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.navigate(url)
          return c.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
