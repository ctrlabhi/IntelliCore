(function () {
  'use strict';

  const dateElements = document.querySelectorAll('[data-live-date]');
  const timeElements = document.querySelectorAll('[data-live-time]');
  const greetingElements = document.querySelectorAll('[data-live-greeting]');
  if (!dateElements.length && !timeElements.length && !greetingElements.length) return;

  const dateFormatter = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  });
  const timeFormatter = new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h12',
    timeZone: 'Asia/Kolkata'
  });
  const hourFormatter = new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Kolkata'
  });

  function updateClock() {
    const now = new Date();
    const date = dateFormatter.format(now);
    const timeParts = timeFormatter.formatToParts(now);
    const timeValue = timeParts
      .filter(part => part.type !== 'dayPeriod')
      .map(part => part.value)
      .join('');
    const dayPeriod = timeParts.find(part => part.type === 'dayPeriod');
    const hour = Number(hourFormatter.format(now));
    const greeting = hour < 12
      ? 'Good Morning'
      : hour < 17
        ? 'Good Afternoon'
        : hour < 21
          ? 'Good Evening'
          : 'Good Night';
    dateElements.forEach(element => { element.textContent = date; });
    timeElements.forEach(element => {
      element.replaceChildren(document.createTextNode(timeValue));
      if (dayPeriod) {
        const period = document.createElement('span');
        period.className = 'live-time-period';
        period.textContent = dayPeriod.value.toUpperCase();
        element.append(period);
      }
    });
    greetingElements.forEach(element => {
      element.textContent = `${greeting}!`;
      element.dataset.greeting = greeting;
    });
  }

  updateClock();
  window.setInterval(updateClock, 1000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) updateClock();
  });
})();
