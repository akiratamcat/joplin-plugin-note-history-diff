/* global webviewApi */
// Runs inside the Note History Diff view. Buttons carry a data-action
// attribute ("refresh", "close"); the plugin handles the action.
//
// It also tells the plugin when the view becomes visible ("shown"): Joplin
// does not always send an update when the user shows the view with its
// "toggle editor" button (v0.3.4 test), and a hidden view has no size.
(function() {
	document.addEventListener('click', function(event) {
		// F3: switch the layout at once; the plugin remembers the choice.
		const modeButton = event.target && event.target.closest ? event.target.closest('[data-mode]') : null;
		if (modeButton) {
			const mode = modeButton.getAttribute('data-mode');
			const root = document.querySelector('.nhd');
			if (root) {
				root.classList.remove('mode-side', 'mode-unified');
				root.classList.add('mode-' + mode);
			}
			document.querySelectorAll('[data-mode]').forEach(function(button) {
				button.classList.toggle('active', button === modeButton);
			});
			webviewApi.postMessage({ type: 'mode', mode: mode });
			return;
		}
		const target = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
		if (!target) return;
		webviewApi.postMessage({ type: target.getAttribute('data-action') });
	});

	// F2: picking another version sends both sides; the plugin recomputes the diff.
	document.addEventListener('change', function(event) {
		const target = event.target;
		if (!target || !target.matches || !target.matches('select[data-select]')) return;
		const from = document.querySelector('select[data-select="from"]');
		const to = document.querySelector('select[data-select="to"]');
		if (!from || !to) return;
		webviewApi.postMessage({ type: 'select', from: from.value, to: to.value });
	});

	// Marks a dark Joplin theme on <html>, from the brightness of Joplin's
	// background colour, so that the stylesheet can use stronger colours.
	function updateTheme() {
		const probe = document.createElement('div');
		probe.style.backgroundColor = 'var(--joplin-background-color, #ffffff)';
		document.body.appendChild(probe);
		const match = getComputedStyle(probe).backgroundColor.match(/[0-9.]+/g);
		probe.remove();
		if (!match || match.length < 3) return;
		const luminance = 0.2126 * Number(match[0]) + 0.7152 * Number(match[1]) + 0.0722 * Number(match[2]);
		document.documentElement.classList.toggle('nhd-dark', luminance < 128);
	}

	let visible = false;
	function setVisible(now) {
		if (now && !visible) {
			// The theme may have changed while the view was hidden.
			updateTheme();
			webviewApi.postMessage({ type: 'shown' });
		}
		visible = now;
	}
	function checkSize() {
		const root = document.documentElement;
		setVisible(root.clientWidth > 0 && root.clientHeight > 0);
	}
	function start() {
		updateTheme();
		if (typeof ResizeObserver !== 'undefined') new ResizeObserver(checkSize).observe(document.documentElement);
		if (typeof IntersectionObserver !== 'undefined') {
			new IntersectionObserver(function(entries) {
				setVisible(entries.some(function(entry) { return entry.isIntersecting; }));
			}).observe(document.body);
		}
		checkSize();
	}
	if (document.body) start();
	else document.addEventListener('DOMContentLoaded', start);
})();
