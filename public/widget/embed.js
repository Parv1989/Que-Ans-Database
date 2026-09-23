(function () {
  var currentScript = document.currentScript;
  var botUrl = (currentScript && currentScript.getAttribute('data-bot-url')) || '';
  if (!botUrl) {
    console.error('Publisher Bot: data-bot-url attribute is missing on the embed script tag.');
    return;
  }
  botUrl = botUrl.replace(/\/$/, '');

  // Floating launcher button
  var launcher = document.createElement('button');
  launcher.setAttribute('aria-label', 'Open help chat');
  launcher.innerHTML = '&#129302;';
  launcher.style.cssText =
    'position:fixed;bottom:22px;right:22px;width:60px;height:60px;border-radius:50%;' +
    'background:linear-gradient(135deg,#6c63ff,#8b7ff5);color:#fff;border:none;font-size:26px;cursor:pointer;' +
    'box-shadow:0 10px 28px rgba(108,99,255,0.45);z-index:999998;' +
    'animation:pbGlow 2.4s ease-in-out infinite;';

  // small stylesheet for the launcher's pulsing glow (can't be inline)
  var style = document.createElement('style');
  style.textContent =
    '@keyframes pbGlow{0%,100%{box-shadow:0 10px 28px rgba(108,99,255,0.45);}' +
    '50%{box-shadow:0 10px 34px rgba(108,99,255,0.75);}}';
  document.head.appendChild(style);

  // Chat iframe, hidden by default
  var iframe = document.createElement('iframe');
  iframe.src = botUrl + '/widget/chat.html';
  iframe.title = 'Book help chat';
  iframe.style.cssText =
    'position:fixed;bottom:92px;right:22px;width:370px;height:540px;max-width:92vw;' +
    'max-height:75vh;border:none;border-radius:20px;box-shadow:0 16px 48px rgba(45,42,69,0.3);' +
    'z-index:999999;display:none;';

  var open = false;
  launcher.addEventListener('click', function () {
    open = !open;
    iframe.style.display = open ? 'block' : 'none';
    launcher.innerHTML = open ? '&#10005;' : '&#129302;';
  });

  document.body.appendChild(iframe);
  document.body.appendChild(launcher);
})();
