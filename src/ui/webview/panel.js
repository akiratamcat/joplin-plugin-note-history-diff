/* global webviewApi */
// Runs inside the Note History Diff view. Buttons carry a data-action
// attribute ("refresh", "close"); the plugin handles the action.
//
// It also tells the plugin when the view becomes visible ("shown"): Joplin
// does not always send an update when the user shows the view with its
// "toggle editor" button (v0.3.4 test), and a hidden view has no size.
(function() {
	// F7: the first line of each block of changes in the layout on screen.
	function visibleHunks() {
		const selectors = ['.view-sbs', '.view-unified'];
		for (let i = 0; i < selectors.length; i++) {
			const view = document.querySelector(selectors[i]);
			if (view && view.offsetParent !== null) return Array.prototype.slice.call(view.querySelectorAll('.hunk'));
		}
		return [];
	}

	// Scrolls to the next or previous block of changes, leaving a few lines of
	// context above it, and flashes it. Near the end (or the start) the view
	// cannot scroll any further, so the block jumped to last is remembered:
	// while it is on screen, the next press moves on from it even though the
	// view does not move (v0.7.1 test).
	const JUMP_MARGIN = 48;
	let lastTarget = null;
	function jump(direction) {
		const scroller = document.querySelector('.nhd > .body');
		const hunks = visibleHunks();
		if (!scroller || !hunks.length) return;
		const top = scroller.getBoundingClientRect().top;
		const offset = function(hunk) { return hunk.getBoundingClientRect().top - top - JUMP_MARGIN; };
		let index = -1;
		const lastIndex = lastTarget ? hunks.indexOf(lastTarget) : -1;
		const lastOnScreen = lastIndex >= 0 && offset(lastTarget) + JUMP_MARGIN >= 0 && offset(lastTarget) + JUMP_MARGIN < scroller.clientHeight;
		if (lastOnScreen) {
			index = direction === 'next' ? lastIndex + 1 : lastIndex - 1;
		} else if (direction === 'next') {
			index = hunks.findIndex(function(hunk) { return offset(hunk) > 2; });
		} else {
			for (let i = hunks.length - 1; i >= 0; i--) {
				if (offset(hunks[i]) < -2) {
					index = i;
					break;
				}
			}
		}
		if (index < 0 || index >= hunks.length) return;
		const target = hunks[index];
		scroller.scrollTop += offset(target);
		target.classList.remove('jump-target');
		void target.offsetWidth;
		target.classList.add('jump-target');
		lastTarget = target;
	}

	document.addEventListener('click', function(event) {
		const jumpButton = event.target && event.target.closest ? event.target.closest('[data-jump]') : null;
		if (jumpButton) {
			jump(jumpButton.getAttribute('data-jump'));
			return;
		}
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
		// F9: the plugin recomputes the diff with or without whitespace differences.
		if (target && target.matches && target.matches('input[data-toggle="whitespace"]')) {
			webviewApi.postMessage({ type: 'whitespace', ignore: !!target.checked });
			return;
		}
		if (!target || !target.matches || !target.matches('select[data-select]')) return;
		const from = document.querySelector('select[data-select="from"]');
		const to = document.querySelector('select[data-select="to"]');
		if (!from || !to) return;
		webviewApi.postMessage({ type: 'select', from: from.value, to: to.value });
	});

	// Issue #1: in the side-by-side layout every row holds a left cell then a
	// right cell, so a selection over several rows takes both sides, and the
	// copied text mixed the two versions. The side where the mouse is pressed
	// becomes the only selectable one (CSS: .select-left / .select-right), and a
	// copy takes the selected text of that side only: one line per cell, without
	// the line numbers, the cells of lines missing on that side, or the folded
	// lines ("… n unchanged lines …", skipped).
	function sideOf(node) {
		const element = node && (node.nodeType === 1 ? node : node.parentElement);
		const cell = element && element.closest ? element.closest('.sbs .cell, .sbs .no') : null;
		if (!cell) return null;
		return cell.classList.contains('right') ? 'right' : cell.classList.contains('left') ? 'left' : null;
	}

	document.addEventListener('mousedown', function(event) {
		if (event.button !== 0) return;
		const side = sideOf(event.target);
		document.querySelectorAll('.sbs').forEach(function(sbs) {
			sbs.classList.toggle('select-left', side === 'left');
			sbs.classList.toggle('select-right', side === 'right');
		});
	});

	document.addEventListener('copy', function(event) {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
		const sbs = document.querySelector('.view-sbs .sbs');
		if (!sbs || sbs.offsetParent === null) return;
		const side = sbs.classList.contains('select-right') ? 'right' : sbs.classList.contains('select-left') ? 'left' : null;
		if (!side) return;
		const range = selection.getRangeAt(0);
		const lines = [];
		sbs.querySelectorAll('.cell.' + side).forEach(function(cell) {
			if (cell.classList.contains('empty') || !range.intersectsNode(cell)) return;
			const part = document.createRange();
			part.selectNodeContents(cell);
			// The first and the last cell may be selected only in part.
			if (cell.contains(range.startContainer) && range.compareBoundaryPoints(Range.START_TO_START, part) > 0) {
				part.setStart(range.startContainer, range.startOffset);
			}
			if (cell.contains(range.endContainer) && range.compareBoundaryPoints(Range.END_TO_END, part) < 0) {
				part.setEnd(range.endContainer, range.endOffset);
			}
			lines.push(part.toString());
		});
		if (!lines.length || !event.clipboardData) return;
		event.clipboardData.setData('text/plain', lines.join('\n'));
		event.preventDefault();
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
