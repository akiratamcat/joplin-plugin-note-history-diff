/* global webviewApi */
// Runs inside the Note History Diff view. Buttons carry a data-action
// attribute ("refresh", "close"); the plugin handles the action.
//
// It also tells the plugin when the view becomes visible ("shown"): Joplin
// does not always send an update when the user shows the view with its
// "toggle editor" button (v0.3.4 test), and a hidden view has no size.
(function() {
	document.addEventListener('click', function(event) {
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

	let visible = false;
	function setVisible(now) {
		if (now && !visible) webviewApi.postMessage({ type: 'shown' });
		visible = now;
	}
	function checkSize() {
		const root = document.documentElement;
		setVisible(root.clientWidth > 0 && root.clientHeight > 0);
	}
	function start() {
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
