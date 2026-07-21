'use strict';

(function enhanceUI() {
  function ready(callback) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
    else callback();
  }

  ready(() => {
    const main = document.querySelector('.main-shell');
    if (main && !main.id) main.id = 'mainContent';

    const skip = document.createElement('a');
    skip.href = '#mainContent';
    skip.className = 'skip-link';
    skip.textContent = 'ข้ามไปยังเนื้อหาหลัก';
    document.body.prepend(skip);

    const heading = document.querySelector('.page-heading');
    if (heading && !document.getElementById('connectionState')) {
      const connection = document.createElement('span');
      connection.id = 'connectionState';
      connection.className = `connection-state ${navigator.onLine ? 'online' : 'offline'}`;
      connection.textContent = navigator.onLine ? 'ออนไลน์' : 'ออฟไลน์';
      heading.appendChild(connection);

      const update = () => {
        connection.className = `connection-state ${navigator.onLine ? 'online' : 'offline'}`;
        connection.textContent = navigator.onLine ? 'ออนไลน์' : 'ออฟไลน์';
      };
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
    }

    document.addEventListener('click', (event) => {
      const nav = event.target.closest('[data-page]');
      if (!nav) return;
      requestAnimationFrame(() => {
        const page = document.querySelector('.page.active');
        if (!page) return;
        page.classList.remove('page-enter');
        void page.offsetWidth;
        page.classList.add('page-enter');
      });
    });
  });
})();
